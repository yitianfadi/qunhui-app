// 「发现新版本」分支测试：mock GitHub API 返回更高版本
// 覆盖两个场景：
//   A) release 带 .apk asset → 按钮应为「立即更新」，H5 下点后复制安装包链接
//   B) release 不带 apk        → 按钮应为「复制链接」，点后复制发布页
// 运行：node tools/update_e2e2.js
const { chromium } = require('./playwright');

const BASE = process.env.H5_BASE || 'http://localhost:8091';
const NAS = '192.168.1.100:5000';

const apiTable = {
  'SYNO.API.Auth': { maxVersion: 7, minVersion: 1, path: 'entry.cgi' },
  'SYNO.FileStation.List': { maxVersion: 2, minVersion: 1, path: 'entry.cgi' },
  'SYNO.FileStation.Info': { maxVersion: 2, minVersion: 1, path: 'entry.cgi' },
  'SYNO.Foto.Browse.Item': { maxVersion: 7, minVersion: 1, path: 'entry.cgi' },
  'SYNO.DownloadStation.Task': { maxVersion: 3, minVersion: 1, path: 'entry.cgi' },
};

const state = {
  baseUrl: 'http://' + NAS,
  pathPrefix: '/webapi',
  sid: 'MOCK_SID',
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

const baseRelease = {
  tag_name: 'v1.1.0',
  name: 'v1.1.0 · 测试版本',
  html_url: 'https://github.com/yitianfadi/qunhui-app/releases/tag/v1.1.0',
  body: '### 新特性\n- 支持断点续传\n- 修复若干问题\n\n**注意**：需要 Android 8.0 以上',
  published_at: '2026-11-12T14:00:00Z',
};

async function runScenario(browser, withApk) {
  const label = withApk ? 'A: 带 apk' : 'B: 不带 apk';
  const release = Object.assign({}, baseRelease, {
    assets: withApk
      ? [
          {
            name: 'qunhui-1.1.0.apk',
            size: 33554432,
            browser_download_url:
              'https://github.com/yitianfadi/qunhui-app/releases/download/v1.1.0/qunhui-1.1.0.apk',
          },
        ]
      : [],
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript((s) => {
    localStorage.setItem('syno_api_state', JSON.stringify(s));
  }, state);

  await page.route('**/*' + NAS + '**', async (route) => {
    const url = route.request().url();
    let data = { success: true, data: {} };
    if (url.includes('method=list') || url.includes('list_share')) {
      data = { success: true, data: { total: 0, offset: 0, files: [] } };
    } else if (url.includes('SYNO.Foto')) {
      data = { success: true, data: { list: [] } };
    } else if (url.includes('SYNO.DownloadStation')) {
      data = { success: true, data: { total: 0, tasks: [] } };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.route('**/api.github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(release) })
  );

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const setTab = page.getByText('设置', { exact: true }).last();
  if (await setTab.count()) await setTab.click({ force: true });
  await page.waitForTimeout(900);

  await page.getByText('检查更新', { exact: true }).first().click({ force: true });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `test/artifacts/upd_${withApk ? 'apk' : 'noapk'}.png` });

  const txt = await page.evaluate(() => document.body.innerText);
  const seg = (() => {
    const i = txt.indexOf('发现新版本');
    return i >= 0 ? txt.slice(i, i + 320) : '(未找到「发现新版本」)';
  })();
  console.log(`\n===== 场景 ${label} · 弹窗 =====`);
  console.log(seg);

  // 点确认按钮
  const confirmText = withApk ? '立即更新' : '复制链接';
  const btn = page.getByText(confirmText, { exact: true }).first();
  if (await btn.count()) {
    await btn.click({ force: true });
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => document.body.innerText);
    console.log(`--- 点「${confirmText}」之后 ---`);
    const kws = ['链接已复制', '请手动复制', '安装包链接'];
    const hit = kws.find((k) => after.indexOf(k) >= 0);
    if (hit) {
      const i = after.indexOf(hit);
      console.log(after.slice(Math.max(0, i - 10), i + 90).replace(/\n/g, ' | '));
    } else {
      console.log('(未见提示，页面尾部) ' + after.slice(-200).replace(/\n/g, ' | '));
    }
    await page.screenshot({ path: `test/artifacts/upd_${withApk ? 'apk' : 'noapk'}_after.png` });
  } else {
    console.log(`未找到按钮「${confirmText}」`);
  }

  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch(() =>
    chromium.launch({ headless: true })
  );
  await runScenario(browser, true);
  await runScenario(browser, false);
  await browser.close();
})();
