// Test harness: runs the real app script from index.html inside a minimal DOM stub.
//
// The app is a single HTML file with an inline IIFE, so instead of duplicating its
// logic here we extract that script and execute it in a fresh vm context with just
// enough browser surface (DOM, localStorage, location, dialogs) for it to boot.
// `window.supabase` is deliberately absent, so the app runs in local-only mode and
// never touches the network.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HERE, "..", "index.html");

function appSource() {
  const html = readFileSync(INDEX, "utf8");
  // The only <script> without attributes is the app itself.
  const m = html.match(/<script>\s*([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Could not find the inline app script in index.html");
  return m[1];
}

class El {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.hidden = false;
    this._attrs = {};
    this._listeners = {};
    const self = this;
    this.classList = {
      add(...names) { names.forEach((n) => { if (!self._classes().includes(n)) self.className = (self.className + " " + n).trim(); }); },
      remove(...names) { self.className = self._classes().filter((c) => !names.includes(c)).join(" "); },
      contains(n) { return self._classes().includes(n); },
      toggle(n, on) { const has = self._classes().includes(n); const want = on === undefined ? !has : !!on; want ? this.add(n) : this.remove(n); }
    };
    Object.defineProperty(this, "innerHTML", {
      get() { return ""; },
      set() { self.children = []; }
    });
  }
  _classes() { return this.className.split(/\s+/).filter(Boolean); }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  focus() {}
  click() { if (typeof this.onclick === "function") this.onclick({ target: this }); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  // Test helper: fire an event at this element (listeners + the on<type> property).
  dispatch(type, ev) {
    const e = Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, ev || {});
    (this._listeners[type] || []).forEach((fn) => fn.call(this, e));
    const direct = this["on" + type];
    if (typeof direct === "function") direct.call(this, e);
    return e;
  }
}

function makeDocument() {
  const byId = new Map();
  const doc = {
    activeElement: null,
    hidden: false,
    _listeners: {},
    body: new El("body"),
    getElementById(id) {
      if (!byId.has(id)) {
        const el = new El(id === "entryForm" ? "form" : "div");
        // The edit modal's tolerance control is a real two-button group in index.html;
        // seed it so the app's wiring loop has something to bind to.
        if (id === "editTol") {
          ["ok", "much"].forEach((v) => { const b = new El("button"); b.setAttribute("data-v", v); el.appendChild(b); });
        }
        byId.set(id, el);
      }
      return byId.get(id);
    },
    createElement(tag) { return new El(tag); },
    addEventListener(type, fn) { (doc._listeners[type] = doc._listeners[type] || []).push(fn); },
    dispatch(type, ev) { (doc._listeners[type] || []).forEach((fn) => fn.call(doc, Object.assign({ type }, ev || {}))); }
  };
  return doc;
}

function makeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    _dump: () => Object.fromEntries(map)
  };
}

/**
 * Boot a fresh instance of the app.
 * @param {object} [opts]
 * @param {object} [opts.storage] initial localStorage contents (e.g. from a previous instance)
 * @returns test environment with `CT` (the app's test hook), `document`, dialog spies, etc.
 */
export function loadApp(opts = {}) {
  const document = makeDocument();
  const localStorage = makeStorage(opts.storage || { "ct.syncCode": "test-sync-code" });
  const calls = { alerts: [], confirms: [] };
  const answers = { confirm: false };

  const ctx = {
    console,
    document,
    localStorage,
    location: { hash: "", pathname: "/", search: "" },
    history: { replaceState() {} },
    navigator: {},
    crypto: globalThis.crypto,
    alert: (msg) => { calls.alerts.push(String(msg)); },
    confirm: (msg) => { calls.confirms.push(String(msg)); return answers.confirm; },
    prompt: () => null,
    // Real timeouts (the submit lock uses one) but unref'd so they never hold the process open.
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
    clearTimeout: (t) => clearTimeout(t),
    setInterval: () => 0,          // the 15s sync poll is pointless offline
    clearInterval: () => {}
  };
  ctx._listeners = {};
  ctx.addEventListener = (type, fn) => { (ctx._listeners[type] = ctx._listeners[type] || []).push(fn); };
  ctx.dispatchEvent = (type, ev) => { (ctx._listeners[type] || []).forEach((fn) => fn(Object.assign({ type }, ev || {}))); };
  ctx.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(appSource(), ctx, { filename: "index.html#app" });

  return {
    CT: ctx.CT,
    window: ctx,
    document,
    localStorage,
    calls,
    /** Answer the next confirm() dialogs with `v`. */
    setConfirm(v) { answers.confirm = v; },
    lastAlert() { return calls.alerts[calls.alerts.length - 1]; },
    storageDump() { return localStorage._dump(); }
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
