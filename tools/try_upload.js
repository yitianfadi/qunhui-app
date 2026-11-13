// 手工拼 multipart 上传到 DSM，用于验证参数顺序/取值
// 用法：FILE_FIRST=1 node tools/try_upload.js <本地文件> <NAS文件名> [目标目录]
const fs = require('fs');
const http = require('http');

const HOST = process.env.NAS_HOST || '10.10.10.236';
const PORT = Number(process.env.NAS_PORT || 5000);
const SID = process.env.NAS_SID || '';
const FILE = process.argv[2];
const NAME = process.argv[3] || 'try_upload.bin';
const DEST = process.argv[4] || '/photo';
const FILE_FIRST = process.env.FILE_FIRST === '1';

if (!SID) {
  console.error('缺少 NAS_SID');
  process.exit(1);
}

const boundary = '----QunhuiBoundary' + Date.now();
const fields = [
  ['api', 'SYNO.FileStation.Upload'],
  ['version', '2'],
  ['method', 'upload'],
  ['path', DEST],
  ['create_parents', 'true'],
  ['overwrite', 'true'],
];

function fieldPart(k, v) {
  return '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n';
}
function fileHead() {
  return '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + NAME +
    '"\r\nContent-Type: application/octet-stream\r\n\r\n';
}
const fieldText = fields.map(([k, v]) => fieldPart(k, v)).join('');
const head = FILE_FIRST ? fileHead() : fieldText + fileHead();
const tail = (FILE_FIRST ? fieldText : '') + '--' + boundary + '--\r\n';

const headBuf = Buffer.from(head, 'utf8');
const tailBuf = Buffer.from(tail, 'utf8');
const size = fs.statSync(FILE).size;
const total = headBuf.length + size + tailBuf.length;

const req = http.request({
  host: HOST,
  port: PORT,
  method: 'POST',
  path: '/webapi/entry.cgi?_sid=' + encodeURIComponent(SID),
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': total,
    Cookie: 'id=' + SID,
    'User-Agent': process.env.UA || 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/110 Mobile Safari/537.36',
  },
}, (res) => {
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => console.log('FILE_FIRST=' + FILE_FIRST, 'status', res.statusCode, body.slice(0, 200)));
});
req.on('error', (e) => console.log('err', e.message));
const t0 = Date.now();
req.write(headBuf);
const rs = fs.createReadStream(FILE, { highWaterMark: 256 * 1024 });
rs.on('data', (c) => req.write(c));
rs.on('end', () => {
  req.end(tailBuf);
  console.log('sent', total, 'bytes in', ((Date.now() - t0) / 1000).toFixed(1), 's');
});
