#!/usr/bin/env node
/* ============================================================
   站点安全网（静态检查，不改动任何文件）
   1) JS 里 getElementById('x') / querySelector('#x') 引用的 id 是否真的存在
   2) 是否有重复的顶层函数名（覆盖定义会静默出错）
   3) 每个 <script> 块的语法
   4) 明显的危险写法：裸 getElementById(...).addEventListener
   运行： node tools/smoke.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const PAGES = ['index.html', 'solar/solar-system-hd.html', 'solar/deep/index.html', 'solar/sky/index.html'];
let fail = 0, warn = 0;
const red = (s) => '\x1b[31m' + s + '\x1b[0m';
const yel = (s) => '\x1b[33m' + s + '\x1b[0m';
const grn = (s) => '\x1b[32m' + s + '\x1b[0m';

function readPage(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}
/* 取出所有 <script> 块（含 type=module） */
function scriptBlocks(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)(?![^>]*type\s*=\s*["'](?:importmap|application\/json)["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ code: m[1], at: m.index });
  return out;
}

console.log('===== 站点安全网 =====\n');
for (const rel of PAGES) {
  const html = readPage(rel);
  if (!html) { console.log(yel('跳过（不存在）: ' + rel)); continue; }
  console.log('【' + rel + '】');

  /* 页面里出现过的所有 id（含 JS 里动态拼出来的） */
  const declared = new Set();
  const idRe = /id\s*=\s*["'\\]*([A-Za-z0-9_:.-]+)["'\\]*/g;
  let m;
  while ((m = idRe.exec(html))) declared.add(m[1]);

  const blocks = scriptBlocks(html);
  let syntaxBad = 0, refBad = [], dupBad = [], nakedBad = 0;
  const fnSeen = new Map();

  for (const b of blocks) {
    /* 语法检查 */
    try { new Function(b.code); } catch (e) {
      /* module 块用 Function 会因 import/await 报错，改用宽松判断 */
      if (!/import\s|await\s/.test(b.code)) { syntaxBad++; console.log(red('  ✗ 语法错误: ' + e.message)); }
    }
    /* 引用检查 */
    const refRe = /getElementById\(\s*['"]([A-Za-z0-9_:.-]+)['"]\s*\)/g;
    let r;
    while ((r = refRe.exec(b.code))) if (!declared.has(r[1])) refBad.push(r[1]);
    const qsRe = /querySelector\(\s*['"]#([A-Za-z0-9_:.-]+)['"]\s*\)/g;
    while ((r = qsRe.exec(b.code))) if (!declared.has(r[1])) refBad.push('#' + r[1]);
    /* 裸链式 addEventListener（历史踩过的坑） */
    const naked = /getElementById\([^)]*\)\.addEventListener/g;
    nakedBad += (b.code.match(naked) || []).length;
    /* 顶层函数重名（行首无缩进的 function） */
    const fnRe = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
    while ((r = fnRe.exec(b.code))) {
      const n = r[1];
      if (!fnSeen.has(n)) fnSeen.set(n, 1);
      else { fnSeen.set(n, fnSeen.get(n) + 1); dupBad.push(n); }
    }
  }
  const uniqRef = [...new Set(refBad)];
  if (syntaxBad) fail++;
  if (uniqRef.length) { fail++; console.log(red('  ✗ 引用了不存在的 id（' + uniqRef.length + ' 个）: ' + uniqRef.slice(0, 12).join(', '))); }
  else console.log(grn('  ✓ 所有 getElementById / #id 引用都存在'));
  if (dupBad.length) { warn++; console.log(yel('  ! 顶层函数重名（后者覆盖前者）: ' + [...new Set(dupBad)].join(', '))); }
  else console.log(grn('  ✓ 无重名顶层函数'));
  if (nakedBad) { if (rel === 'index.html') { fail++; console.log(red('  ✗ 裸链式 getElementById(...).addEventListener：' + nakedBad + ' 处')); } else { warn++; console.log(yel('  ! 裸链式事件绑定 ' + nakedBad + ' 处（独立页面，元素固定存在，低风险）')); } }
  else console.log(grn('  ✓ 无裸链式事件绑定'));
  console.log('  script 块数: ' + blocks.length);
  console.log('');
}
console.log('----------------------------------------');
console.log((fail ? red('失败 ' + fail + ' 项') : grn('全部通过')) + (warn ? yel('，警告 ' + warn + ' 项') : ''));
process.exit(fail ? 1 : 0);
