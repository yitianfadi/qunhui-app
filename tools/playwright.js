// 统一的 Playwright 加载器 —— 避免在仓库里硬编码本机 node_modules 绝对路径
//
// 查找顺序：
//   1. 环境变量 PLAYWRIGHT_PATH（指向 playwright 包目录）
//   2. 常规依赖：playwright / playwright-core / @playwright/test
//   3. IDE / 工具链自带的 playwright（按通配扫描，不写死版本号与用户名）
//
// 用法：const { chromium } = require('./playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

function candidates() {
  const list = [];
  if (process.env.PLAYWRIGHT_PATH) list.push(process.env.PLAYWRIGHT_PATH);
  list.push('playwright', 'playwright-core', '@playwright/test');

  // 工具链内置的 playwright：扫 ~/.workbuddy/binaries/node/versions/<ver>/node_modules/...
  const bases = [
    path.join(os.homedir(), '.workbuddy', 'binaries', 'node', 'versions'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
  ];
  for (const base of bases) {
    let dirs = [];
    try {
      dirs = fs.readdirSync(base);
    } catch (e) {
      continue;
    }
    for (const d of dirs) {
      list.push(path.join(base, d, 'node_modules', '@playwright', 'cli', 'node_modules', 'playwright'));
      list.push(path.join(base, d, 'node_modules', 'playwright'));
    }
  }
  return list;
}

let mod = null;
const tried = [];
for (const c of candidates()) {
  try {
    mod = require(c);
    break;
  } catch (e) {
    tried.push(c);
  }
}

if (!mod) {
  console.error(
    '[playwright] 未找到 playwright，请任选一种方式：\n' +
      '  1) 项目内安装：npm i -D playwright && npx playwright install chromium\n' +
      '  2) 指定路径：set PLAYWRIGHT_PATH=D:\\path\\to\\node_modules\\playwright\n' +
      '已尝试：\n  ' + tried.join('\n  ')
  );
  process.exit(1);
}

module.exports = mod;
