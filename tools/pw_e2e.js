// uni-app X 版群晖助手 E2E 测试（Mock NAS API，无头浏览器）
// 运行：node tools/pw_e2e.js
const { chromium } = require('./playwright');

const BASE = 'http://localhost:8091';
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

function apiTable() {
  const t = {
    'SYNO.API.Auth': { maxVersion: 7, minVersion: 1, path: 'entry.cgi' },
    'SYNO.FileStation.List': { maxVersion: 2, minVersion: 1, path: 'entry.cgi' },
    'SYNO.FileStation.Info': { maxVersion: 2, minVersion: 1, path: 'entry.cgi' },
    'SYNO.FileStation.Download': { maxVersion: 2, minVersion: 1, path: 'entry.cgi' },
    'SYNO.FileStation.CreateFolder': { maxVersion: 2, minVersion: 1, path: 'entry.cgi' },
    'SYNO.FileStation.Delete': { maxVersion: 2, minVersion: 1, path: 'entry.cgi' },
    'SYNO.FileStation.Share': { maxVersion: 2, minVersion: 1, path: 'entry.cgi' },
    'SYNO.Foto.Browse.Item': { maxVersion: 7, minVersion: 1, path: 'entry.cgi' },
    'SYNO.Foto.Thumbnail': { maxVersion: 1, minVersion: 1, path: 'entry.cgi' },
    'SYNO.Foto.Download': { maxVersion: 1, minVersion: 1, path: 'entry.cgi' },
    'SYNO.FotoTeam.Browse.Item': { maxVersion: 7, minVersion: 1, path: 'entry.cgi' },
    'SYNO.FotoTeam.Thumbnail': { maxVersion: 1, minVersion: 1, path: 'entry.cgi' },
    'SYNO.DownloadStation.Info': { maxVersion: 1, minVersion: 1, path: 'entry.cgi' },
    'SYNO.DownloadStation.Task': { maxVersion: 3, minVersion: 1, path: 'entry.cgi' },
  };
  const data = {};
  for (const k of Object.keys(t)) data[k] = t[k];
  return data;
}

