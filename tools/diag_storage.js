// 观察 uni-app x web 端 localStorage 存储格式：node tools/diag_storage.js
const { chromium } = require('./playwright');
const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage();

  await page.route('**/webapi/**', (route) => {
    const u = new URL(route.request().url());
    const api = u.searchParams.get('api') || '';
    const method = u.searchParams.get('method') || '';
    const json = (obj) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
    if (u.pathname.includes('query.cgi')) {
      return json({ data: {
        'SYNO.API.Auth': { maxVersion: 7, minVersion: 1, path: 'entry.cgi' },
        'SYNO.FileStation.List': { maxVersion: 2, minVersion: 1, path: 'entry.cgi' },
      }, success: true });
    }
    if (api === 'SYNO.API.Auth' && method === 'login') return json({ data: { sid: 'mock_sid', did: 'mock_did' }, success: true });
    if (api === 'SYNO.Foto.Thumbnail') return route.fulfill({ status: 200, contentType: 'image/png', body: png1x1 });
    return json({ data: {}, success: true });
  });

  await page.goto('http://localhost:8091/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.locator('input').nth(2).fill('tester');
  await page.locator('input').nth(3).fill('testpass');
  await page.click('text=登录');
  await page.waitForTimeout(2500);

  const storage = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out[k] = (localStorage.getItem(k) || '').slice(0, 400);
    }
    return out;
  });
  console.log(JSON.stringify(storage, null, 2));
  await browser.close();
})();
