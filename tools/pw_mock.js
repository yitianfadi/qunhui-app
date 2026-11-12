async page => {
  const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  await page.route('**/webapi/**', route => {
    const u = new URL(route.request().url());
    const api = u.searchParams.get('api') || '';
    const method = u.searchParams.get('method') || '';
    const path = u.pathname;
    const json = (obj) => route.fulfill({ status: 200, contentType: 'application/json; charset=UTF-8', body: JSON.stringify(obj) });

    // API 发现
    if (path.includes('query.cgi')) {
      const table = {
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
      };
      const q = u.searchParams.get('query') || '';
      const data = {};
      for (const name of q.split(',')) { if (table[name]) data[name] = table[name]; }
      return json({ data: data, success: true });
    }
    // 登录
    if (api === 'SYNO.API.Auth' && method === 'login') {
      return json({ data: { sid: 'mock_sid_123', did: 'mock_did' }, success: true });
    }
    // 共享文件夹（DSM 7.4：List.list_share）
    if (api === 'SYNO.FileStation.List' && method === 'list_share') {
      return json({ data: { shares: [
        { path: '/music', isdir: true },
        { path: '/photo', isdir: true },
        { path: '/video', isdir: true },
        { path: '/docs', isdir: true },
      ]}, success: true });
    }
    // 旧版回退：Info.list_share
    if (api === 'SYNO.FileStation.Info' && method === 'list_share') {
      return json({ data: { shares: [{ path: '/music', isdir: true }] }, success: true });
    }
    // 目录内文件
    if (api === 'SYNO.FileStation.List' && method === 'list') {
      const folder = u.searchParams.get('folder_path') || '/';
      return json({ data: { files: [
        { path: folder + '/子文件夹', isdir: true, additional: { size: 0, time: { mtime: 1730000000 } } },
        { path: folder + '/报告.pdf', isdir: false, additional: { size: 1048576, time: { mtime: 1729980000 } } },
        { path: folder + '/照片合集.zip', isdir: false, additional: { size: 734003200, time: { mtime: 1729900000 } } },
      ]}, success: true });
    }
    // 共享链接
    if (api === 'SYNO.FileStation.Share' && method === 'create') {
      return json({ data: { link: 'https://gofile.me/mock/abc123' }, success: true });
    }
    // 照片列表
    if (api === 'SYNO.Foto.Browse.Item' && method === 'list') {
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
    // 缩略图 → 1px PNG
    if (api === 'SYNO.Foto.Thumbnail' && method === 'get') {
      return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(png1x1, 'base64') });
    }
    // 下载任务
    if (api === 'SYNO.DownloadStation.Task' && method === 'list') {
      return json({ data: { tasks: [
        { id: 'dbid_1', title: 'ubuntu-24.04-live-server.iso', status: 'downloading', size: 2600000000,
          additional: { detail: { progress: 42 }, transfer: { size_downloaded: 1092000000, speed_download: 12500000 } } },
        { id: 'dbid_2', title: '纪录片.4K.mkv', status: 'paused', size: 8000000000,
          additional: { detail: { progress: 10 }, transfer: { size_downloaded: 800000000, speed_download: 0 } } },
        { id: 'dbid_3', title: '已完成的种子', status: 'finished', size: 500000000,
          additional: { detail: { progress: 100 }, transfer: { size_downloaded: 500000000, speed_download: 0 } } },
      ]}, success: true });
    }
    // 其它 API 一律成功空数据
    return json({ data: {}, success: true });
  });
  return 'mock routes installed';
}
