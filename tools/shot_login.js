const path = require('path');
const { chromium } = require('./playwright');
(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
  catch (e) { browser = await chromium.launch({ headless: true }); }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:8091/', { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'test/artifacts/login_check.png' });
  const texts = await page.locator('text=连接你的群晖 NAS').boundingBox().catch(() => null);
  const btn = await page.locator('text=登录').first().boundingBox().catch(() => null);
  console.log('title box', JSON.stringify(texts));
  console.log('btn box', JSON.stringify(btn));
  await browser.close();
})();
