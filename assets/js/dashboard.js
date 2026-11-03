/*
 * dashboard.js — every number, chart and table on the page.
 * Data comes from window.dash (see runtime.js); nothing here is hard-coded.
 */

/* ---------- Shared helpers ---------- */
(function () {
  window.agFmt = {
    n: d3.format(','),
    pct: d3.format('.1%'),
    compact: new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }),
    month: (m) => d3.utcFormat('%b %Y')(new Date(m + '-01T00:00:00Z')),
  };

  window.agErr = (el) => {
    el.replaceChildren();
    const d = document.createElement('div');
    d.className = 'ag-err';
    d.style.minHeight = 'inherit';
    d.append('Failed to load');
    el.append(d);
  };

  // Returns rows when the source is ready; otherwise paints its state and returns null.
  window.agRows = (el, id) => {
    const g = dash.data(id);
    el.classList.toggle('dash-skeleton', g.status === 'loading');
    if (g.status === 'ok') return g.data;
    el.replaceChildren();
    if (g.status === 'error') window.agErr(el);
    return null;
  };

  // A tooltip that stays inside its chart box.
  window.agTip = (box) => {
    let t = null;
    return {
      show(nodes, x, y) {
        if (!t) { t = document.createElement('div'); t.className = 'ag-tip'; box.append(t); }
        t.replaceChildren(...nodes);
        const bw = box.clientWidth;
        t.style.left = Math.max(0, Math.min(x + 12, bw - t.offsetWidth - 4)) + 'px';
        t.style.top = Math.max(0, y - t.offsetHeight - 10) + 'px';
      },
      hide() { if (t) { t.remove(); t = null; } },
    };
  };

  window.agTipLine = (head, pairs) => {
    const out = [];
    const h = document.createElement('div');
    h.className = 'ag-tip-h';
    h.textContent = head;
    out.push(h);
    for (const [swatch, name, val] of pairs) {
      const d = document.createElement('div');
      if (swatch) {
        const s = document.createElement('span');
        s.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;background:' + swatch;
        d.append(s);
      }
      d.append(name + ': ' + val);
      out.push(d);
    }
    return out;
  };

  // Widest of some strings at caption size inside an svg.
  window.agMeasure = (svg, strings) => {
    const g = svg.append('g').attr('opacity', 0);
    let w = 0;
    for (const s of strings) w = Math.max(w, g.append('text').attr('font-size', 11).text(s).node().getComputedTextLength());
    g.remove();
    return w;
  };
})();

/* ---------- Derived values ---------- */
(function () {
  dash.calc('geo_share', {
    inputs: ['overview'],
    fn: (overview) => ({ share: +overview[0].geolocated / +overview[0].clips }),
  });
  dash.calc('video_share', {
    inputs: ['overview'],
    fn: (overview) => ({ share: +overview[0].videos / (+overview[0].videos + +overview[0].photos) }),
  });
  dash.calc('hospital_monthly', {
    inputs: ['hospital'],
    fn: (hospital) => {
      const m = {};
      for (const r of hospital) {
        const k = String(r.date).slice(0, 7);
        if (k.length === 7) m[k] = (m[k] || 0) + 1;
      }
      return Object.keys(m).sort().map((k) => ({ month: k, n: m[k] }));
    },
  });
  dash.calc('precision_dist', {
    inputs: ['hospital'],
    fn: (hospital) => {
      const m = {};
      for (const r of hospital) {
        const p = Math.min(Math.max(Number(r.precision_level) || 0, 1), 4);
        m[p] = (m[p] || 0) + 1;
      }
      const labels = { 1: 'Town or city named', 2: 'Neighbourhood or camp named', 3: 'Building named, not verified', 4: 'Exact site, geolocated' };
      return [4, 3, 2, 1].map((p) => ({ level: p, label: labels[p], n: m[p] || 0 }));
    },
  });
  dash.calc('hosp_summary', {
    inputs: ['hospital'],
    fn: (hospital) => {
      const exact = hospital.filter((r) => String(r.exact).toLowerCase() === 'true').length;
      return { total: hospital.length, exact: exact, exact_share: hospital.length ? exact / hospital.length : 0 };
    },
  });
})();

