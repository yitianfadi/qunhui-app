// 开发代理（Node 版）：让 Web 版客户端在浏览器里能跨域调用 DSM Web API
//
// 用法：node tools/dev_proxy.js <NAS_IP|QuickConnectID> [NAS_PORT] [代理端口] [静态目录]
// 示例：
//   node tools/dev_proxy.js 192.168.1.100 5000 8091 uniappx/unpackage/dist/build/web   # 直连
//   node tools/dev_proxy.js abcdefg123 "" 8091 uniappx/unpackage/dist/build/web      # QuickConnect
//
// 功能：
//   1. /webapi、/webman、/photo → 转发到 NAS 目标（支持多候选自动轮换：LAN → WAN → 中继）
//   2. /__qc/resolve?qid=<QuickConnectID>&ip=<IP>&port=<端口>
//      → 服务端解析 QuickConnect，设置转发候选列表，供 Web 版登录前调用
//   3. 其余路径静态托管 [静态目录]
//   4. 所有响应注入 CORS 头，处理 OPTIONS 预检
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const argHost = process.argv[2] || '192.168.1.10';
const argPort = parseInt(process.argv[3] || '5000', 10);
const proxyPort = parseInt(process.argv[4] || '8091', 10);
const webRoot = process.argv[5] || 'uniappx/unpackage/dist/build/web';

// CLI 主机参数若为纯字母数字且无点号 → 视为 QuickConnect ID
const isQid = /^[a-z0-9]{4,15}$/i.test(argHost) && !argHost.includes('.');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

// ---------------- 转发候选目标（自动轮换） ----------------

// { label, host, port, https }
let targets = isQid ? [] : [{ label: 'CLI直连', host: argHost, port: argPort, https: false }];
let targetIdx = 0;

function targetUrl(t, reqPath) {
  return `${t.https ? 'https' : 'http'}://${t.host}:${t.port}${reqPath}`;
}

function rotateTarget() {
  if (targets.length > 0) targetIdx = (targetIdx + 1) % targets.length;
  return targets[targetIdx];
}

// ---------------- QuickConnect 服务端解析 ----------------

function postJson(url, body, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
        timeout: timeoutMs,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            reject(new Error('QC 响应非 JSON: ' + buf.slice(0, 100)));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('QC 请求超时')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch (e) {
          reject(new Error('QC 响应非 JSON: ' + buf.slice(0, 100)));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('QC 请求超时')));
    req.on('error', reject);
    req.end();
  });
}

/** 请求 QuickConnect 隧道：CN Serv.php → Intl Serv.php → Intl v2 */
async function qcTunnel(qid) {
  const body = { version: 1, id: 'dsm', serverID: qid, platform: 'Web', command: 'request_tunnel' };
  const lastErrors = [];
  for (const h of ['https://global.quickconnect.cn/Serv.php', 'https://global.quickconnect.com/Serv.php']) {
    try {
      const t = await postJson(h, body);
      if (t && t.errno === 0 && (t.service || t.smartdns)) return { kind: 'cn', tunnel: t };
      lastErrors.push(`${h}: errno=${t && t.errno}`);
    } catch (e) {
      lastErrors.push(`${h}: ${e.message}`);
    }
  }
  try {
    const r = await getJson(
      `https://cnc.synology.com/api/v2/quickconnect?command=request_tunnel&version=1&id=${encodeURIComponent(qid)}`
    );
    if (r && r.success === true) return { kind: 'intl', tunnel: r };
    lastErrors.push('cnc.synology.com v2: success=false');
  } catch (e) {
    lastErrors.push(`cnc.synology.com v2: ${e.message}`);
  }
  throw new Error('QuickConnect 解析失败（' + lastErrors.join(' | ') + '）');
}

/** 从隧道响应提取候选端点（与 syno.uts 逻辑一致：LAN → WAN → 中继 → 门户兜底） */
function candidatesFrom(kind, tunnel, qid) {
  const list = [];
  if (kind === 'intl') {
    const data = tunnel.data || {};
    for (const s of data.services || []) {
      if (s.dn !== 'dsm') continue;
      for (const u of s.url || []) {
        if (typeof u === 'string' && u.length > 0) {
          const [h, p] = u.split(':');
          list.push({ label: 'WAN直连', host: h, port: parseInt(p || '5000', 10), https: false });
        }
      }
      for (const r of s.relay_dns || []) {
        if (typeof r === 'string' && r.length > 0) {
          list.push({ label: 'QuickConnect中继', host: r, port: s.port > 0 ? s.port : 443, https: true });
        }
      }
    }
    if (list.length === 0) {
      list.push({ label: 'QC门户', host: `${qid}.quickconnect.com`, port: 443, https: true });
    }
    return list;
  }
  // CN
  const service = tunnel.service || {};
  const smart = tunnel.smartdns || {};
  const dsmPort = service.port > 0 ? service.port : 5000;
  for (const h of smart.lan || []) {
    if (typeof h === 'string' && h.length > 0) {
      list.push({ label: 'LAN直连', host: h, port: dsmPort, https: false });
    }
  }
  if (typeof smart.host === 'string' && smart.host.length > 0) {
    list.push({ label: 'WAN直连', host: smart.host, port: dsmPort, https: false });
  }
  if (typeof service.relay_dn === 'string' && service.relay_dn.length > 0) {
    list.push({
      label: 'QuickConnect中继',
      host: service.relay_dn,
      port: service.relay_port > 0 ? service.relay_port : 443,
      https: true,
    });
  }
  list.push({ label: 'QC门户', host: `${qid}.quickconnect.cn`, port: 443, https: true });
  return list;
}

