/*
 * runtime.js — a tiny stand-in for the dashboard runtime the page was first
 * built on. It loads the files in data/, computes derived values, and redraws
 * every registered drawing when data arrives, the width changes, or the theme
 * flips. The page scripts in dashboard.js talk to it through window.dash.
 *
 *   dash.data(id)          -> { status: 'loading'|'ok'|'error'|'missing', data, columns, message }
 *   dash.calc(id, spec)    -> register a value derived from other sources
 *   dash.draw(name, fn)    -> register fn(el) for every [data-draw="name"]; dash.draw(name) redraws it
 *   dash.onData(fn)        -> run fn now and on every change
 *   dash.colors            -> eight series colors for the current theme
 */
(function () {
  'use strict';

  // Every data file the page reads. Paths are relative so the site works
  // from any GitHub Pages subpath (https://<user>.github.io/<repo>/).
  const SOURCES = {
    overview: { url: 'data/overview.json', format: 'json' },
    archives: { url: 'data/archives.csv', format: 'csv' },
    keywords: { url: 'data/keywords.csv', format: 'csv' },
    monthly: { url: 'data/monthly.csv', format: 'csv' },
    hospital: { url: 'data/hospital.csv', format: 'csv' },
  };

  const PALETTE = {
    light: ['#2563a8', '#c9581a', '#2f8a5b', '#8a4fb0', '#a87b1f', '#c23b5b', '#2f8597', '#6b7280'],
    dark: ['#6aa6e8', '#f08a4b', '#5fc08c', '#b98ae0', '#e0b45a', '#ef7593', '#6cc2d4', '#9ca3af'],
  };

  const store = {};
  const calcs = {};
  const calcCache = {};
  const draws = {};
  const listeners = [];
  let version = 0;

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : prefersDark.matches;
  };

  function sourceState(id) {
    if (store[id]) return store[id];
    return { status: SOURCES[id] ? 'loading' : 'missing', data: [], columns: [], message: '' };
  }

  function calcState(id) {
    const cached = calcCache[id];
    if (cached && cached.version === version) return cached.value;
    const spec = calcs[id];
    const inputs = spec.inputs.map((i) => dash.data(i));
    let value;
    if (inputs.some((g) => g.status === 'error' || g.status === 'missing')) {
      value = { status: 'error', data: [], message: 'An input failed to load' };
    } else if (inputs.some((g) => g.status !== 'ok')) {
      value = { status: 'loading', data: [] };
    } else {
      try {
        value = { status: 'ok', data: spec.fn(...inputs.map((g) => g.data)) };
      } catch (err) {
        console.error('[dash] calc "' + id + '" failed:', err);
        value = { status: 'error', data: [], message: String(err) };
      }
    }
    calcCache[id] = { version, value };
    return value;
  }

  function runDraw(name) {
    const fn = draws[name];
    if (!fn) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
      try {
        fn(el);
      } catch (err) {
        console.error('[dash] drawing "' + name + '" failed:', err);
      }
    });
  }

  let pending = false;
  function redrawAll() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      Object.keys(draws).forEach(runDraw);
      listeners.forEach((fn) => {
        try { fn(); } catch (err) { console.error('[dash] listener failed:', err); }
      });
    });
  }

  const dash = {
    get colors() { return isDark() ? PALETTE.dark : PALETTE.light; },
    data(id) { return calcs[id] ? calcState(id) : sourceState(id); },
    calc(id, spec) { calcs[id] = spec; },
    draw(name, fn) {
      if (fn) draws[name] = fn;
      runDraw(name);
    },
    onData(fn) { listeners.push(fn); fn(); },
    redraw: redrawAll,
  };
  window.dash = dash;

  // Load every source in parallel; each one redraws the page as it lands.
  Object.entries(SOURCES).forEach(([id, src]) => {
    fetch(src.url, { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
        return res.text();
      })
      .then((text) => {
        if (src.format === 'json') {
          const parsed = JSON.parse(text);
          const rows = Array.isArray(parsed) ? parsed : parsed.rows || parsed.data || parsed.results || [parsed];
          store[id] = { status: 'ok', data: rows, columns: rows[0] ? Object.keys(rows[0]) : [] };
        } else {
          const rows = d3.csvParse(text);
          store[id] = { status: 'ok', data: rows, columns: rows.columns };
        }
      })
      .catch((err) => {
        console.error('[dash] could not load ' + src.url + ':', err);
        store[id] = { status: 'error', data: [], columns: [], message: String(err) };
      })
      .finally(() => {
        version += 1;
        redrawAll();
      });
  });

  // Redraw when the content width changes (charts size from clientWidth).
  let lastWidth = 0;
  let resizeTimer = null;
  const ro = new ResizeObserver((entries) => {
    const w = Math.round(entries[0].contentRect.width);
    if (w === lastWidth) return;
    lastWidth = w;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redrawAll, 120);
  });
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('dash-root');
    if (root) ro.observe(root);
  });

  // Theme: follows the system unless the reader picks one with the toggle.
  function applyStoredTheme() {
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch (e) { /* storage blocked */ }
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  }
  applyStoredTheme();
  prefersDark.addEventListener('change', redrawAll);

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const label = () => btn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
    label();
    btn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked */ }
      label();
      redrawAll();
    });
  });
})();
