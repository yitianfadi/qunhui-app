// 探测 DSM 7.4 SYNO.FileStation.Upload 可接受的参数组合
// 用法：NAS_SID=<sid> node tools/probe_upload.js [目标目录]
// 注意：本脚本只上传一个极小的测试文件，用于确定参数格式；不会删除 NAS 上的文件。

const fs = require('fs');
const path = require('path');

const HOST = process.env.NAS_HOST || 'http://192.168.1.100:5000';
// sid 从项目根目录的 _sid.tmp 读取（避免出现在命令行里）
let SID = process.env.NAS_SID || '';
if (!SID) {
  const sidFile = path.resolve(__dirname, '..', '_sid.tmp');
  if (fs.existsSync(sidFile)) SID = fs.readFileSync(sidFile, 'utf8').trim();
}
const DEST = process.argv[2] || '/home';
const CGI = HOST + '/webapi/entry.cgi';

if (!SID) {
  console.error('缺少 sid：请把会话写入 _sid.tmp 或设置 NAS_SID');
  process.exit(1);
}

const testFile = path.resolve(__dirname, '_probe_payload.txt');
fs.writeFileSync(testFile, 'qh upload probe ' + Date.now());
const fileBuf = fs.readFileSync(testFile);

function short(r, n = 260) {
  return (r || '').replace(/\s+/g, ' ').slice(0, n);
}

/** 组合 1：参数全在 query，multipart 仅 file 字段 */
async function comboQueryOnly() {
  const q = new URLSearchParams({
    api: 'SYNO.FileStation.Upload',
    version: '3',
    method: 'upload',
    path: DEST,
    create_parents: 'true',
    overwrite: 'true',
    _sid: SID,
  });
  const fd = new FormData();
  fd.append('file', new Blob([fileBuf]), 'probe_query.txt');
  const res = await fetch(`${CGI}?${q}`, { method: 'POST', body: fd });
  return `${res.status} ${short(await res.text())}`;
}

/** 组合 2：参数全在 query + multipart 里也带 filename 字段 */
async function comboQueryWithFilename() {
  const q = new URLSearchParams({
    api: 'SYNO.FileStation.Upload',
    version: '3',
    method: 'upload',
    path: DEST,
    create_parents: 'true',
    overwrite: 'true',
    _sid: SID,
  });
  const fd = new FormData();
  fd.append('filename', 'probe_fname.txt');
  fd.append('file', new Blob([fileBuf]), 'probe_fname.txt');
  const res = await fetch(`${CGI}?${q}`, { method: 'POST', body: fd });
  return `${res.status} ${short(await res.text())}`;
}

/** 组合 3：参数在 multipart 字段里（_sid 也放 form） */
async function comboFormOnly() {
  const fd = new FormData();
  fd.append('api', 'SYNO.FileStation.Upload');
  fd.append('version', '3');
  fd.append('method', 'upload');
  fd.append('path', DEST);
  fd.append('create_parents', 'true');
  fd.append('overwrite', 'true');
  fd.append('_sid', SID);
  fd.append('filename', 'probe_form.txt');
  fd.append('file', new Blob([fileBuf]), 'probe_form.txt');
  const res = await fetch(CGI, { method: 'POST', body: fd });
  return `${res.status} ${short(await res.text())}`;
}

/** 组合 4：version 2（minVersion） */
async function comboVersion2() {
  const q = new URLSearchParams({
    api: 'SYNO.FileStation.Upload',
    version: '2',
    method: 'upload',
    path: DEST,
    create_parents: 'true',
    overwrite: 'true',
    _sid: SID,
  });
  const fd = new FormData();
  fd.append('file', new Blob([fileBuf]), 'probe_v2.txt');
  const res = await fetch(`${CGI}?${q}`, { method: 'POST', body: fd });
  return `${res.status} ${short(await res.text())}`;
}

/** 组合 5：不带 create_parents/overwrite，最小参数 */
async function comboMinimal() {
  const q = new URLSearchParams({
    api: 'SYNO.FileStation.Upload',
    version: '3',
    method: 'upload',
    path: DEST,
    _sid: SID,
  });
  const fd = new FormData();
  fd.append('file', new Blob([fileBuf]), 'probe_min.txt');
  const res = await fetch(`${CGI}?${q}`, { method: 'POST', body: fd });
  return `${res.status} ${short(await res.text())}`;
}

const combos = [
  ['1 query + file（推荐写法）', comboQueryOnly],
  ['2 query + filename 字段', comboQueryWithFilename],
  ['3 全 multipart 字段', comboFormOnly],
  ['4 version=2', comboVersion2],
  ['5 最小参数', comboMinimal],
];

async function main() {
  console.log(`目标目录: ${DEST}\n`);
  for (const [label, fn] of combos) {
    const t0 = Date.now();
    try {
      const out = await fn();
      console.log(`[${label}] ${((Date.now() - t0) / 1000).toFixed(1)}s  ${out}`);
    } catch (e) {
      console.log(`[${label}] ${((Date.now() - t0) / 1000).toFixed(1)}s  异常: ${e.message}`);
    }
  }
  fs.unlinkSync(testFile);
}

main();