/* ---------- Headline numbers ---------- */
(function () {
  const F = window.agFmt;
  const compact = (v) => F.compact.format(+v);
  const ovDraw = (field, format) => (el) => {
    const g = dash.data('overview');
    el.textContent = g.status === 'ok' ? format(g.data[0][field]) : '—';
  };
  dash.draw('hClips', ovDraw('clips', (v) => F.n(+v)));
  dash.draw('hColl', ovDraw('collections', (v) => F.n(+v)));
  dash.draw('hGeo', ovDraw('geolocated', (v) => F.n(+v)));
  dash.draw('tClips', ovDraw('clips', compact));
  dash.draw('tGeo', ovDraw('geolocated', compact));
  dash.draw('tVideo', ovDraw('videos', compact));
  dash.draw('tWithdrawn', ovDraw('withdrawn', (v) => F.n(+v)));
  dash.draw('fBuilt', ovDraw('built', (v) => String(v).slice(0, 10)));

  const calcDraw = (id, field, format) => (el) => {
    const g = dash.data(id);
    el.textContent = g.status === 'ok' ? format(g.data[field]) : '—';
  };
  dash.draw('tGeoShare', calcDraw('geo_share', 'share', F.pct));
  dash.draw('tVideoShare', calcDraw('video_share', 'share', F.pct));
  dash.draw('fCount', calcDraw('hosp_summary', 'total', F.n));
  dash.draw('fExact', calcDraw('hosp_summary', 'exact_share', F.pct));
})();

/* ---------- Records posted per month (bars + geolocated line) ---------- */
(function () {
  dash.draw('monthlyChart', (el) => {
    const raw = window.agRows(el, 'monthly');
    if (!raw) return;
    const F = window.agFmt;
    const rows = raw.map((r) => ({ month: r.month, total: +r.total, geo: +r.geo, video: +r.video }));
    el.replaceChildren();
    const W = Math.max(el.clientWidth, 320), H = 300, mt = 14, mb = 34;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const yMax = d3.max(rows, (d) => d.total) || 1;
    const yTicks = d3.scaleLinear([0, yMax], [0, 1]).ticks(5);
    const ml = Math.ceil(window.agMeasure(svg, yTicks.map((t) => F.compact.format(t)))) + 14;
    const mr = Math.ceil(window.agMeasure(svg, ['Geolocated'])) + 14;
    const x = d3.scaleBand(rows.map((d) => d.month), [ml, W - mr]).paddingInner(0.25).paddingOuter(0.05);
    const y = d3.scaleLinear([0, yMax], [H - mb, mt]);

    const g = svg.append('g');
    g.selectAll('line').data(yTicks).join('line')
      .attr('x1', ml).attr('x2', W - mr).attr('y1', (t) => y(t)).attr('y2', (t) => y(t))
      .attr('stroke', 'var(--cds-chart-grid)').attr('stroke-width', 1);
    g.selectAll('text').data(yTicks).join('text')
      .attr('x', ml - 6).attr('y', (t) => y(t) + 3).attr('text-anchor', 'end')
      .attr('font-size', 11).attr('fill', 'var(--color-fg-muted)')
      .text((t) => F.compact.format(t));

    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', (d) => x(d.month)).attr('width', Math.min(x.bandwidth(), 32))
      .attr('y', (d) => y(d.total)).attr('height', (d) => Math.max(0, y(0) - y(d.total)))
      .attr('rx', 2).attr('fill', dash.colors[0]);

    const line = d3.line((d) => x(d.month) + x.bandwidth() / 2, (d) => y(d.geo));
    svg.append('path').attr('d', line(rows)).attr('fill', 'none')
      .attr('stroke', dash.colors[1]).attr('stroke-width', 2)
      .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
    const last = rows[rows.length - 1];
    svg.append('text').attr('x', x(last.month) + x.bandwidth() / 2 + 6).attr('y', y(last.geo) + 3)
      .attr('font-size', 11).attr('fill', dash.colors[1]).text('Geolocated');

    const every = W < 560 ? 8 : 4;
    const months = rows.filter((d, i) => i % every === 0);
    const xw = window.agMeasure(svg, months.map((d) => F.month(d.month)));
    svg.append('g').selectAll('text').data(months).join('text')
      .attr('x', (d) => Math.max(xw / 2 + 2, Math.min(x(d.month) + x.bandwidth() / 2, W - xw / 2 - 2)))
      .attr('y', H - mb + 16)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)')
      .text((d) => F.month(d.month));

    const tip = window.agTip(el);
    svg.on('pointermove', (ev) => {
      const [px, py] = d3.pointer(ev, svg.node());
      const i = Math.max(0, Math.min(rows.length - 1, Math.round((px - ml - x.bandwidth() / 2) / x.step())));
      const d = rows[i];
      if (!d) return;
      tip.show(window.agTipLine(F.month(d.month), [
        [dash.colors[0], 'All records', F.n(d.total)],
        [dash.colors[1], 'Geolocated', F.n(d.geo)],
        [null, 'Videos', F.n(d.video)],
      ]), px * el.clientWidth / W, py * el.clientWidth / W);
    });
    svg.on('pointerleave', () => tip.hide());
  });
})();

