/* 行为验证：把 index.html 里的视图管理代码抽出来，在桩 DOM 上真跑一遍 */
const fs = require('fs');
const t = fs.readFileSync('index.html', 'utf8');

/* 抽出 allViewIds / isViewOpen / closeAllViews / openView 源码 */
const startIdx = t.indexOf('function allViewIds(');
const endMark = '/* 保险：任何视图被打开';
const endIdx = t.indexOf(endMark, startIdx);
if (startIdx < 0 || endIdx < 0) { console.log('❌ 无法抽取视图管理源码'); process.exit(1) }
const src = t.slice(startIdx, endIdx);

/* 桩 DOM：11 个视图容器 */
const VIEWS = ['main-view', 'sp-view', 'sci-view', 'ws-view', 'ai-view', 'anime-view', 'pg-view', 'set-view', 'coll-view', 'detail-view', 'post-view'];
const nodes = {};
VIEWS.forEach(id => {
  const cls = new Set(id === 'main-view' ? [] : ['x']);
  nodes[id] = {
    id,
    style: { display: '' },
    classList: {
      add(c) { cls.add(c) },
      remove(c) { cls.delete(c) },
      contains(c) { return cls.has(c) },
      _set: cls
    },
    _cls: cls
  };
});
const document = {
  querySelectorAll(sel) { return sel === '[id$="-view"]' ? VIEWS.map(id => nodes[id]) : [] },
  getElementById(id) { return nodes[id] || null }
};
const window = {};

/* 执行抽出的代码 */
const fn = new Function('document', 'window', src + '\nreturn { allViewIds, closeAllViews, openView, isViewOpen };');
const api = fn(document, window);

const opened = () => VIEWS.filter(id => nodes[id]._cls.has('open') || (id === 'post-view' && nodes[id].style.display === 'block'));
const ok = (cond, msg) => console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
let fails = 0;
const assert = (cond, msg) => { if (!cond) fails++; ok(cond, msg) };

console.log('视图管理行为测试（' + VIEWS.length + ' 个容器）\n');

/* 用例 1：全开状态下 openView('anime-view') */
console.log('1) 所有视图都打开 → openView(anime-view)');
VIEWS.forEach(id => { nodes[id]._cls.add('open'); if (id === 'post-view') nodes[id].style.display = 'block' });
api.openView('anime-view');
assert(opened().length === 1 && opened()[0] === 'anime-view', '只剩 anime-view 打开（实际: ' + opened().join(',') + '）');

/* 用例 2：进入动漫区后再进太阳系（用户报的场景） */
console.log('\n2) 动漫区 → 太阳系');
api.openView('sci-view');
assert(opened().length === 1 && opened()[0] === 'sci-view', '只剩 sci-view 打开（实际: ' + opened().join(',') + '）');

/* 用例 3：动漫区 → AI 区 */
console.log('\n3) 动漫区 → AI 区');
api.openView('anime-view');
api.openView('ai-view');
assert(opened().length === 1 && opened()[0] === 'ai-view', '只剩 ai-view 打开（实际: ' + opened().join(',') + '）');

/* 用例 4：博文（display 型）与视图互斥 */
console.log('\n4) 打开博文后进 AI 区');
nodes['post-view'].classList.add('open');
nodes['post-view'].style.display = 'block';
api.openView('ai-view');
assert(nodes['post-view'].style.display === 'none' && opened().length === 1, '博文容器已隐藏（display=' + nodes['post-view'].style.display + '，打开中: ' + opened().join(',') + '）');

/* 用例 5：11 个视图逐个 openView，始终只有一个打开 */
console.log('\n5) 逐个切换 11 个视图');
let monotonic = true, detail = [];
for (const id of VIEWS) {
  api.openView(id);
  const op = opened();
  const good = op.length === 1 && op[0] === id;
  if (!good) { monotonic = false; detail.push(id + '→' + op.join(',')) }
}
assert(monotonic, '每次切换后都只有一个视图打开' + (detail.length ? '（异常: ' + detail.join(' | ') + '）' : ''));

/* 用例 6：模拟"某处忘了关闭"——直接给 anime-view 加 open，然后 closeAllViews 兜底 */
console.log('\n6) 模拟忘记关闭（anime-view 与 sci-view 同时 open）');
api.openView('anime-view');
nodes['sci-view'].classList.add('open');
console.log('   构造出的叠加状态: ' + opened().join(' + '));
api.closeAllViews('sci-view');
assert(opened().length === 1 && opened()[0] === 'sci-view', '兜底关闭生效（实际: ' + opened().join(',') + '）');

/* 用例 7：新视图自动纳入（模拟未来新增 live-view） */
console.log('\n7) 未来新增视图（live-view）是否自动纳入');
const liveCls = new Set(['open']);
nodes['live-view'] = {
  id: 'live-view',
  style: { display: '' },
  _cls: liveCls,
  classList: {
    add(c) { liveCls.add(c) },
    remove(c) { liveCls.delete(c) },
    contains(c) { return liveCls.has(c) }
  }
};
VIEWS.push('live-view');
api.openView('anime-view');
assert(opened().length === 1 && opened()[0] === 'anime-view', 'live-view 也被自动关闭（实际: ' + opened().join(',') + '）');

console.log('\n' + (fails ? '❌ ' + fails + ' 项失败' : '✅ 全部通过：视图叠加在结构上已不可能发生'));
process.exit(fails ? 1 : 0);
