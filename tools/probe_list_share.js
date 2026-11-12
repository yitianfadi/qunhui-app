// 探测 DSM 7.4 列举共享目录的可用方式（sid 从 nas_sid.txt 读取）
const fs = require('fs');
const SID = fs.readFileSync('nas_sid.txt', 'utf8').trim();
const BASE = 'http://localhost:8091/webapi/entry.cgi';

async function tryCall(name, url, opts) {
  try {
    const res = await fetch(url, opts);
    const t = await res.text();
    const isJson = t.trim()[0] === '{';
    let head = t.replace(/\s+/g, ' ').slice(0, 220);
    if (!isJson) head = '(HTML ' + t.length + ' bytes)';
    console.log((isJson ? 'JSON ' : 'HTML ') + name + '\n     └ ' + head);
    if (isJson) console.log('');
    return isJson ? JSON.parse(t) : null;
  } catch (e) {
    console.log('ERR  ' + name + ' | ' + e.message);
    return null;
  }
}

(async () => {
  const qs = (p) => Object.entries(p).map(([k, v]) => k + '=' + encodeURIComponent(String(v))).join('&');

  // 1. GET List.list_share（已证实返回 HTML，作为基线）
  await tryCall('GET  List.list_share', BASE + '?' + qs({
    api: 'SYNO.FileStation.List', version: 1, method: 'list_share', _sid: SID, additional: '[]',
  }));

  // 2. POST form List.list_share
  await tryCall('POST-form List.list_share', BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: qs({ api: 'SYNO.FileStation.List', version: 1, method: 'list_share', _sid: SID, additional: '[]' }),
  });

  // 3. POST JSON List.list_share（requestFormat=JSON）
  await tryCall('POST-JSON List.list_share', BASE + '?' + qs({ api: 'SYNO.FileStation.List', version: 1, method: 'list_share', _sid: SID }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ additional: [] }),
  });

  // 4. GET Info.list_share
  await tryCall('GET  Info.list_share', BASE + '?' + qs({
    api: 'SYNO.FileStation.Info', version: 1, method: 'list_share', _sid: SID, additional: '[]',
  }));

  // 5. GET List.list folder_path=/volume1（共享目录就是 volume1 下的文件夹）
  await tryCall('GET  List.list /volume1', BASE + '?' + qs({
    api: 'SYNO.FileStation.List', version: 2, method: 'list', _sid: SID,
    folder_path: '/volume1', additional: '["size","time"]', limit: 100,
  }));

  // 6. GET List.list folder_path=/
  await tryCall('GET  List.list /', BASE + '?' + qs({
    api: 'SYNO.FileStation.List', version: 2, method: 'list', _sid: SID,
    folder_path: '/', additional: '["size","time"]', limit: 100,
  }));

  // 7. GET List.list_root
  await tryCall('GET  List.list_root', BASE + '?' + qs({
    api: 'SYNO.FileStation.List', version: 1, method: 'list_root', _sid: SID, additional: '[]',
  }));

  // 8. 查询 FileStation 全家桶（确认还有哪些 API 可用）
  await tryCall('QUERY FileStation 全部', 'http://localhost:8091/webapi/query.cgi?' + qs({
    api: 'SYNO.API.Info', version: 1, method: 'query',
    query: 'SYNO.FileStation.Info,SYNO.FileStation.List,SYNO.FileStation.Search,SYNO.FileStation.Download,SYNO.FileStation.Upload,SYNO.FileStation.VirtualFolder,SYNO.FileStation.Favorite,SYNO.FileStation.Sharing,SYNO.FileStation.Thumb,SYNO.FileStation.DirSize,SYNO.FileStation.CheckPermission,SYNO.FileStation.CopyMove,SYNO.FileStation.Delete,SYNO.FileStation.Extract,SYNO.FileStation.Compress,SYNO.FileStation.BackgroundTask,SYNO.FileStation.Rename,SYNO.FileStation.CreateFolder,SYNO.FileStation.Share,SYNO.FileStation.CGI',
  }));
})();
