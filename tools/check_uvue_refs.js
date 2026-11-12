// uvue 模板引用一致性检查
//
// 背景：uni-app x 蒸汽模式（vapor）下，模板渲染期抛 ReferenceError（例如模板用了
// maxFiles 但脚本里叫 MAX_FILES）会直接导致原生渲染线程 abort -> 应用闪退，
// 而不是像 Web 那样只打一行 warn。所以每次改完 UI 都要跑一遍本检查。
//
// 用法：node tools/check_uvue_refs.js
// 退出码：0 = 无问题，1 = 发现问题

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'uniappx');

// 模板里可以安全出现的内置标识符
const BUILTIN = new Set([
  'true', 'false', 'null', 'undefined', 'NaN',
  'Math', 'JSON', 'Date', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent',
  'uni', 'console', 'window', 'require',
]);

// 模板语法关键字，不是标识符
const SYNTAX = new Set([
  'if', 'else', 'for', 'while', 'switch', 'case', 'catch', 'function', 'return',
  'in', 'of', 'new', 'typeof', 'instanceof', 'void', 'delete',
]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name !== 'unpackage' && name !== 'node_modules' && name !== 'static') walk(p, out);
    } else if (name.endsWith('.uvue')) {
      out.push(p);
    }
  }
  return out;
}

/** 收集脚本里声明的所有名字 */
function collectDecls(script) {
  const decl = new Set();
  let m;

  // const / let / var
  const reVar = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = reVar.exec(script)) !== null) decl.add(m[1]);

  // 函数声明
  const reFn = /function\s+([A-Za-z_$][\w$]*)/g;
  while ((m = reFn.exec(script)) !== null) decl.add(m[1]);

  // import { a, b as c } from '...'
  const reImp = /import\s*\{([^}]+)\}\s*from/g;
  while ((m = reImp.exec(script)) !== null) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n) decl.add(n);
    }
  }

  // import X from '...'
  const reDef = /import\s+([A-Za-z_$][\w$]*)\s+from/g;
  while ((m = reDef.exec(script)) !== null) decl.add(m[1]);

  // defineProps({ a: ..., b: ... }) 的字段
  const props = script.match(/defineProps\(\{([\s\S]*?)\}\s*\)/);
  if (props) {
    const reKey = /([A-Za-z_$][\w$]*)\s*:/g;
    let k;
    while ((k = reKey.exec(props[1])) !== null) decl.add(k[1]);
  }

  return decl;
}

/** 收集模板里 v-for 引入的局部变量 */
function collectForVars(template) {
  const vars = new Set();
  const re = /v-for="\(?([^)"]+?)\)?\s+in\s+/g;
  let m;
  while ((m = re.exec(template)) !== null) {
    for (const part of m[1].split(',')) {
      const n = part.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) vars.add(n);
    }
  }
  return vars;
}

function check(file) {
  const src = fs.readFileSync(file, 'utf8');
  const idx = src.indexOf('<script');
  const template = idx < 0 ? src : src.slice(0, idx);
  const script = idx < 0 ? '' : src.slice(idx);

  const declared = collectDecls(script);
  const loopVars = collectForVars(template);
  const known = (name) => declared.has(name) || loopVars.has(name) || BUILTIN.has(name) || SYNTAX.has(name);

  const problems = [];
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  // 1) 纯插值 {{ name }}
  const reMust = /\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}/g;
  let m;
  while ((m = reMust.exec(template)) !== null) {
    if (!known(m[1])) problems.push(`${rel}  {{ ${m[1]} }} 未在 script 中定义`);
  }

  // 2) 函数调用 name(  —— 排除 a.b( 之类的成员方法
  const reCall = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = reCall.exec(template)) !== null) {
    const name = m[2];
    if (SYNTAX.has(name) || BUILTIN.has(name)) continue;
    // v-if="xxx (" 这类语法噪音跳过
    if (/^v-(if|else-if|for|show|model|bind|on|html|text)$/.test(name)) continue;
    if (!known(name)) problems.push(`${rel}  调用 ${name}() 未在 script 中定义`);
  }

  // 3) v-if / v-show / v-else-if 里出现的裸标识符
  const reCond = /v-(?:if|show|else-if)="([^"]*)"/g;
  while ((m = reCond.exec(template)) !== null) {
    const expr = m[1];
    // 取出表达式里的标识符（排除属性访问、字符串）
    const cleaned = expr.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
    // 前面不是点/字母数字下划线的才算独立标识符（排除 a.length / t.status 这类成员访问）
    const reId = /(^|[^.\w$])([A-Za-z_$][\w$]*)/g;
    let id;
    while ((id = reId.exec(cleaned)) !== null) {
      const name = id[2];
      if (SYNTAX.has(name) || BUILTIN.has(name)) continue;
      if (/^v-/.test(name)) continue;
      if (!known(name)) problems.push(`${rel}  v-if/v-show 表达式里的 ${name} 未定义（原表达式：${expr}）`);
    }
  }

  return problems;
}

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`找不到 uniappx 目录：${ROOT}`);
    process.exit(1);
  }
  const files = walk(ROOT);
  const all = [];
  for (const f of files) all.push(...check(f));

  // 去重
  const uniq = [...new Set(all)];

  if (uniq.length === 0) {
    console.log(`检查完成：${files.length} 个 .uvue 文件，模板引用全部有定义 ✓`);
    process.exit(0);
  }

  console.log(`发现 ${uniq.length} 处模板引用问题（App 端会导致渲染崩溃）：\n`);
  for (const p of uniq) console.log('  ✗ ' + p);
  console.log('\n提示：模板里引用的变量/函数必须在 <script setup> 中声明，且大小写完全一致。');
  process.exit(1);
}

main();