async function handleQcResolve(req, res, query) {
  const params = new URLSearchParams(query);
  const qid = params.get('qid') || '';
  const ip = params.get('ip') || '';
  const port = parseInt(params.get('port') || '0', 10);
  try {
    const list = [];
    if (ip.length > 0) {
      list.push({ label: '直连', host: ip, port: port > 0 ? port : 5000, https: false });
    }
    if (qid.length > 0) {
      const { kind, tunnel } = await qcTunnel(qid);
      list.push(...candidatesFrom(kind, tunnel, qid));
    }
    if (list.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '未提供 QuickConnect ID 或 IP' }));
      return;
    }
    targets = list;
    targetIdx = 0;
    console.log(
      `[QC] 解析成功 qid=${qid || '-'} ip=${ip || '-'} → 候选: ${list
        .map((t) => `${t.label}=${targetUrl(t, '')}`)
        .join(', ')}`
    );
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, candidates: list.map((t) => ({ label: t.label, url: targetUrl(t, '') })) }));
  } catch (e) {
    console.log(`[QC] 解析失败: ${e.message}`);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: e.message }));
  }
}

// ---------------- 转发（带候选轮换） ----------------

function proxy(req, res, bodyBuf) {
  const tryTargets = [];
  for (let i = 0; i < targets.length; i++) {
    tryTargets.push(targets[(targetIdx + i) % targets.length]);
  }
  if (tryTargets.length === 0) tryTargets.push({ label: '-', host: argHost, port: argPort, https: false });

  let lastErr = null;
  const attempt = (idx) => {
    if (idx >= tryTargets.length) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          success: false,
          proxy_error: `所有候选目标均不可达（${lastErr ? lastErr.message : '未知'}）。候选: ${tryTargets
            .map((t) => targetUrl(t, ''))
            .join(', ')}`,
        })
      );
      return;
    }
    const t = tryTargets[idx];
    const mod = t.https ? https : http;
    const forward = mod.request(
      targetUrl(t, req.url),
      {
        method: req.method,
        headers: { 'User-Agent': 'QunHuiApp-Proxy/1.0', Host: t.host },
        timeout: 30000,
        rejectUnauthorized: false,
      },
      (upstream) => {
        targetIdx = targets.indexOf(t) >= 0 ? targets.indexOf(t) : targetIdx;
        res.writeHead(upstream.statusCode || 502, {
          'Content-Type': upstream.headers['content-type'] || 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        upstream.pipe(res);
      }
    );
    forward.on('timeout', () => forward.destroy(new Error(`目标超时 ${targetUrl(t, '')}`)));
    forward.on('error', (e) => {
      console.log(`[转发] ${t.label} ${targetUrl(t, req.url)} 失败: ${e.message} → 轮换下一候选`);
      lastErr = e;
      attempt(idx + 1);
    });
    if (bodyBuf.length > 0) forward.write(bodyBuf);
    forward.end();
  };
  attempt(0);
}

function serveStatic(req, res) {
  if (!fs.existsSync(webRoot)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`静态目录 ${webRoot} 不存在，请先构建前端`);
    return;
  }
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  let file = path.join(webRoot, urlPath);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA 回退
    file = path.join(webRoot, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, Content-Type, Accept, Authorization, X-Requested-With, User-Agent'
  );
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const qi = req.url.indexOf('?');
  const route = qi >= 0 ? req.url.substring(0, qi) : req.url;
  const query = qi >= 0 ? req.url.substring(qi + 1) : '';

  if (route === '/__qc/resolve') {
    handleQcResolve(req, res, query);
    return;
  }
  if (route.startsWith('/webapi') || route.startsWith('/webman') || route.startsWith('/photo')) {
    // 先缓冲请求体，便于失败后换目标重试
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => proxy(req, res, Buffer.concat(chunks)));
    return;
  }
  serveStatic(req, res);
});

server.listen(proxyPort, '127.0.0.1', () => {
  console.log(`✅ 开发代理已启动: http://localhost:${proxyPort}`);
  if (isQid) {
    console.log(`   QuickConnect 模式: ${argHost}（启动时解析候选）`);
    qcTunnel(argHost)
      .then(({ kind, tunnel }) => {
        targets = candidatesFrom(kind, tunnel, argHost);
        console.log(
          `   QC 候选: ${targets.map((t) => `${t.label}=${targetUrl(t, '')}`).join(', ')}`
        );
      })
      .catch((e) => console.log(`   ⚠️ QC 启动解析失败: ${e.message}（登录时会自动重试）`));
  } else {
    console.log(`   NAS 转发目标: http://${argHost}:${argPort}`);
  }
  console.log(`   静态目录: ${webRoot}`);
  console.log(`   QC 解析端点: http://localhost:${proxyPort}/__qc/resolve?qid=<QuickConnectID>`);
});