/* ---------- Bar lists: collections, caption themes, precision ---------- */
(function () {
  const barList = (el, rows, color) => {
    el.replaceChildren();
    const max = d3.max(rows, (d) => d.n) || 1;
    for (const d of rows) {
      const row = document.createElement('div'); row.className = 'ag-bar-row';
      const name = document.createElement('span'); name.className = 'ag-bar-name'; name.textContent = d.name; name.title = d.name;
      const val = document.createElement('span'); val.className = 'ag-bar-val'; val.textContent = window.agFmt.n(d.n);
      const track = document.createElement('div'); track.className = 'ag-bar-track';
      const fill = document.createElement('div'); fill.className = 'ag-bar-fill';
      fill.style.width = (100 * d.n / max) + '%';
      fill.style.background = color;
      track.append(fill);
      row.append(name, val, track);
      el.append(row);
    }
  };

  dash.draw('archBars', (el) => {
    const rows = window.agRows(el, 'archives');
    if (!rows) return;
    const top = rows.map((r) => ({ name: r.name, n: +r.clips })).sort((a, b) => b.n - a.n).slice(0, 12);
    barList(el, top, dash.colors[0]);
  });

  dash.draw('kwBars', (el) => {
    const rows = window.agRows(el, 'keywords');
    if (!rows) return;
    barList(el, rows.map((r) => ({ name: r.keyword, n: +r.count })).sort((a, b) => b.n - a.n), dash.colors[2]);
  });

  dash.draw('precBars', (el) => {
    const g = dash.data('precision_dist');
    el.classList.toggle('dash-skeleton', g.status === 'loading');
    if (g.status !== 'ok') { el.replaceChildren(); if (g.status === 'error') window.agErr(el); return; }
    barList(el, g.data.map((r) => ({ name: r.label, n: r.n })), dash.colors[1]);
  });
})();

/* ---------- Hospital slice per month ---------- */
(function () {
  dash.draw('hospMonthly', (el) => {
    const g = dash.data('hospital_monthly');
    el.classList.toggle('dash-skeleton', g.status === 'loading');
    el.replaceChildren();
    if (g.status !== 'ok') { if (g.status === 'error') window.agErr(el); return; }
    const F = window.agFmt;
    const rows = g.data;
    const W = Math.max(el.clientWidth, 280), H = 220, mt = 10, mb = 30;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const yMax = d3.max(rows, (d) => d.n) || 1;
    const yTicks = d3.scaleLinear([0, yMax], [0, 1]).ticks(4);
    const ml = Math.ceil(window.agMeasure(svg, yTicks.map((t) => String(t)))) + 12;
    const x = d3.scaleBand(rows.map((d) => d.month), [ml, W - 4]).paddingInner(0.2);
    const y = d3.scaleLinear([0, yMax], [H - mb, mt]);

    svg.append('g').selectAll('line').data(yTicks).join('line')
      .attr('x1', ml).attr('x2', W - 4).attr('y1', (t) => y(t)).attr('y2', (t) => y(t))
      .attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(yTicks).join('text')
      .attr('x', ml - 5).attr('y', (t) => y(t) + 3).attr('text-anchor', 'end')
      .attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((t) => String(t));
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', (d) => x(d.month)).attr('width', Math.min(x.bandwidth(), 32))
      .attr('y', (d) => y(d.n)).attr('height', (d) => Math.max(0, y(0) - y(d.n)))
      .attr('rx', 2).attr('fill', dash.colors[3]);

    const every = Math.max(1, Math.ceil(rows.length / 6));
    const ticks = rows.filter((d, i) => i % every === 0);
    const xw = window.agMeasure(svg, ticks.map((d) => F.month(d.month)));
    svg.append('g').selectAll('text').data(ticks).join('text')
      .attr('x', (d) => Math.max(xw / 2 + 2, Math.min(x(d.month) + x.bandwidth() / 2, W - xw / 2 - 2)))
      .attr('y', H - mb + 16)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)')
      .text((d) => F.month(d.month));

    const tip = window.agTip(el);
    svg.on('pointermove', (ev) => {
      const [px, py] = d3.pointer(ev, svg.node());
      const i = Math.max(0, Math.min(rows.length - 1, Math.round((px - ml - x.bandwidth() / 2) / x.step())));
      const d = rows[i];
      if (!d) return;
      tip.show(window.agTipLine(F.month(d.month), [[dash.colors[3], 'Records', F.n(d.n)]]),
        px * el.clientWidth / W, py * el.clientWidth / W);
    });
    svg.on('pointerleave', () => tip.hide());
  });
})();