(async () => {
  const results = [];
  const log = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  | ' + detail : ''));
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: false, channel: 'msedge', slowMo: 200 });
  } catch (e) {
    browser = await chromium.launch({ headless: false, slowMo: 200 });
  }
  // 手机视口，贴近真机布局
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  // Web 端下载会 window.open 新标签，测试中直接关掉避免干扰主流程
  page.on('popup', async (p) => {
    try {
      await p.close();
    } catch (e) {}
  });

  // ---- Mock 所有 /webapi 请求 ----
  await page.route('**/webapi/**', (route) => {
    const u = new URL(route.request().url());
    const api = u.searchParams.get('api') || '';
    const method = u.searchParams.get('method') || '';
    const json = (obj) =>
      route.fulfill({ status: 200, contentType: 'application/json; charset=UTF-8', body: JSON.stringify(obj) });

    if (u.pathname.includes('query.cgi')) return json({ data: apiTable(), success: true });
    if (api === 'SYNO.API.Auth' && method === 'login')
      return json({ data: { sid: 'mock_sid_123', did: 'mock_did' }, success: true });
    if (api === 'SYNO.FileStation.List' && method === 'list_share')
      return json({ data: { shares: [
        { path: '/music', isdir: true }, { path: '/photo', isdir: true },
        { path: '/video', isdir: true }, { path: '/docs', isdir: true },
      ] }, success: true });
    if (api === 'SYNO.FileStation.List' && method === 'list') {
      const folder = u.searchParams.get('folder_path') || '/';
      return json({ data: { files: [
        { path: folder + '/子文件夹', isdir: true, additional: { size: 0, time: { mtime: 1730000000 } } },
        { path: folder + '/报告.pdf', isdir: false, additional: { size: 1048576, time: { mtime: 1729980000 } } },
        { path: folder + '/照片合集.zip', isdir: false, additional: { size: 734003200, time: { mtime: 1729900000 } } },
      ] }, success: true });
    }
    if ((api === 'SYNO.Foto.Browse.Item' || api === 'SYNO.FotoTeam.Browse.Item') && method === 'list') {
      const items = [];
      for (let i = 1; i <= 12; i++) {
        items.push({
          id: i, filename: 'IMG_2026' + String(100 + i) + '.jpg', type: i % 5 === 0 ? 'video' : 'photo',
          time: 1730000000 + i * 86400, folder_id: 2,
          additional: { thumbnail: { cache_key: i + '_ck', sm: 'ready', m: 'ready', xl: 'ready' } },
        });
      }
      return json({ data: { list: items }, success: true, total: 12 });
    }
    if ((api === 'SYNO.Foto.Thumbnail' || api === 'SYNO.FotoTeam.Thumbnail') && method === 'get')
      return route.fulfill({ status: 200, contentType: 'image/png', body: png1x1 });
    if (api === 'SYNO.DownloadStation.Task' && method === 'list')
      return json({ data: { tasks: [
        { id: '1', title: 'ubuntu-24.04-live-server.iso', status: 'downloading', size: 2600000000,
          additional: { detail: { progress: 42 }, transfer: { size_downloaded: 1092000000, speed_download: 12500000 } } },
        { id: '2', title: '纪录片.4K.mkv', status: 'paused', size: 8000000000,
          additional: { detail: { progress: 10 }, transfer: { size_downloaded: 800000000, speed_download: 0 } } },
        { id: '3', title: '已完成的种子', status: 'finished', size: 500000000,
          additional: { detail: { progress: 100 }, transfer: { size_downloaded: 500000000, speed_download: 0 } } },
      ] }, success: true });
    return json({ data: {}, success: true });
  });

  try {
    // ---- 1. 登录页 ----
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);
    const loginVisible = await page.locator('text=连接你的群晖 NAS').count();
    log('登录页渲染', loginVisible > 0);
    const qcVal = await page.locator('input').nth(0).inputValue().catch(() => 'MISSING');
    const hostVal = await page.locator('input').nth(1).inputValue().catch(() => '');
    const portVal = await page.locator('input').nth(2).inputValue().catch(() => '');
    log('Web 端代理地址预填', hostVal === 'localhost' && portVal === '8091' && qcVal.length === 0, hostVal + ':' + portVal + ' QC=' + qcVal);

    // ---- 2. 登录 ----
    await page.locator('input').nth(2).fill('tester');
    await page.locator('input').nth(3).fill('testpass');
    await page.click('text=登录');
    await page.waitForTimeout(3000);
    const shares = await page.locator('text=music').count();
    log('登录跳转 + 共享目录列表', shares > 0, 'music 项=' + shares);

    // ---- 3. 进入子文件夹 ----
    await page.click('text=music');
    await page.waitForTimeout(2000);
    const fileRow = await page.locator('text=报告.pdf').count();
    const sizeText = await page.locator('text=1.0 MB').count();
    log('子目录文件列表 + 大小格式化', fileRow > 0 && sizeText > 0, '报告.pdf=' + fileRow + ' 1.0MB=' + sizeText);

    // ---- 4. 照片 tab ----
    await page.click('.tab-item:has-text("照片")');
    await page.waitForTimeout(2500);
    const thumbs = await page.locator('.grid-item').count();
    log('照片网格渲染（12 张 Mock）', thumbs === 12, '网格项=' + thumbs);

    // 共享空间切换
    await page.click('text=共享空间');
    await page.waitForTimeout(2000);
    log('照片共享空间切换', (await page.locator('.grid-item').count()) === 12);

    // ---- 5. 下载 tab ----
    await page.click('.tab-item:has-text("下载")');
    await page.waitForTimeout(2000);
    const task1 = await page.locator('text=ubuntu-24.04-live-server.iso').count();
    const task2 = await page.locator('text=纪录片.4K.mkv').count();
    const pct = await page.locator('text=42%').count();
    log('下载任务列表 + 进度', task1 > 0 && task2 > 0 && pct > 0, 'ubuntu=' + task1 + ' mkv=' + task2 + ' 42%=' + pct);

    // ---- 6. 文件页下载到本机（验证下载队列） ----
    await page.click('.tab-item:has-text("文件")');
    await page.waitForTimeout(900);
    await page.click('.file-row:has-text("报告.pdf")');
    await page.waitForTimeout(700);
    await page.click('text=下载到本机');
    await page.waitForTimeout(1200);

    // ---- 7. 设置 tab ----
    await page.click('.tab-item:has-text("设置")');
    await page.waitForTimeout(1200);
    const about = await page.locator('text=关于').count();
    const acc = await page.locator('text=localhost').count();
    const dlEntry = await page.locator('text=下载管理').count();
    // 版本号已改为动态读取（getAppBaseInfo），别再写死具体版本
    const ver = await page.getByText(/^v\d+\.\d+\.\d+$/).count();
    const updEntry = await page.locator('text=检查更新').count();
    log('设置页（账号卡 + 下载入口 + 版本 + 检查更新）',
      about > 0 && acc > 0 && dlEntry > 0 && ver > 0 && updEntry > 0,
      'about=' + about + ' acc=' + acc + ' 下载管理=' + dlEntry + ' ver=' + ver + ' 更新入口=' + updEntry);
    await page.screenshot({ path: 'test/artifacts/e2e_settings.png' });

    // 进入下载管理页
    await page.click('text=下载管理');
    await page.waitForTimeout(1500);
    const dlTitle = await page.locator('text=下载任务').count();
    const taskRows = await page.locator('.task').count();
    const firstName = await page.locator('.task-name').first().textContent().catch(() => '');
    const doneTag = await page.locator('.task-meta:has-text("已完成")').count();
    log('下载管理页（列表 + 任务状态）', dlTitle > 0 && taskRows >= 1 && firstName.includes('报告.pdf') && doneTag > 0,
      '行数=' + taskRows + ' 首个=' + firstName.trim() + ' 已完成标签=' + doneTag);
    await page.screenshot({ path: 'test/artifacts/e2e_dl_page.png' });
    // 返回主页（SPA 路由返回，若未回到 tab 视图则重新进入）
    await page.goBack();
    await page.waitForTimeout(1500);
    if ((await page.locator('.tab-item').count()) === 0) {
      await page.goto('http://localhost:8091/', { waitUntil: 'load' });
      await page.waitForTimeout(2500);
    }

    // ---- 8. 备份与恢复页 ----
    await page.click('.tab-item:has-text("设置")');
    await page.waitForTimeout(800);
    await page.click('text=备份与恢复');
    await page.waitForTimeout(1500);
    const upSeg = await page.locator('text=上传备份').count();
    const pickBtn = await page.locator('text=备份手机照片 / 视频').count();
    log('备份页（上传 tab）', upSeg > 0 && pickBtn > 0, 'seg=' + upSeg + ' 选择按钮=' + pickBtn);
    await page.screenshot({ path: 'test/artifacts/e2e_backup_up.png' });

    await page.click('text=下载备份');
    await page.waitForTimeout(800);
    const folderBtn = await page.locator('text=备份此文件夹到本机').count();

    // 文件夹选择器：浏览 → 进入 music → 选定
    await page.click('.path-row');
    await page.waitForTimeout(1500);
    const pickerRows = await page.locator('.fp-row').count();
    await page.screenshot({ path: 'test/artifacts/e2e_folder_picker.png' });
    let pickedPath = '';
    if (pickerRows > 0) {
      await page.click('.fp-row:has-text("music")');
      await page.waitForTimeout(1200);
      await page.click('text=选择此文件夹');
      await page.waitForTimeout(800);
      pickedPath = ((await page.locator('.path-value').first().textContent()) || '').trim();
    }
    log('文件夹选择器（浏览并选择）', pickerRows >= 3 && pickedPath === '/music',
      '目录数=' + pickerRows + ' 选中=' + pickedPath);

    await page.click('text=备份全部照片（个人空间）');
    await page.waitForTimeout(3000);
    const queueTitle = await page.locator('text=下载队列').count();
    const photoRows = await page.locator('.task-name').count();
    log('下载备份（批量加入队列）', folderBtn > 0 && queueTitle > 0 && photoRows >= 5,
      '按钮=' + folderBtn + ' 队列标题=' + queueTitle + ' 任务行=' + photoRows);
    await page.screenshot({ path: 'test/artifacts/e2e_backup_down.png' });
    await page.goBack();
    await page.waitForTimeout(1200);

    // ---- 截图存档 ----
    await page.click('.tab-item:has-text("设置")');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test/artifacts/e2e_settings.png' });
    await page.click('.tab-item:has-text("照片")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test/artifacts/e2e_photos.png' });
    await page.click('.tab-item:has-text("下载")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test/artifacts/e2e_downloads.png' });
    await page.click('.tab-item:has-text("文件")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test/artifacts/e2e_files.png' });
    log('截图存档（test/artifacts/）', true);
  } catch (e) {
    log('执行中断', false, String(e).slice(0, 200));
  }

  // ---- 控制台错误检查 ----
  const realErrors = consoleErrors.filter(
    (e) => !e.includes('Download the Vue Devtools') && !e.includes('Failed to load resource')
  );
  log('控制台无严重错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | ').slice(0, 300));

  if (process.env.KEEP_OPEN) {
    console.log('浏览器保持打开 15 秒供观察…');
    await page.waitForTimeout(15000);
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log('========');
  console.log(failed === 0 ? 'ALL ' + results.length + ' PASS' : failed + '/' + results.length + ' FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
