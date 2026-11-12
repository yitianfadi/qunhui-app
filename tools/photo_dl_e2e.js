// 照片/下载 tab 真机专项测试（sid 从 nas_sid.txt 读取）
const { chromium } = require('./playwright');
const fs = require('fs');

(async () => {
  const SID = fs.readFileSync('nas_sid.txt', 'utf8').trim();
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage();

  await page.addInitScript((sid) => {
    localStorage.setItem('syno_api_state', JSON.stringify({
      baseUrl: 'http://localhost:8091', pathPrefix: '/webapi', sid: sid, password: '',
      account: { id: 'nas', name: 'NAS', protocol: 'http', host: 'localhost', port: 8091, username: 'tester' },
    }));
  }, SID);

  await page.goto('http://localhost:8091/', { waitUntil: 'load' });
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    if ((await page.locator('.tab-item').count()) >= 4) break;
  }

  // 照片 tab
  await page.click('.tab-item:has-text("照片")');
  let photoCount = 0, photoErr = '';
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    photoCount = await page.locator('.grid-item').count();
    if (photoCount > 0) break;
    const e = await page.locator('.text-error').textContent().catch(() => '');
    if (e && e.trim().length > 0) { photoErr = e.trim(); break; }
  }
  console.log('照片-个人空间: ' + (photoErr ? 'ERROR: ' + photoErr.slice(0, 200) : '正常渲染, 照片数=' + photoCount + (photoCount === 0 ? '（空相册，无报错）' : '')));
  await page.click('text=共享空间');
  let teamErr = '', teamCount = 0;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    teamCount = await page.locator('.grid-item').count();
    if (teamCount > 0) break;
    const e = await page.locator('.text-error').textContent().catch(() => '');
    if (e && e.trim().length > 0) { teamErr = e.trim(); break; }
  }
  console.log('照片-共享空间: ' + (teamErr ? 'ERROR: ' + teamErr.slice(0, 200) : '正常渲染, 照片数=' + teamCount + (teamCount === 0 ? '（空）' : '')));
  await page.screenshot({ path: 'test/artifacts/real_photos.png' });

  // 下载 tab
  await page.click('.tab-item:has-text("下载")');
  await page.waitForTimeout(4000);
  const dlErr = await page.locator('.text-error').textContent().catch(() => '');
  const dlTasks = await page.locator('.task-card').count();
  const dlEmpty = await page.locator('text=暂无下载任务').count();
  console.log('下载 tab: ' + (dlTasks > 0 ? dlTasks + ' 个任务' : (dlErr || '').trim().slice(0, 120) || (dlEmpty > 0 ? '正常渲染，暂无任务' : '状态未知')));
  await page.screenshot({ path: 'test/artifacts/real_downloads.png' });
  await browser.close();
})();
