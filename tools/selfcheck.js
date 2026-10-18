#!/usr/bin/env node
/**
 * 站点上传前自检 —— 每次改完 index.html 后运行：node tools/selfcheck.js
 * 检查的是"容易在改动中被破坏、且用户能直接看到"的东西。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'index.html');
const t = fs.readFileSync(FILE, 'utf8');
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  [ok]   ' + m); };
const bad = (m) => { fail++; console.log('  [FAIL] ' + m); };
const check = (cond, good, msg) => (cond ? ok(good) : bad(msg));

console.log('自检 index.html (' + t.length + ' bytes)\n');

/* 1. JS syntax */
console.log('1) JavaScript 语法');
const scripts = [...t.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let syntaxOk = true;
scripts.forEach((s, i) => {
  try { new Function(s); } catch (e) { syntaxOk = false; console.log('     script#' + i + ': ' + e.message); }
});
check(syntaxOk, scripts.length + ' 个 script 块语法正常', '存在语法错误（见上）');

/* 2. CSS braces */
console.log('\n2) CSS 花括号平衡');
const css = [...t.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('');
const ob = (css.match(/{/g) || []).length, cb = (css.match(/}/g) || []).length;
check(ob === cb, 'CSS { } 平衡 (' + ob + '/' + cb + ')', 'CSS 括号不平衡 ' + ob + '/' + cb);

/* 3. view flags must only be assigned inside setViewFlags (regression guard) */
console.log('\n3) 视图状态唯一入口');
const svfStart = t.indexOf('function setViewFlags');
const svfEnd = svfStart < 0 ? -1 : (function () {
  let depth = 0, i = t.indexOf('{', svfStart), inStr = null;
  for (; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (ch === '\\') i++; else if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
})();
/* 声明一律写成 =false，只有切换视图才写 true，所以检查 "=true" 最准确 */
let stray = [];
[...t.matchAll(/(isLikedView|isHistoryView|isMySpaceView|isUserView)\s*=\s*true/g)].forEach(m => {
  if (!(svfStart > -1 && m.index >= svfStart && m.index <= svfEnd)) stray.push(m[1] + '@' + m.index);
});
check(svfStart > -1 && svfEnd > -1, 'setViewFlags 存在', 'setViewFlags 缺失');
check(stray.length === 0, '视图标志只在 setViewFlags 内赋 true', '有 ' + stray.length + ' 处散落在外部: ' + stray.join(', '));

/* 4. sidebar items all wired */
console.log('\n4) 侧栏导航项与点击分支');
const groupStart = t.indexOf('function navGroups()');
const groupEnd = t.indexOf('function renderSideNav', groupStart);
const groupSrc = (groupStart > -1 && groupEnd > groupStart) ? t.slice(groupStart, groupEnd) : '';
const navKeys = [...new Set([...groupSrc.matchAll(/k:'([a-zA-Z]+)'/g)].map(m => m[1]))];
const kindKeys = ['image', 'comic', 'post'];
const missing = navKeys.filter(k => !kindKeys.includes(k) && !new RegExp("k==='" + k + "'").test(t) && !new RegExp("R\\." + k + "\\s*=").test(t) && k !== 'collapse');
check(navKeys.length >= 10, '侧栏项共 ' + navKeys.length + ' 个', '侧栏项数量异常: ' + navKeys.length);
check(missing.length === 0, '所有侧栏项都有点击分支', '缺少分支: ' + missing.join(','));

/* 5. null-safe bindings */
console.log('\n5) 绑定空值安全');
const unsafe = (t.match(/getElementById\(['"][^'"]+['"]\)\.addEventListener/g) || []).length;
check(unsafe === 0, '没有未加保护的 addEventListener', unsafe + ' 处裸绑定');

/* 6. critical elements */
console.log('\n6) 关键元素');
['id="side-nav"', 'id="nav-mask"', 'id="main-view"', 'id="sp-view"', 'id="set-view"', 'id="user-page"', 'id="sp-list"', 'id="post-area"', 'id="trans-area"'].forEach(id => {
  check(t.indexOf(id) > -1, id + ' 存在', id + ' 缺失');
});

/* 7. single definitions */
console.log('\n7) 关键函数唯一');
['openNav', 'closeNav', 'syncNavActive', 'renderSideNav', 'applySiteTheme', 'setViewFlags', 'toggleTheme'].forEach(f => {
  const n = (t.match(new RegExp('function ' + f + '\\(', 'g')) || []).length;
  check(n === 1, f + ' 定义 1 处', f + ' 定义 ' + n + ' 处（应为 1）');
});

/* 8. theme integrity */
console.log('\n8) 主题');
check(t.indexOf('function applyTheme(') < 0, '无遗留的旧 applyTheme', '旧 applyTheme 仍然存在（会覆盖新主题）');
check(t.indexOf('[data-theme="dark"],body.dark{') > -1, '暗色双选择器存在', '暗色选择器缺失');
const ri = t.indexOf(':root{'), di = t.indexOf('[data-theme="dark"],body.dark{');
check(ri > -1 && di > ri, '暗色规则位于 :root 之后', '暗色规则位置错误（会被 :root 覆盖）');

/* 9. version */
console.log('\n9) 版本号');
const ver = (t.match(/var V='([^']*)'/) || [])[1];
check(!!ver, '版本号 ' + ver, '版本号缺失');

/* 10. div 开闭平衡（插入错位置的 div 会导致视图嵌套错乱） */
console.log('\n10) div 标签平衡');
const dOpen = (t.match(/<div\b/g) || []).length;
const dClose = (t.match(/<\/div>/g) || []).length;
check(dOpen === dClose, 'div 开闭平衡 (' + dOpen + '/' + dClose + ')', 'div 不平衡：开 ' + dOpen + ' / 闭 ' + dClose + '（差值 ' + (dOpen - dClose) + '）');

/* 11. 视图容器必须同层（深度 0；post-view 允许 1~2） */
console.log('\n11) 视图容器同层');
const VIEW_IDS = ['ai-view', 'anime-view', 'main-view', 'sp-view', 'sci-view', 'ws-view', 'pg-view', 'set-view', 'coll-view', 'detail-view'];
const depthOf = {};
{
  let d = 0;
  for (const m of t.matchAll(/<div\b[^>]*>|<\/div>/g)) {
    const s = m[0];
    if (s === '</div>') { d--; continue; }
    const idm = s.match(/id="([^"]+)"/);
    if (idm && VIEW_IDS.includes(idm[1])) depthOf[idm[1]] = d;
    d++;
  }
}
const deepViews = Object.keys(depthOf).filter(k => depthOf[k] !== 0);
check(deepViews.length === 0,
  '视图容器全部同层（' + Object.keys(depthOf).length + ' 个）',
  '视图嵌套异常：' + deepViews.map(k => k + ' depth=' + depthOf[k]).join(', '));

/* 12. 每个视图容器都必须"默认隐藏 + .open 显示"（v105 那次叠加 bug 的根因）
      main-view 是特例：默认显示，靠 .hidden 类隐藏 */
console.log('\n12) 视图容器显隐规则');
const noHide = VIEW_IDS.filter(id => {
  if (id === 'main-view') return t.indexOf('#main-view.hidden{display:none') < 0;
  return t.indexOf('#' + id + '{display:none') < 0;
});
check(noHide.length === 0,
  '所有视图都有正确的隐藏规则',
  '缺隐藏规则（会永久挂在页面上）：' + noHide.join(', '));

console.log('\n----------------------------------------');
console.log(pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
