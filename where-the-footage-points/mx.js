/* MX: shared kit — formats, tooltip, and a small canvas 3D engine drawn as black line art on white. */
(function () {
  if (window.MX) return;
  const MX = (window.MX = {});
  MX.C = { bg: '#ffffff', paper: '#ffffff', ink: '#000000', body: '#1a1a1a', mute: '#666666', hair: '#d4d4d4', faint: '#9a9a9a', shade: '#ededed', red: '#cc0000', redShade: '#f7dede' };
  /* box styles: plain line art, red for the thing the sentence is about */
  MX.S = {
    base: { side: '#ffffff', top: '#e9e9e9', edge: '#000000' },
    soft: { side: '#ffffff', top: '#f4f4f4', edge: '#9a9a9a' },
    hot: { side: '#fbecec', top: '#cc0000', edge: '#cc0000', lw: 1.4 },
  };
  MX.reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const mf = d3.utcFormat('%b %Y');
  MX.fmt = {
    n: d3.format(','),
    pct: d3.format('.1%'),
    pct0: d3.format('.0%'),
    compact: (v) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v),
    month: (m) => mf(new Date(String(m).slice(0, 7) + '-01T00:00:00Z')),
  };
  MX.MONTH = (m) => MX.fmt.month(m).toUpperCase();
  MX.bar = (frac, w) => { const k = Math.max(0, Math.min(w, Math.round(frac * w))); return '█'.repeat(k) + '░'.repeat(w - k); };
  MX.pad = (s, n) => { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };
  MX.lpad = (s, n) => { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; };
  MX.err = (el) => { el.replaceChildren(); const d = document.createElement('div'); d.className = 'mx-err'; d.textContent = 'This figure could not be loaded.'; el.append(d); };
  MX.text = (id, get, fmt) => (el) => {
    const g = dash.data(id);
    if (g.status !== 'ok') { el.textContent = '—'; return; }
    const v = get(g.data);
    el.textContent = v == null || v === '' ? '—' : fmt ? fmt(v) : String(v);
  };

  MX.tip = (box) => {
    let t = null;
    return {
      show(lines, x, y) {
        if (!t) { t = document.createElement('div'); t.className = 'mx-tip'; box.append(t); }
        t.replaceChildren(...lines.map((s) => { const d = document.createElement('div'); d.textContent = s; return d; }));
        const bw = box.clientWidth;
        t.style.left = Math.max(0, Math.min(x + 14, bw - t.offsetWidth - 2)) + 'px';
        t.style.top = Math.max(0, y - t.offsetHeight - 12) + 'px';
      },
      hide() { if (t) { t.remove(); t = null; } },
    };
  };

  /* Falling digits: dates and coordinates are what this archive is made of. */
  MX.rain = function (cv) {
    const ctx = cv.getContext('2d');
    const CH = '0123456789.:/-';
    const S = 15;
    let w = 0, h = 0, cols = [], raf = 0, last = 0, vis = true, io = null;
    function still() {
      ctx.font = '12px monospace';
      for (let i = 0; i < cols.length; i++) for (let j = 0; j < h / S; j++) {
        if (Math.random() < 0.07) { ctx.fillStyle = Math.random() < 0.15 ? MX.C.bright : MX.C.dim; ctx.fillText(CH[(Math.random() * CH.length) | 0], i * S, j * S + S); }
      }
    }
    function step(ts) {
      raf = 0;
      if (!vis) return;
      if (ts - last > 65) {
        last = ts;
        ctx.fillStyle = 'rgba(2,7,4,0.17)';
        ctx.fillRect(0, 0, w, h);
        ctx.font = '13px monospace';
        for (let i = 0; i < cols.length; i++) {
          const y = cols[i] * S;
          if (y > 0) { ctx.fillStyle = Math.random() < 0.05 ? MX.C.hot : MX.C.bright; ctx.fillText(CH[(Math.random() * CH.length) | 0], i * S, y); }
          cols[i] = y > h && Math.random() > 0.96 ? 0 : cols[i] + 1;
        }
      }
      raf = requestAnimationFrame(step);
    }
    function go() { if (!raf && vis && !MX.reduced()) raf = requestAnimationFrame(step); }
    function size() {
      const r = cv.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Array.from({ length: Math.ceil(w / S) }, () => -Math.random() * (h / S) * 1.5);
      ctx.fillStyle = MX.C.bg; ctx.fillRect(0, 0, w, h);
      if (MX.reduced()) still(); else go();
    }
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((es) => { for (const en of es) { vis = en.isIntersecting; if (vis) go(); } }, { root: document });
      io.observe(cv);
    }
    size();
    return { resize: size, stop() { if (raf) cancelAnimationFrame(raf); raf = 0; if (io) io.disconnect(); } };
  };

  /* A small 3D view on a canvas: y is up; drag or arrow keys rotate; hover or tap picks. */
  MX.view3d = function (box, o) {
    const cv = document.createElement('canvas');
    cv.tabIndex = 0;
    cv.setAttribute('role', 'img');
    if (o.label) cv.setAttribute('aria-label', o.label);
    box.append(cv);
    const ctx = cv.getContext('2d');
    const tip = MX.tip(box);
    const minP = o.minPitch != null ? o.minPitch : 0.04, maxP = o.maxPitch != null ? o.maxPitch : 1.5;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
    const st = { yaw: o.yaw != null ? o.yaw : 0.6, pitch: o.pitch != null ? o.pitch : 0.5, tYaw: null, tPitch: null, w: 0, h: 0, dirty: true, raf: 0, last: 0, t: 0, drag: null, visible: true, auto: o.auto || 0, sway: o.sway || 0, user: false, P: null };
    function size() {
      const w = Math.max(box.clientWidth, 240);
      const h = Math.round(o.height ? o.height(w) : w * 0.6);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = '100%'; cv.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.w = w; st.h = h; st.dirty = true;
    }
    function makeP() {
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      const dist = o.dist || 4.2;
      const f = Math.min(st.w, st.h * 1.75) * (o.scale || 1);
      const cx = st.w / 2, cyy = st.h * (o.cy != null ? o.cy : 0.56);
      return function (x, y, z) {
        const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
        const y2 = y * cp + z1 * sp, z2 = z1 * cp - y * sp;
        const d = dist + z2, s = f / d;
        return [cx + x1 * s, cyy - y2 * s, d, s];
      };
    }
    function draw() {
      ctx.globalAlpha = 1;
      ctx.fillStyle = MX.C.bg; ctx.fillRect(0, 0, st.w, st.h);
      st.P = makeP();
      o.render(ctx, st.P, st);
      ctx.globalAlpha = 1;
    }
    function kick() { if (!st.raf && st.visible) st.raf = requestAnimationFrame(frame); }
    function invalidate() { st.dirty = true; kick(); }
    function frame(ts) {
      st.raf = 0;
      const dt = st.last ? Math.min(0.05, (ts - st.last) / 1000) : 0.016;
      st.last = ts; st.t += dt;
      let anim = false;
      const ease = Math.min(1, dt * 3.2);
      if (st.tYaw != null) { const d = st.tYaw - st.yaw; if (Math.abs(d) < 0.002) { st.yaw = st.tYaw; st.tYaw = null; } else { st.yaw += d * ease; anim = true; } }
      if (st.tPitch != null) { const d = st.tPitch - st.pitch; if (Math.abs(d) < 0.002) { st.pitch = st.tPitch; st.tPitch = null; } else { st.pitch += d * ease; anim = true; } }
      if (!st.user && !st.drag && st.tYaw == null && !MX.reduced()) {
        if (st.auto) { st.yaw += st.auto * dt; anim = true; }
        else if (st.sway) { st.yaw += st.sway * 0.3 * Math.cos(st.t * 0.3) * dt; anim = true; }
      }
      if (o.tick && o.tick(st, dt)) anim = true;
      if (anim) st.dirty = true;
      if (st.dirty) { draw(); st.dirty = false; }
      if (anim && st.visible) kick(); else st.last = 0;
    }
    function pickAt(px, py) {
      if (!st.P || !o.pick) return;
      const lines = o.pick(px, py, st);
      if (lines) tip.show(lines, px, py); else tip.hide();
    }
    cv.addEventListener('pointerdown', (e) => {
      st.drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch, id: e.pointerId, moved: false };
      st.tYaw = st.tPitch = null;
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (st.drag && st.drag.id === e.pointerId) {
        const dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) { st.drag.moved = true; st.user = true; cv.style.cursor = 'grabbing'; }
        if (st.drag.moved) {
          st.yaw = st.drag.yaw + dx * 0.008;
          st.pitch = clamp(st.drag.pitch + dy * 0.006, minP, maxP);
          tip.hide(); invalidate();
          return;
        }
      }
      if (e.pointerType === 'mouse') pickAt(px, py);
    });
    cv.addEventListener('pointerup', (e) => {
      if (!st.drag || st.drag.id !== e.pointerId) return;
      const moved = st.drag.moved;
      st.drag = null; cv.style.cursor = '';
      if (!moved) { const r = cv.getBoundingClientRect(); pickAt(e.clientX - r.left, e.clientY - r.top); }
    });
    cv.addEventListener('pointercancel', () => { st.drag = null; cv.style.cursor = ''; });
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hide(); });
    cv.addEventListener('keydown', (e) => {
      let used = true;
      if (e.key === 'ArrowLeft') st.yaw -= 0.12;
      else if (e.key === 'ArrowRight') st.yaw += 0.12;
      else if (e.key === 'ArrowUp') st.pitch = clamp(st.pitch + 0.08, minP, maxP);
      else if (e.key === 'ArrowDown') st.pitch = clamp(st.pitch - 0.08, minP, maxP);
      else used = false;
      if (used) { e.preventDefault(); st.user = true; st.tYaw = st.tPitch = null; invalidate(); }
    });
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((es) => { for (const en of es) { st.visible = en.isIntersecting; if (st.visible) invalidate(); } }, { root: document });
      io.observe(box);
    }
    size(); invalidate();
    return {
      state: st,
      resize() { size(); invalidate(); },
      redraw: invalidate,
      setView(yaw, pitch, auto) {
        if (yaw != null) st.tYaw = st.yaw + wrap(yaw - st.yaw);
        if (pitch != null) st.tPitch = clamp(pitch, minP, maxP);
        if (auto != null) st.auto = auto;
        st.user = false;
        if (MX.reduced()) { if (st.tYaw != null) st.yaw = st.tYaw; if (st.tPitch != null) st.pitch = st.tPitch; st.tYaw = st.tPitch = null; }
        invalidate();
      },
      destroy() { if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; if (io) io.disconnect(); tip.hide(); },
    };
  };

  /* An extruded box, faces painted back to front. Returns projected corners. */
  MX.box = function (ctx, P, x0, x1, y0, y1, z0, z1, col) {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]].map((p) => P(p[0], p[1], p[2]));
    const faces = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]];
    const order = faces.map((f, i) => ({ f, i, d: (v[f[0]][2] + v[f[1]][2] + v[f[2]][2] + v[f[3]][2]) / 4 })).sort((a, b) => b.d - a.d);
    for (const { f, i } of order) {
      ctx.beginPath();
      ctx.moveTo(v[f[0]][0], v[f[0]][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(v[f[k]][0], v[f[k]][1]);
      ctx.closePath();
      if (col.side) { ctx.fillStyle = i === 4 ? col.top || col.side : col.side; ctx.fill(); }
      if (col.edge) { ctx.strokeStyle = col.edge; ctx.lineWidth = col.lw || 1; ctx.stroke(); }
    }
    return v;
  };

  MX.seg = function (ctx, P, a, b) { const p = P(a[0], a[1], a[2]), q = P(b[0], b[1], b[2]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };

  /* A floor grid in the y=0 plane. */
  MX.grid = function (ctx, P, x0, x1, z0, z1, n, color) {
    ctx.strokeStyle = color || MX.C.hair; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n;
      MX.seg(ctx, P, [x, 0, z0], [x, 0, z1]);
      MX.seg(ctx, P, [x0, 0, z], [x1, 0, z]);
    }
    ctx.stroke();
  };

  MX.label = function (ctx, P, x, y, z, s, color, align, size) {
    const p = P(x, y, z);
    ctx.font = (size || 11) + 'px "Courier New", Courier, monospace';
    ctx.fillStyle = color || MX.C.mute;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, p[0], p[1]);
    ctx.textAlign = 'left';
    return p;
  };

  /* The page's chapter sections light up as they cross the middle of the screen. */
  MX.chapters = function (selector, onEnter) {
    const secs = Array.from(document.querySelectorAll(selector));
    if (!('IntersectionObserver' in window) || !secs.length) return null;
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        secs.forEach((s) => s.classList.toggle('mx-on', s === e.target));
        onEnter(e.target);
      }
    }, { root: document, rootMargin: '-45% 0px -45% 0px' });
    secs.forEach((s) => io.observe(s));
    if (secs[0]) secs[0].classList.add('mx-on');
    return io;
  };

})();
