// 真实 NAS E2E 联调：node tools/real_e2e.js
// 凭据从环境变量读取：NAS_USER / NAS_PASS
const { chromium } = require('./playwright');

const BASE = 'http://localhost:8091';
const USER = process.env.NAS_USER || '';
// 支持拆分传入，避免完整密码出现在命令行
const PASS = process.env.NAS_PASS || (process.env.NAS_PASS_P1 || '') + (process.env.NAS_PASS_P2 || '');

(async () => {
  const results = [];
  const log = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  | ' + detail : ''));
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  // 逐请求日志：记录每个 webapi 请求的状态与响应片段
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('webapi') || u.includes('query.cgi')) {
      let body = '';
      try { body = (await r.text()).replace(/\s+/g, ' ').slice(0, 120); } catch (e) { body = '(read fail)'; }
      console.log('[NET] ' + r.status() + ' ' + decodeURIComponent(u).slice(0, 180) + '\n     └ ' + body);
    }
  });

  try {
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);
    log('登录页加载', (await page.locator('text=连接你的群晖 NAS').count()) > 0);

    const hostVal = await page.locator('input').nth(0).inputValue().catch(() => '');
    const portVal = await page.locator('input').nth(1).inputValue().catch(() => '');
    log('代理地址预填', hostVal === 'localhost' && portVal === '8091', hostVal + ':' + portVal);

    // 登录（真实 NAS）
    await page.locator('input').nth(2).fill(USER);
    await page.locator('input').nth(3).fill(PASS);
    await page.click('text=登录');
    // 等待跳转到主页（tabbar 出现）或错误信息
    let entered = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1000);
      if ((await page.locator('.tab-item').count()) >= 4) { entered = true; break; }
    }
    if (!entered) {
      const err = await page.locator('.text-error, .error-box').first().textContent().catch(() => '（无错误文本）');
      log('真实登录', false, '停留在登录页，错误：' + (err || '').trim().slice(0, 200));
      await page.screenshot({ path: 'test/artifacts/real_login_fail.png' });
    } else {
      log('真实登录（Auth + API 发现）', true);

      // ---- 文件 tab：共享目录 ----
      await page.waitForTimeout(2000);
      const shareRows = await page.locator('.file-row').count();
      const shareNames = await page.locator('.file-name').allTextContents();
      log('文件 tab：共享目录列表', shareRows > 0, shareRows + ' 个: ' + shareNames.slice(0, 8).join(', '));
      await page.screenshot({ path: 'test/artifacts/real_files.png' });

      // 进入第一个目录（如有）
      if (shareRows > 0) {
        await page.locator('.file-row').first().click();
        await page.waitForTimeout(2500);
        const innerRows = await page.locator('.file-row').count();
        const errInDir = await page.locator('.text-error').count();
        log('文件 tab：进入子目录', errInDir === 0 && innerRows >= 0, '条目=' + innerRows + (errInDir ? '（有报错）' : ''));
        await page.screenshot({ path: 'test/artifacts/real_files_sub.png' });
      }

      // ---- 照片 tab ----
      await page.click('.tab-item:has-text("照片")');
      let photosOk = false;
      let photoCount = 0;
      let photoErr = '';
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);
        photoCount = await page.locator('.grid-item').count();
        if (photoCount > 0) { photosOk = true; break; }
        const e = await page.locator('.text-error').textContent().catch(() => '');
        if (e && e.trim().length > 0) { photoErr = e.trim(); break; }
      }
      log('照片 tab：个人空间网格', photosOk, photoCount + ' 张' + (photoErr ? ' 错误:' + photoErr.slice(0, 160) : ''));
      await page.screenshot({ path: 'test/artifacts/real_photos.png' });

      // 共享空间
      await page.click('text=共享空间');
      let teamOk = false;
      let teamErr = '';
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(1000);
        if ((await page.locator('.grid-item').count()) > 0) { teamOk = true; break; }
        const e = await page.locator('.text-error').textContent().catch(() => '');
        if (e && e.trim().length > 0) { teamErr = e.trim(); break; }
      }
      log('照片 tab：共享空间', teamOk || teamErr.length === 0, teamOk ? '有照片' : teamErr.slice(0, 160));

      // ---- 下载 tab ----
      await page.click('.tab-item:has-text("下载")');
      await page.waitForTimeout(3000);
      const dlErr = await page.locator('.text-error').textContent().catch(() => '');
      const dlTasks = await page.locator('.task-card').count();
      log('下载 tab', dlTasks > 0 || (dlErr || '').includes('Download Station'),
        dlTasks > 0 ? dlTasks + ' 个任务' : '提示: ' + (dlErr || '').trim().slice(0, 100));
      await page.screenshot({ path: 'test/artifacts/real_downloads.png' });
    }
  } catch (e) {
    log('执行中断', false, String(e).slice(0, 200));
  }

  const realErrors = consoleErrors.filter(
    (e) => !e.includes('Download the Vue Devtools') && !e.includes('Failed to load resource')
  );
  log('控制台无严重错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | ').slice(0, 300));

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log('========');
  console.log(failed === 0 ? 'ALL ' + results.length + ' PASS' : failed + '/' + results.length + ' FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
