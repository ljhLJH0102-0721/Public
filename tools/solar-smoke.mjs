/* 在 Node 里真实执行太阳系模块，抓运行时异常（DOM/图片/渲染器全部打桩） */
import fs from 'fs';

const ctx2d = {
  createRadialGradient: () => ({ addColorStop() {} }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createPattern: () => ({}),
  fillRect() {}, strokeRect() {}, clearRect() {}, fill() {}, stroke() {}, arc() {}, beginPath() {}, closePath() {},
  moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, drawImage() {}, save() {}, restore() {},
  translate() {}, rotate() {}, scale() {}, setTransform() {}, ellipse() {}, rect() {}, clip() {},
  putImageData() {},
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }),
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }),
  setLineDash() {}, getLineDash: () => [], getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  roundRect() {}, transform() {}, resetTransform() {}, isPointInPath: () => false,
  measureText: () => ({ width: 10 }), fillText() {}, set filter(v) {}, get filter() { return '' }
};
let imgLoaded = 0;
function mkEl(tag) {
  const listeners = {};
  const el = {
    tagName: String(tag || 'div').toUpperCase(), id: '',
    style: new Proxy({}, { get: (t, k) => (k in t ? t[k] : ''), set: (t, k, v) => { t[k] = v; return true } }),
    dataset: {}, children: [], attributes: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false }, item() { return null } },
    textContent: '', innerHTML: '', value: '', checked: false, disabled: false,
    href: '', download: '', title: '', placeholder: '', type: '', crossOrigin: '',
    width: 1024, height: 512, offsetWidth: 1200, offsetHeight: 800, clientWidth: 1200, clientHeight: 800,
    naturalWidth: 1024, naturalHeight: 512, complete: true, files: [], options: [],
    appendChild(c) { this.children.push(c); return c }, removeChild() {}, insertBefore() {}, replaceChildren() {},
    insertAdjacentHTML() {}, append() {}, prepend() {}, remove() {}, cloneNode() { return mkEl(tag) },
    setAttribute(k, v) { this.attributes[k] = v }, getAttribute(k) { return k in this.attributes ? this.attributes[k] : null },
    removeAttribute(k) { delete this.attributes[k] }, hasAttribute(k) { return k in this.attributes },
    addEventListener(t, cb) { (listeners[t] = listeners[t] || []).push(cb) },
    removeEventListener(t, cb) { if (listeners[t]) listeners[t] = listeners[t].filter(f => f !== cb) },
    dispatchEvent() { return true }, __fire(t) { (listeners[t] || []).forEach(f => f({ type: t })) },
    querySelector() { return mkEl('div') }, querySelectorAll() { return [] },
    getElementsByTagName() { return [] }, closest() { return null }, contains() { return false },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800, x: 0, y: 0 } },
    getContext() { return ctx2d }, toDataURL() { return 'data:,' }, focus() {}, blur() {}, click() {},
    setPointerCapture() {}, releasePointerCapture() {}, scrollIntoView() {}, add() {}, after() {}, before() {},
    animate() { return { cancel() {}, finished: Promise.resolve() } },
    getRootNode() { return globalThis.document }, matches() { return false },
    get parentElement() { return globalThis.__pstub || (globalThis.__pstub = mkEl('div')) },
    get firstChild() { return null }, get nextSibling() { return null }, get parentNode() { return this.parentElement }
  };
  Object.defineProperty(el, 'src', {
    get() { return this._src || '' },
    set(v) {
      this._src = v; imgLoaded++;
      setTimeout(() => { try { this.__fire('load'); if (typeof this.onload === 'function') this.onload({ type: 'load' }) } catch (e) {} }, 0);
    }
  });
  return el;
}
const doc = {
  documentElement: mkEl('html'), head: mkEl('head'), body: mkEl('body'),
  getElementById: () => mkEl('div'), createElement: (t) => mkEl(t), createElementNS: (ns, t) => mkEl(t),
  querySelector: () => mkEl('div'), querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, hidden: false, readyState: 'complete', visibilityState: 'visible',
  createDocumentFragment: () => mkEl('fragment'), fonts: { ready: Promise.resolve() }
};
globalThis.document = doc;
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.innerWidth = 1400; globalThis.innerHeight = 900; globalThis.devicePixelRatio = 1;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.parent = globalThis;
globalThis.location = { href: 'https://x/Public/solar/solar-system-hd.html', search: '', hash: '', origin: 'https://x' };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {}, removeEventListener() {} });
globalThis.Image = function () { return mkEl('img') };
globalThis.HTMLCanvasElement = class {}; globalThis.HTMLImageElement = class {};
globalThis.WebGLRenderingContext = class {};
globalThis.URL.createObjectURL = () => 'blob:x'; globalThis.URL.revokeObjectURL = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', maxTouchPoints: 0, language: 'zh-CN' }, configurable: true }) } catch (e) {}
globalThis.__FakeRenderer = class {
  constructor() {
    this.domElement = mkEl('canvas');
    this.shadowMap = { enabled: false, type: 0, autoUpdate: true, needsUpdate: false };
    this.capabilities = { getMaxAnisotropy: () => 4, isWebGL2: true, maxTextureSize: 4096, precision: 'highp' };
    this.outputColorSpace = ''; this.toneMapping = 0; this.toneMappingExposure = 1;
    this.info = { memory: {}, render: {}, autoReset: true, reset() {} };
    this.xr = { enabled: false };
  }
  setPixelRatio() {} getPixelRatio() { return 1 } setSize() {} setClearColor() {} setClearAlpha() {}
  setAnimationLoop(cb) { globalThis.__loopCb = cb } render() {} compile() {} dispose() {}
  setScissorTest() {} setViewport() {} setRenderTarget() {} clear() {} getContext() { return {} }
  getSize() { return { x: 1400, y: 900 } }
};

