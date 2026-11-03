/* dash-shim: a minimal stand-in for the Claude dashboard runtime, so these pages run as a static site.
   It reads the datasets listed in window.DASH_DATASETS from local files and supports
   dash.data, dash.calc, dash.draw, dash.onData and dash.colors. */
(function () {
  const cfg = window.DASH_DATASETS || {};
  const store = {}, calcs = {}, draws = [], listeners = [];
  let started = false, queued = false;

  function load(id) {
    if (store[id]) return;
    const c = cfg[id];
    if (!c) { store[id] = { status: 'missing', data: [] }; return; }
    store[id] = { status: 'loading', data: [] };
    const fmt = c.format || (/\.json$/i.test(c.url) ? 'json' : 'csv');
    fetch(c.url)
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return fmt === 'json' ? r.json() : r.text(); })
      .then((x) => {
        let rows = fmt === 'json' ? (Array.isArray(x) ? x : x.rows || x.data || x.results || []) : d3.csvParse(x);
        store[id] = { status: 'ok', data: rows, columns: rows.columns || Object.keys(rows[0] || {}) };
        schedule();
      })
      .catch((e) => { store[id] = { status: 'error', data: [], message: String(e) }; console.error('dataset ' + id, e); schedule(); });
  }

  function calcData(id) {
    const c = calcs[id];
    const ins = c.inputs.map((i) => data(i));
    const bad = ins.find((r) => r.status !== 'ok');
    if (bad) return { status: bad.status === 'error' ? 'error' : 'loading', data: [] };
    const keys = ins.map((r) => r.data);
    if (c.cache && c.keys.every((k, i) => k === keys[i])) return c.cache;
    c.keys = keys;
    try { c.cache = { status: 'ok', data: c.fn.apply(null, keys) }; }
    catch (e) { console.error('calc ' + id, e); c.cache = { status: 'error', data: [], message: String(e) }; }
    return c.cache;
  }

  function data(id) {
    if (calcs[id]) return calcData(id);
    load(id);
    return store[id];
  }

  function runOne(d, el) {
    if (el.closest('[hidden]')) return;
    const s = d.spec;
    try {
      if (typeof s === 'function') { s(el); return; }
      let m = d.els.get(el);
      if (!m) { el.replaceChildren(); m = { made: s.mount ? s.mount(el) : undefined }; d.els.set(el, m); }
      if (s.update) s.update(el, m.made);
    } catch (e) { console.error('draw ' + d.name, e); }
  }

  function runDraw(name) {
    for (const d of draws) {
      if (name && d.name !== name) continue;
      document.querySelectorAll('[data-draw="' + d.name + '"]').forEach((el) => { watch(el); runOne(d, el); });
    }
  }

  const ro = 'ResizeObserver' in window ? new ResizeObserver((es) => {
    for (const e of es) {
      const el = e.target, w = Math.round(e.contentRect.width);
      if (el.__w === w) continue;
      const first = el.__w == null;
      el.__w = w;
      if (!first) { const nm = el.getAttribute('data-draw'); for (const d of draws) if (d.name === nm) runOne(d, el); }
    }
  }) : null;
  function watch(el) { if (ro && !el.__watched) { el.__watched = true; ro.observe(el); } }

  function runAll() {
    queued = false;
    for (const f of listeners) { try { f(); } catch (e) { console.error(e); } }
    runDraw();
  }
  function schedule() { if (started && !queued) { queued = true; requestAnimationFrame(runAll); } }

  window.dash = {
    data,
    calc(id, spec) { calcs[id] = { inputs: spec.inputs || [], fn: spec.fn, cache: null, keys: [] }; },
    loader() {},
    draw(name, spec) {
      if (spec === undefined) { runDraw(name); return; }
      const d = { name, spec, els: new Map() };
      draws.push(d);
      if (started) runDraw(name);
    },
    onData(fn) { listeners.push(fn); if (started) fn(); },
    colors: ['#43ff78', '#31c25e', '#ffb347', '#7ee8fa', '#c9b2ff', '#ff7a90', '#bff5cc', '#2a7a43'],
    params: () => ({}), setParams() {}, resetParams() {}, setLink() {}, refresh() {},
    __start() { if (started) return; started = true; runAll(); },
  };
})();
