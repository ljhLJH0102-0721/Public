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

const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ['index.html', 'solar/solar-system-hd.html', 'solar/deep/index.html', 'solar/sky/index.html'];
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
  let syntaxBad = 0, refBad = [], dupBad = [], nakedBad = 0, dangling = [];
  /* 全文件声明名集合（含结构赋值与参数），用于悬空引用判断 */
  const allDeclared = new Set();
  {
    let d2;
    const r1 = /(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
    while ((d2 = r1.exec(html))) allDeclared.add(d2[1]);
    const r2 = /(?:const|let|var)\s*[[{]([^\]}]*)[\]}]/g;
    while ((d2 = r2.exec(html))) String(d2[1]).split(',').forEach(s => { const n = s.split(':').pop().trim().split(/[=\s]/)[0]; if (/^[A-Za-z_$][\w$]*$/.test(n)) allDeclared.add(n) });
    const r3 = /(?:function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)|\(([^)]*)\)\s*=>)/g;
    while ((d2 = r3.exec(html))) String(d2[1] || d2[2] || '').split(',').forEach(p => { const n = p.trim().split(/[=\s]/)[0]; if (/^[A-Za-z_$][\w$]*$/.test(n)) allDeclared.add(n) });
    /* 逗号连写声明（let a=1, b=2）、对象键、解构等：一律视为已声明，避免误报 */
    const r4 = /[,\s({\[]([A-Za-z_$][\w$]*)\s*[=:]/g;
    while ((d2 = r4.exec(html))) allDeclared.add(d2[1]);
  }
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
    /* 悬空引用检查：if(NAME) 里的 NAME 必须在本块里声明过（const/let/var/function/参数）
       这一类错误不是语法错误，语法检查查不出来，但运行时会 ReferenceError 导致页面缺元素 */
    const declaredNames = new Set();
    let d;
    const declRe = /(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
    while ((d = declRe.exec(b.code))) declaredNames.add(d[1]);
    const paramRe = /(?:function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)|\(([^)]*)\)\s*=>)/g;
    while ((d = paramRe.exec(b.code))) {
      String(d[1] || d[2] || '').split(',').forEach(p => { const n = p.trim().split(/[=\s]/)[0]; if (/^[A-Za-z_$][\w$]*$/.test(n)) declaredNames.add(n) });
    }
    for (const kw of ['this', 'true', 'false', 'null', 'undefined', 'new', 'typeof', 'return', 'if', 'for', 'while', 'catch', 'function', 'await', 'in', 'of', 'do', 'else', 'switch']) declaredNames.add(kw);
    const guardRe = /if\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
    while ((d = guardRe.exec(b.code))) {
      if (!declaredNames.has(d[1]) && !allDeclared.has(d[1])) dangling.push('if(' + d[1] + ')');
    }
    /* 顶层函数重名（行首无缩进的 function） */
    const fnRe = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
    while ((r = fnRe.exec(b.code))) {
      const n = r[1];
      if (!fnSeen.has(n)) fnSeen.set(n, 1);
      else { fnSeen.set(n, fnSeen.get(n) + 1); dupBad.push(n); }
    }
  }
  const uniqRef = [...new Set(refBad)];
  const uniqDangle = [...new Set(dangling)];
  if (syntaxBad) fail++;
  if (uniqDangle.length) { fail++; console.log(red('  ✗ 悬空引用（变量声明已被删除但仍在用 → 运行时会 ReferenceError，导致页面元素缺失）: ' + uniqDangle.slice(0, 10).join(', '))); }
  else console.log(grn('  ✓ 无悬空变量引用'));
  if (uniqRef.length) { warn++; console.log(yel('  ! 引用了静态看不到的元素 id（' + uniqRef.length + ' 个，可能由 JS 动态创建，仅作参考，不要贸然删除）: ' + uniqRef.slice(0, 8).join(', '))); }
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
