// 真实 NAS E2E（免密码版）：用预置 sid 会话注入 localStorage，node tools/real_e2e_sid.js <sid>
const { chromium } = require('./playwright');

const BASE = 'http://localhost:8091';
const SID = process.env.NAS_SID || '';

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
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('webapi') || u.includes('query.cgi')) {
      let body = '';
      try { body = (await r.text()).replace(/\s+/g, ' ').slice(0, 120); } catch (e) { body = '(read fail)'; }
      console.log('[NET] ' + r.status() + ' ' + decodeURIComponent(u).slice(0, 170) + '\n     └ ' + body);
    }
  });

  // 预置会话（app 启动时 SynoApi.load() 恢复）
  await page.addInitScript((sid) => {
    const state = {
      baseUrl: 'http://localhost:8091',
      pathPrefix: '/webapi',
      sid: sid,
      password: '',
      account: {
        id: 'localhost:8091:tester',
        name: 'NAS-192.168.1.100',
        protocol: 'http',
        host: 'localhost',
        port: 8091,
        username: 'tester',
      },
    };
    try { localStorage.setItem('syno_api_state', JSON.stringify(state)); } catch (e) {}
  }, SID);

  try {
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
    let entered = false;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      if ((await page.locator('.tab-item').count()) >= 4) { entered = true; break; }
    }
    if (!entered) {
      const err = await page.locator('.text-error').first().textContent().catch(() => '（无）');
      log('会话注入进入主页', false, '停留在登录页: ' + (err || '').trim().slice(0, 150));
    } else {
      log('会话注入进入主页', true);

      // 文件 tab（轮询等待 GET→POST 回退链）
      await page.waitForTimeout(1000);
      let shareRows = 0;
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(1000);
        shareRows = await page.locator('.file-row').count();
        if (shareRows > 0) break;
        if ((await page.locator('.text-error').count()) > 0) break;
      }
      const names = await page.locator('.file-name').allTextContents();
      log('文件 tab：共享目录', shareRows > 0, shareRows + ' 个: ' + names.slice(0, 8).join(', '));
      await page.screenshot({ path: 'test/artifacts/real_files.png' });

      if (shareRows > 0) {
        await page.locator('.file-row').first().click();
        await page.waitForTimeout(3000);
        const innerRows = await page.locator('.file-row').count();
        const errInDir = (await page.locator('.text-error').count()) > 0;
        log('文件 tab：进入子目录', !errInDir, '条目=' + innerRows + (errInDir ? '（有报错）' : ''));
        await page.screenshot({ path: 'test/artifacts/real_files_sub.png' });
      }

      // 照片 tab
      await page.click('.tab-item:has-text("照片")');
      let photosOk = false, photoCount = 0, photoErr = '';
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);
        photoCount = await page.locator('.grid-item').count();
        if (photoCount > 0) { photosOk = true; break; }
        const e = await page.locator('.text-error').textContent().catch(() => '');
        if (e && e.trim().length > 0) { photoErr = e.trim(); break; }
      }
      log('照片 tab：个人空间', photosOk || photoErr.length === 0,
        photoCount + ' 张' + (photoErr ? ' 错误:' + photoErr.slice(0, 160) : (photosOk ? '' : '（空相册，无报错）')));
      await page.screenshot({ path: 'test/artifacts/real_photos.png' });

      await page.click('text=共享空间');
      let teamOk = false, teamErr = '';
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(1000);
        if ((await page.locator('.grid-item').count()) > 0) { teamOk = true; break; }
        const e = await page.locator('.text-error').textContent().catch(() => '');
        if (e && e.trim().length > 0) { teamErr = e.trim(); break; }
      }
      log('照片 tab：共享空间', teamOk, teamOk ? '有照片' : ('无照片/提示: ' + teamErr.slice(0, 160)));

      // 下载 tab
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
