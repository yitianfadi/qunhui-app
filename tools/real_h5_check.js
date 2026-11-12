// 真实 NAS 的 H5 冒烟测试：验证登录 + 文件列表（POST-JSON 直连链路）
// 用法：先写密码到 _pw.tmp，再 node tools/real_h5_check.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('./playwright');

const BASE = process.env.H5_BASE || 'http://localhost:8091';
const USER = process.env.NAS_USER || 'admin';
const PW_FILE = path.resolve(__dirname, '..', '_pw.tmp');

(async () => {
  const pass = fs.readFileSync(PW_FILE, 'utf8').trim();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  const netlog = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('/webapi/')) netlog.push(r.request().method() + ' ' + r.status() + ' ' + u.replace(/[?&]_sid=[^&]*/, '').slice(0, 110));
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(3500);

  // 主机/端口已由 Web 端预填；依次填 用户名、密码（QC 输入框为空时被隐藏或忽略）
  const inputs = page.locator('input');
  const n = await inputs.count();
  const vals = [];
  for (let i = 0; i < n; i++) vals.push(await inputs.nth(i).inputValue().catch(() => ''));
  console.log('输入框快照:', JSON.stringify(vals));

  // 找用户名与密码框：用户名是空且不是 localhost/8091，密码是 type=password
  let userIdx = -1;
  for (let i = 0; i < n; i++) {
    if (vals[i] === '' && i >= 1) { userIdx = i; break; }
  }
  if (userIdx >= 0) await inputs.nth(userIdx).fill(USER);
  const pwd = page.locator('input[type="password"]');
  if (await pwd.count()) await pwd.first().fill(pass);

  await page.click('text=登录');
  await page.waitForTimeout(9000);

  const ok = await page.locator('text=docker').count();
  const err = await page.locator('.text-error').allTextContents().catch(() => []);
  console.log('文件列表命中 docker:', ok);
  if (err.length) console.log('页面错误:', err.join(' | ').slice(0, 300));
  await page.screenshot({ path: 'test/artifacts/h5_real_files.png' });
  console.log('--- /webapi 请求（前 12 条）---');
  console.log(netlog.slice(0, 12).join('\n'));
  if (errs.length) console.log('JS 错误:', errs.slice(0, 3).join(' | '));
  console.log(ok > 0 ? 'RESULT: PASS' : 'RESULT: FAIL');
  await browser.close();
})();
