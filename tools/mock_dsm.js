// 本地假 DSM：用来在没有真机 NAS 的情况下验证「上传」链路
//
// 目的：
//  1) 记录 multipart 各字段的**实际排列顺序**（真 DSM 要求 path 等参数出现在文件段之前，
//     否则返回 101），从而判断 uni.uploadFile 能不能直接用；
//  2) 记录请求头（Content-Type 是否带 charset，真 DSM 对此敏感）；
//  3) 支持大文件（只做流式扫描，不整包缓存）。
//
// 用法：node tools/mock_dsm.js [端口]
//      默认 8899，监听 0.0.0.0
//
// App 里登录时把地址填成 http://<PC 局域网 IP>:8899 即可。

const http = require('http');

const PORT = Number(process.argv[2] || 8899);

/** 模拟 NAS 上的目录结构 */
const DIRS = {
  '/': [{ name: 'photo', isdir: true }, { name: 'home', isdir: true }],
  '/photo': [{ name: '2026', isdir: true }],
  '/home': [{ name: 'ui.xml', isdir: false, size: 14498 }],
};

const APIS = [
  'SYNO.API.Auth', 'SYNO.FileStation.List', 'SYNO.FileStation.Info',
  'SYNO.FileStation.Download', 'SYNO.FileStation.Upload', 'SYNO.FileStation.Thumb',
  'SYNO.FileStation.CreateFolder', 'SYNO.FileStation.Rename', 'SYNO.FileStation.Delete',
  'SYNO.FileStation.Share', 'SYNO.DownloadStation.Info', 'SYNO.DownloadStation.Task',
  'SYNO.Foto.Browse.Item', 'SYNO.Foto.Browse.Folder', 'SYNO.Foto.Browse.Album',
  'SYNO.Foto.Thumbnail', 'SYNO.Foto.Download', 'SYNO.FotoTeam.Browse.Item',
];

function apiTable() {
  const t = {};
  for (const name of APIS) {
    t[name] = {
      path: name === 'SYNO.API.Auth' ? 'auth.cgi' : 'entry.cgi',
      minVersion: 1,
      maxVersion: name === 'SYNO.API.Auth' ? 7 : 2,
    };
  }
  return t;
}

/** 扫描 multipart：按出现顺序返回 [{name, filename, bodySize}] */
function scanParts(buf, boundary) {
  const parts = [];
  const sep = Buffer.from('--' + boundary);
  let i = 0;
  while (true) {
    const s = buf.indexOf(sep, i);
    if (s < 0) break;
    const after = buf.indexOf('\r\n\r\n', s);
    if (after < 0) break;
    const head = buf.slice(s + sep.length, after).toString('utf8');
    if (head.indexOf('--') === 0) break; // 结束边界
    const nameM = head.match(/name="([^"]*)"/);
    const fileM = head.match(/filename="([^"]*)"/);
    const next = buf.indexOf(sep, after);
    parts.push({
      name: nameM ? nameM[1] : '',
      filename: fileM ? fileM[1] : '',
      headerLines: head.replace(/\r\n/g, ' | ').trim(),
      bodySize: next > 0 ? next - after - 4 : -1,
    });
    i = after;
  }
  return parts;
}

function sendJson(res, obj, code = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset="UTF-8"' });
  res.end(body);
}

function listData(pathname) {
  const items = DIRS[pathname] || [];
  const now = Math.floor(Date.now() / 1000);
  return {
    total: items.length,
    offset: 0,
    files: items.map((it) => ({
      name: it.name,
      path: (pathname === '/' ? '' : pathname) + '/' + it.name,
      isdir: it.isdir,
      additional: { size: it.size || 0, time: { mtime: now } },
    })),
  };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const q = u.searchParams;
  const api = q.get('api') || '';
  const method = q.get('method') || '';

  if (api === 'SYNO.API.Info' || u.pathname.endsWith('query.cgi')) {
    sendJson(res, { data: apiTable(), success: true });
    return;
  }

  if (api === 'SYNO.API.Auth') {
    if (method === 'login') {
      sendJson(res, { data: { sid: 'MOCKSID123456', did: '' }, success: true });
    } else {
      sendJson(res, { data: {}, success: true });
    }
    return;
  }

  if (api === 'SYNO.FileStation.Upload') {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      // 头部分析只需要前 1MB，之后只计数
      if (total <= 1024 * 1024) chunks.push(c);
    });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      // 把请求头 + 前 2KB 原文落盘，方便和 curl/自拼报文对比差异
      try {
        const fs = require('fs');
        fs.writeFileSync(
          require('path').join(__dirname, '..', '_mock_raw.txt'),
          JSON.stringify(req.headers, null, 1) + '\n=====BODY=====\n' +
            buf.slice(0, 2048).toString('latin1')
        );
      } catch (e) {
        // 忽略
      }
      const ct = req.headers['content-type'] || '';
      const bm = ct.match(/boundary=([^;]+)/);
      const boundary = bm ? bm[1].replace(/^"|"$/g, '') : '';
      const parts = boundary ? scanParts(buf, boundary) : [];
      const order = parts.map((p) => (p.filename ? p.name + '(file:' + p.filename + ')' : p.name));
      const fileIdx = parts.findIndex((p) => p.filename);
      const pathIdx = parts.findIndex((p) => p.name === 'path');
      const bad = fileIdx >= 0 && pathIdx > fileIdx;

      console.log('\n===== UPLOAD =====');
      console.log('URL     :', req.url);
      console.log('CT      :', ct);
      console.log('Cookie  :', req.headers.cookie || '(none)');
      console.log('总字节  :', total, '（分析前', buf.length, '字节）');
      console.log('字段顺序:', order.join(' -> '));
      console.log('参数在文件段之后:', bad ? '是 → 返回 101（真 DSM 会拒绝）' : '否 → ok');
      for (const p of parts) {
        if (p.filename) console.log('文件段头:', p.headerLines);
      }

      if (bad) {
        sendJson(res, { error: { code: 101 }, success: false });
      } else {
        sendJson(res, { data: { blSkip: true }, success: true });
      }
    });
    return;
  }

  if (api === 'SYNO.FileStation.List') {
    const p = q.get('folder_path') || '/';
    if (method === 'list_share') {
      sendJson(res, {
        success: true,
        data: { total: 2, files: listData('/').files },
      });
      return;
    }
    sendJson(res, { success: true, data: listData(p) });
    return;
  }

  // 其它 API 一律成功，够 App 跑通页面
  sendJson(res, { success: true, data: {} });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('mock DSM listening on http://0.0.0.0:' + PORT);
  console.log('App 登录地址请填 http://<本机局域网IP>:' + PORT);
});
