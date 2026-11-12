// 浏览器环境请求诊断 v2（无需真实密码）：node tools/diag_browser.js
const { chromium } = require('./playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage();

  // 1) XHR 形式请求 query.cgi（模拟 app 的 18-API 组合发现）
  const r1 = await page.evaluate(async () => {
    const apis = ['SYNO.API.Auth','SYNO.FileStation.List','SYNO.FileStation.Info','SYNO.FileStation.Download','SYNO.FileStation.Upload','SYNO.FileStation.Thumb','SYNO.FileStation.CreateFolder','SYNO.FileStation.Rename','SYNO.FileStation.Delete','SYNO.FileStation.Share','SYNO.DownloadStation.Info','SYNO.DownloadStation.Task','SYNO.Foto.Browse.Item','SYNO.Foto.Browse.Folder','SYNO.Foto.Browse.Album','SYNO.Foto.Thumbnail','SYNO.Foto.Download','SYNO.FotoTeam.Browse.Item'];
    const url = 'http://localhost:8091/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=' + encodeURIComponent(apis.join(','));
    const res = await fetch(url);
    const t = await res.text();
    return { status: res.status, ct: res.headers.get('content-type'), isJson: t.trim()[0] === '{', head: t.slice(0, 150), urlLen: url.length };
  });
  console.log('XHR query.cgi:', JSON.stringify(r1, null, 2));

  // 2) XHR 登录（错误账号——预期返回 JSON 400 错误码；若返回 HTML 则为关键发现）
  const r2 = await page.evaluate(async () => {
    const url = 'http://localhost:8091/webapi/entry.cgi?api=SYNO.API.Auth&version=7&method=login&account=__diag_test__&passwd=__wrong__&session=QunHuiApp&format=sid&enable_device_token=yes';
    const res = await fetch(url);
    const t = await res.text();
    return { status: res.status, ct: res.headers.get('content-type'), isJson: t.trim()[0] === '{', head: t.slice(0, 150) };
  });
  console.log('XHR login(错误账号):', JSON.stringify(r2, null, 2));

  // 3) POST 表单形式登录（模拟 app 的 POST 回退）
  const r3 = await page.evaluate(async () => {
    const qs = 'api=SYNO.API.Auth&version=7&method=login&account=__diag_test__&passwd=__wrong__&session=QunHuiApp&format=sid';
    const res = await fetch('http://localhost:8091/webapi/entry.cgi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: qs,
    });
    const t = await res.text();
    return { status: res.status, ct: res.headers.get('content-type'), isJson: t.trim()[0] === '{', head: t.slice(0, 150) };
  });
  console.log('XHR login(POST):', JSON.stringify(r3, null, 2));

  await browser.close();
})();
