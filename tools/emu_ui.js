// 模拟器 UI 自动化小工具（基于 HBuilderX 自带 adb + uiautomator）
// 用法：
//   node tools/emu_ui.js launch              # 启动应用
//   node tools/emu_ui.js dump                # 打印界面元素（文本 + 坐标）
//   node tools/emu_ui.js tap "文本"           # 按文本点击（模糊包含）
//   node tools/emu_ui.js tapxy 540 1200      # 按坐标点击
//   node tools/emu_ui.js type "abc"          # 输入文本（仅 ASCII 安全）
//   node tools/emu_ui.js key 4               # 发送按键（4=返回, 3=Home）
//   node tools/emu_ui.js shot name           # 截图到 test/artifacts/emu_<name>.png
//   node tools/emu_ui.js crash               # 打印崩溃缓冲区
//   node tools/emu_ui.js log [过滤词]         # 打印主日志尾部
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// adb 路径可用 ADB_PATH 覆盖：
// HBuilderX 自带 adb 与 MuMu 自带 adb 会互踢 server，模拟器上用 MuMu 的更稳
const ADB = process.env.ADB_PATH || 'D:/code/HBuilderX/plugins/launcher-tools/tools/adbs/adb.exe';
const PKG = 'cn.zy.qunhui';
const ART = path.resolve(__dirname, '..', 'test', 'artifacts');
const SERIAL = process.env.ANDROID_SERIAL || '';

function adb(args, opts = {}) {
  const full = SERIAL ? ['-s', SERIAL].concat(args) : args;
  return execFileSync(ADB, full, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}

// 每进程独立 adb server（沙箱里 daemon 不跨命令存活）→ 启动时先 connect 一次，幂等
if (SERIAL.indexOf(':') > 0) {
  try {
    execFileSync(ADB, ['connect', SERIAL], { encoding: 'utf8' });
  } catch (e) {
    // 连接失败留给后续命令报错
  }
}
function sh(cmd) {
  return adb(['shell', cmd]);
}

/** 解析 uiautomator dump 得到元素列表 */
function uiNodes() {
  sh('uiautomator dump /sdcard/ui.xml >/dev/null 2>&1');
  const xml = sh('cat /sdcard/ui.xml');
  const nodes = [];
  const re = /<node\b[^>]*>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0];
    const get = (k) => {
      const mm = tag.match(new RegExp(k + '="([^"]*)"'));
      return mm ? mm[1] : '';
    };
    const b = get('bounds');
    const bm = b.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!bm) continue;
    const [x1, y1, x2, y2] = [ +bm[1], +bm[2], +bm[3], +bm[4] ];
    nodes.push({
      text: get('text'),
      desc: get('content-desc'),
      cls: get('class'),
      clickable: get('clickable') === 'true',
      cx: Math.round((x1 + x2) / 2),
      cy: Math.round((y1 + y2) / 2),
      x1, y1, x2, y2,
    });
  }
  return nodes;
}

const cmd = process.argv[2] || 'dump';
try {
  if (cmd === 'launch') {
    sh(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
    console.log('已启动 ' + PKG);
  } else if (cmd === 'dump') {
    const nodes = uiNodes().filter((n) => n.text || n.desc || n.clickable);
    nodes.forEach((n) => {
      const label = (n.text || n.desc || n.cls.split('.').pop()).replace(/\n/g, ' ');
      console.log(`${String(n.cx).padStart(4)},${String(n.cy).padStart(4)}  ${n.clickable ? '[可点]' : '      '} ${label}`);
    });
    if (!nodes.length) console.log('(无文本元素，可能是原生渲染页面，请用 shot 截图查看)');
  } else if (cmd === 'tap') {
    const want = process.argv[3] || '';
    const nodes = uiNodes().filter((n) => (n.text + n.desc).includes(want));
    if (!nodes.length) {
      console.log('未找到含「' + want + '」的元素');
      process.exit(2);
    }
    const n = nodes[0];
    sh(`input tap ${n.cx} ${n.cy}`);
    console.log(`点击「${n.text || n.desc}」(${n.cx},${n.cy})`);
  } else if (cmd === 'tapxy') {
    sh(`input tap ${process.argv[3]} ${process.argv[4]}`);
    console.log('已点击 ' + process.argv[3] + ',' + process.argv[4]);
  } else if (cmd === 'type') {
    const s = String(process.argv[3] || '');
    // input text 不支持中文与部分符号，统一转义
    const escaped = s.replace(/(["\\$])/g, '\\$1').replace(/ /g, '%s');
    sh('input text "' + escaped + '"');
    console.log('已输入: ' + s);
  } else if (cmd === 'key') {
    sh(`input keyevent ${process.argv[3] || 4}`);
    console.log('按键 ' + (process.argv[3] || 4));
  } else if (cmd === 'shot') {
    const name = process.argv[3] || 'shot';
    fs.mkdirSync(ART, { recursive: true });
    const out = path.join(ART, 'emu_' + name + '.png');
    const buf = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(out, buf);
    console.log('截图: ' + out + ' (' + Math.round(buf.length / 1024) + 'KB)');
  } else if (cmd === 'crash') {
    console.log(adb(['logcat', '-b', 'crash', '-d', '-t', '200']));
  } else if (cmd === 'log') {
    const filter = process.argv[3] || '';
    const out = adb(['logcat', '-d', '-v', 'time', '-t', '400']);
    const lines = out.split('\n').filter((l) => !filter || l.includes(filter));
    console.log(lines.slice(-60).join('\n'));
  } else {
    console.log('未知命令: ' + cmd);
  }
} catch (e) {
  console.error('执行失败: ' + (e.stderr || e.message));
  process.exit(1);
}
