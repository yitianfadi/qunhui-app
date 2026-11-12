// 文件 tab 短测试（sid 从 nas_sid.txt 读取）：node tools/files_e2e.js
const { chromium } = require('./playwright');
const fs = require('fs');

(async () => {
  const SID = fs.readFileSync('nas_sid.txt', 'utf8').trim();
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage();
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('webapi')) {
      let body = '';
      try { body = (await r.text()).replace(/\s+/g, ' ').slice(0, 200); } catch (e) { body = '(read fail)'; }
      console.log('[NET] ' + decodeURIComponent(u).slice(0, 200) + '\n     └ ' + body);
    }
  });

  await page.addInitScript((sid) => {
    localStorage.setItem('syno_api_state', JSON.stringify({
      baseUrl: 'http://localhost:8091',
      pathPrefix: '/webapi',
      sid: sid,
      password: '',
      account: { id: 'nas', name: 'NAS', protocol: 'http', host: 'localhost', port: 8091, username: 'tester' },
    }));
  }, SID);

  await page.goto('http://localhost:8091/', { waitUntil: 'load' });
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    if ((await page.locator('.tab-item').count()) >= 4) break;
  }
  // 等待列表渲染（含 GET→POST 回退链耗时），轮询最多 20 秒
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    if ((await page.locator('.file-row').count()) > 0) break;
  }
  await page.waitForTimeout(1000);
  const rows = await page.locator('.file-row').count();
  const names = await page.locator('.file-name').allTextContents();
  const err = await page.locator('.text-error').textContent().catch(() => '');
  console.log('共享目录行数:', rows);
  console.log('目录名:', JSON.stringify(names));
  console.log('错误文本:', (err || '').trim().slice(0, 300));
  await page.screenshot({ path: 'test/artifacts/real_files.png' });

  // 进入第一个目录
  if (rows > 0) {
    await page.locator('.file-row').first().click();
    await page.waitForTimeout(3500);
    const innerRows = await page.locator('.file-row').count();
    const innerNames = await page.locator('.file-name').allTextContents();
    const innerErr = await page.locator('.text-error').textContent().catch(() => '');
    console.log('子目录条目:', innerRows, JSON.stringify(innerNames.slice(0, 10)));
    console.log('子目录错误:', (innerErr || '').trim().slice(0, 300));
    await page.screenshot({ path: 'test/artifacts/real_files_sub.png' });
  }
  await browser.close();
})();
