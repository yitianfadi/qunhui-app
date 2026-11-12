// 「检查更新」功能的 H5 实测脚本
// 做三件事：
//   1. 注入已登录会话（跳过登录页）
//   2. 拦截发往 NAS 的请求返回 mock，避免依赖真实 NAS
//   3. 真实调用 GitHub Releases API，验证检查更新链路
// 运行：node tools/update_e2e.js
const { chromium } = require('./playwright');

const BASE = process.env.H5_BASE || 'http://localhost:8091';
const NAS = '192.168.1.100:5000';

const apiTable = {
  'SYNO.API.Auth': { maxVersion: 7, minVersion: 1, path: 'entry.cgi' },
  'SYNO.FileStation.List': { maxVersion: 2, minVersion: 1, path: 'entry.cgi' },
  'SYNO.FileStation.Info': { maxVersion: 2, minVersion: 1, path: 'entry.cgi' },
  'SYNO.DownloadStation.Info': { maxVersion: 1, minVersion: 1, path: 'entry.cgi' },
  'SYNO.DownloadStation.Task': { maxVersion: 3, minVersion: 1, path: 'entry.cgi' },
  'SYNO.Foto.Browse.Item': { maxVersion: 7, minVersion: 1, path: 'entry.cgi' },
};

const state = {
  baseUrl: 'http://' + NAS,
  pathPrefix: '/webapi',
  sid: 'MOCK_SID_FOR_TEST',
  password: 'mock',
  account: {
    id: NAS + ':tester',
    name: '测试NAS',
    protocol: 'http',
    host: '192.168.1.100',
    port: 5000,
    username: 'tester',
    qcId: '',
    transport: 'direct',
  },
  apiTable: apiTable,
  lastGood: 'http://' + NAS,
  lastGoodLabel: '直连',
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch(() =>
    chromium.launch({ headless: true })
  );
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // 1) 注入会话状态（uni-app x H5 的 setStorageSync 落到 localStorage）
  await page.addInitScript((s) => {
    localStorage.setItem('syno_api_state', JSON.stringify(s));
  }, state);

  // 2) mock 掉所有 NAS 请求，保证页面能进首页
  await page.route('**/*' + NAS + '**', async (route) => {
    const url = route.request().url();
    let data = { success: true, data: {} };
    if (url.includes('list_share') || url.includes('method=list')) {
      data = { success: true, data: { total: 0, offset: 0, files: [] } };
    } else if (url.includes('SYNO.Foto')) {
      data = { success: true, data: { list: [] } };
    } else if (url.includes('SYNO.DownloadStation.Task')) {
      data = { success: true, data: { total: 0, tasks: [] } };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });

  // 记录 GitHub API 请求，便于确认真的打出去了
  let githubCalls = [];
  page.on('response', async (res) => {
    if (res.url().includes('api.github.com')) {
      githubCalls.push(res.url() + ' -> ' + res.status());
    }
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test/artifacts/upd1_home.png' });

  // 3) 切到「设置」
  const setTab = page.getByText('设置', { exact: true }).last();
  if (await setTab.count()) {
    await setTab.click({ force: true });
  } else {
    await page.mouse.click(330, 800); // 兜底按坐标
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test/artifacts/upd2_settings.png' });

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('=== 设置页文本 ===');
  console.log(bodyText.slice(0, 800));

  // 4) 点「检查更新」
  const updRow = page.getByText('检查更新', { exact: true }).first();
  const hasRow = await updRow.count();
  console.log('找到「检查更新」入口:', hasRow > 0);

  if (hasRow) {
    await updRow.click({ force: true });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'test/artifacts/upd3_result.png' });

    const after = await page.evaluate(() => document.body.innerText);
    console.log('=== 点击后页面文本 ===');
    console.log(after.slice(0, 1200));
    console.log('=== GitHub 请求 ===');
    console.log(githubCalls.length ? githubCalls.join('\n') : '(未捕获到请求)');
  }

  await browser.close();
})();