const V = 'C:/Users/Administrator/Public/_pv';
fs.rmSync(V, { recursive: true, force: true });
fs.mkdirSync(V + '/addons/controls', { recursive: true });
fs.copyFileSync('C:/Users/Administrator/Public/solar/vendor/three.module.js', V + '/three.module.js');
let oc = fs.readFileSync('C:/Users/Administrator/Public/solar/vendor/addons/controls/OrbitControls.js', 'utf8');
oc = oc.replace(/from\s+'three'/g, "from '../../three.module.js'").replace(/from\s+"three"/g, 'from "../../three.module.js"');
fs.writeFileSync(V + '/addons/controls/OrbitControls.js', oc);

const html = fs.readFileSync('C:/Users/Administrator/Public/solar/solar-system-hd.html', 'utf8');
const mm = html.match(/<script type="module">([\s\S]*?)<\/script>/);
let code = mm[1];
code = code.replace(/await import\('three'\)/g, "await import('../_pv/three.module.js')");
code = code.replace(/await import\('three\/addons\//g, "await import('../_pv/addons/");
code = code.replace(/new THREE\.WebGLRenderer\(/g, 'new globalThis.__FakeRenderer(');
const probeUrl = new URL('../solar/_probe.mjs', import.meta.url);
fs.writeFileSync(probeUrl, code);

let failed = false;
try {
  await import(probeUrl.href);
  console.log('模块执行完成，无异常 ✓  （打桩加载图片数：' + imgLoaded + '）');
} catch (e) {
  failed = true;
  console.log('❌ 运行时异常：' + (e && e.message));
  console.log(String((e && e.stack) || '').split('\n').slice(0, 14).join('\n'));
}
console.log('到达 setAnimationLoop：' + (globalThis.__loopCb ? '是 ✓' : '否 ✗ ← 页面会一直卡在加载'));
try { fs.unlinkSync(probeUrl) } catch (e) {}
fs.rmSync(V, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