/* ---------- Coordinates scatter ---------- */
(function () {
  dash.draw('geoScatter', (el) => {
    const raw = window.agRows(el, 'hospital');
    if (!raw) return;
    const pts = raw
      .map((r) => ({ lat: +r.lat, lon: +r.lon, date: String(r.date).slice(0, 10), exact: String(r.exact).toLowerCase() === 'true' }))
      .filter((p) => isFinite(p.lat) && isFinite(p.lon) && (p.lat !== 0 || p.lon !== 0));
    el.replaceChildren();
    if (!pts.length) return;
    const lonE = d3.extent(pts, (p) => p.lon), latE = d3.extent(pts, (p) => p.lat);
    const padLon = (lonE[1] - lonE[0]) * 0.05 + 0.01, padLat = (latE[1] - latE[0]) * 0.05 + 0.01;
    const W = Math.max(el.clientWidth, 320);
    const aspect = Math.cos(((latE[0] + latE[1]) / 2) * Math.PI / 180);
    const H = Math.max(240, Math.min(440, W * ((latE[1] - latE[0] + 2 * padLat) / ((lonE[1] - lonE[0] + 2 * padLon) * aspect))));
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleLinear([lonE[0] - padLon, lonE[1] + padLon], [8, W - 8]);
    const y = d3.scaleLinear([latE[0] - padLat, latE[1] + padLat], [H - 8, 8]);
    svg.append('g').selectAll('circle').data(pts.filter((p) => !p.exact)).join('circle')
      .attr('cx', (p) => x(p.lon)).attr('cy', (p) => y(p.lat)).attr('r', 2)
      .attr('fill', 'var(--cds-chart-muted)').attr('opacity', 0.55);
    svg.append('g').selectAll('circle').data(pts.filter((p) => p.exact)).join('circle')
      .attr('cx', (p) => x(p.lon)).attr('cy', (p) => y(p.lat)).attr('r', 2.2)
      .attr('fill', dash.colors[0]).attr('opacity', 0.75);

    const del = d3.Delaunay.from(pts, (p) => x(p.lon), (p) => y(p.lat));
    const tip = window.agTip(el);
    svg.on('pointermove', (ev) => {
      const [px, py] = d3.pointer(ev, svg.node());
      const p = pts[del.find(px, py)];
      if (!p) return;
      tip.show(window.agTipLine(p.date || 'Date unknown', [
        [p.exact ? dash.colors[0] : 'var(--cds-chart-muted)', p.exact ? 'Exact site' : 'Approximate', p.lat.toFixed(3) + ', ' + p.lon.toFixed(3)],
      ]), px * el.clientWidth / W, py * el.clientWidth / W);
    });
    svg.on('pointerleave', () => tip.hide());
  });
})();

/* ---------- Searchable records table ---------- */
(function () {
  const PREC = { 1: 'Town/city', 2: 'Neighbourhood', 3: 'Named building', 4: 'Exact site' };
  const PAGE = 200;
  let shown = PAGE;
  let query = '';

  const countEl = () => document.getElementById('ag-count');
  const moreBtn = () => document.getElementById('ag-more');

  dash.draw('hospRows', (el) => {
    const g = dash.data('hospital');
    if (g.status !== 'ok') { el.replaceChildren(); return; }
    const q = query.toLowerCase();
    const rows = g.data
      .filter((r) => !q || (String(r.caption) + ' ' + String(r.source_archive)).toLowerCase().includes(q))
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const frag = document.createDocumentFragment();
    for (const r of rows.slice(0, shown)) {
      const tr = document.createElement('tr');
      const date = String(r.date || '').slice(0, 10) || '—';
      const cells = [
        date,
        String(r.type || ''),
        String(r.caption || ''),
        String(r.source_archive || ''),
        PREC[Math.min(Math.max(Number(r.precision_level) || 1, 1), 4)],
        String(r.confidence || ''),
      ];
      cells.forEach((v, i) => {
        const td = document.createElement('td');
        if (i === 2) td.className = 'ag-cap';
        if (i === 0 || i === 1) td.className = 'ag-nowrap';
        // Link to the record's page on the archive when the data carries it.
        if (i === 0 && r.page_url && /^https:\/\//.test(r.page_url)) {
          const a = document.createElement('a');
          a.href = r.page_url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = v;
          td.append(a);
        } else {
          td.textContent = v;
        }
        tr.append(td);
      });
      frag.append(tr);
    }
    el.replaceChildren(frag);

    const c = countEl();
    if (c) c.textContent = 'Showing ' + window.agFmt.n(Math.min(shown, rows.length)) + ' of ' + window.agFmt.n(rows.length);
    const b = moreBtn();
    if (b) b.hidden = shown >= rows.length;
  });

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('ag-search');
    let t = null;
    if (input) {
      input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { query = input.value; shown = PAGE; dash.draw('hospRows'); }, 150);
      });
    }
    const b = moreBtn();
    if (b) b.addEventListener('click', () => { shown += PAGE; dash.draw('hospRows'); });
  });
})();
