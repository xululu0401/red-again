/* 灯又红了 · 界面（ui.js）：所有读数取自 core.js 同一次 compute 的 out */
'use strict';
(function () {
  var A = window.AppCore, KEY = 'red-again:v1';
  var $ = function (id) { return document.getElementById(id); };
  var FIELDS = ['name', 'v', 'limit', 'dep', 'loss', 'dest'], LF = ['pos', 'C', 'G', 'off'];
  var PRESETS = [
    { key: 'def', name: '上班那条路', note: '默认（虚构）：2.7 公里、6 个灯，都是 90 秒一轮、绿 40 秒，开 50 km/h，秒表第 30 秒出门，起步损失 2 秒。' },
    { key: 'ebike', name: '骑电动车', note: '虚构示例：同一条路骑电动车 20 km/h，最快 25 km/h，起步损失 1 秒。', f: function (s) { s.name = '骑车上班'; s.v = '20'; s.limit = '25'; s.loss = '1'; } },
    { key: 'wave', name: '绿波路', note: '虚构示例：5 个灯 100 秒一轮、绿 45 秒，变绿时刻按 40 km/h 依次错开（每 500 米晚 45 秒），开 50 km/h 反而要停。', f: function (s) {
      s.name = '主干道绿波'; s.v = '50'; s.limit = '60'; s.dep = '0'; s.loss = '2'; s.dest = '2600';
      s.lights = [0, 1, 2, 3, 4].map(function (i) { return { pos: String(300 + 500 * i), C: '100', G: '45', off: String(27 + 45 * i) }; });
    } }
  ];
  var state, out, tmr;
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function presetState(k) { var s = A.defaultState(), p = PRESETS.filter(function (q) { return q.key === k; })[0]; if (p && p.f) p.f(s); return s; }
  function str(v, n) { return v == null || typeof v === 'object' ? '' : String(v).slice(0, n); }
  function sanitize(s) {
    if (!s || typeof s !== 'object') return null;
    var d = A.defaultState();
    FIELDS.forEach(function (k) { if (k in s) d[k] = str(s[k], k === 'name' ? 12 : 16); });
    if (Array.isArray(s.lights)) d.lights = s.lights.slice(0, A.MAX_LIGHTS).map(function (l) { l = l && typeof l === 'object' ? l : {}; var o = {}; LF.forEach(function (k) { o[k] = str(l[k], 16); }); return o; });
    return d;
  }
  function norm(s) { return JSON.stringify(sanitize(s)); }
  function presetKey(s) { var j = norm(s); for (var i = 0; i < PRESETS.length; i++) if (norm(presetState(PRESETS[i].key)) === j) return PRESETS[i].key; return null; }
  function load() { try { var t = localStorage.getItem(KEY); if (!t) return null; var j = JSON.parse(t); return j && j.state ? sanitize(j.state) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, state: state })); $('saveTag').textContent = '· 已自动存在本机'; } catch (e) { $('saveTag').textContent = '· 这台设备存不了，刷新会丢'; } }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  state = load() || A.defaultState();

  /* —— 灯表：结构变了（加/删灯、换预设）才重建，输入时只改结果列，避免光标跳走 —— */
  function buildLights() {
    var h = '<tr><th>#</th><th>距起点<br>米</th><th>周期<br>秒</th><th>绿灯<br>秒</th><th>变绿<br>时刻</th><th>你到的<br>时候</th><th></th></tr>';
    state.lights.forEach(function (l, i) {
      h += '<tr><td>' + (i + 1) + '</td>' + LF.map(function (k) { return '<td><input id="L' + i + '_' + k + '" data-i="' + i + '" data-k="' + k + '" inputmode="numeric" value="' + esc(l[k]) + '" aria-label="第 ' + (i + 1) + ' 个灯 ' + k + '" class="' + (k === 'pos' ? 'wp' : 'wn') + '"></td>'; }).join('') +
        '<td class="res" id="res' + i + '"></td><td><button type="button" class="del" data-del="' + i + '" aria-label="删掉第 ' + (i + 1) + ' 个灯"' + (state.lights.length <= 1 ? ' disabled' : '') + '>×</button></td></tr>';
    });
    $('lt').innerHTML = h;
    $('addL').disabled = state.lights.length >= A.MAX_LIGHTS;
    $('lightMsg').textContent = state.lights.length >= A.MAX_LIGHTS ? '最多 ' + A.MAX_LIGHTS + ' 个灯' : '';
  }
  window.addEventListener('resize', function () { clearTimeout(tmr); tmr = setTimeout(function () { if (out && out.ok) renderTS(); }, 120); });
  function fill() { FIELDS.forEach(function (k) { $(k).value = state[k]; }); buildLights(); }
  FIELDS.forEach(function (k) { $(k).addEventListener('input', function () { state[k] = this.value; schedule(); }); });
  $('lt').addEventListener('input', function (e) { var t = e.target; if (!t.dataset || t.dataset.k == null) return; state.lights[+t.dataset.i][t.dataset.k] = t.value; schedule(); });
  $('lt').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b || state.lights.length <= 1) return; state.lights.splice(+b.getAttribute('data-del'), 1); fill(); update(); });
  $('addL').addEventListener('click', function () {
    if (state.lights.length >= A.MAX_LIGHTS) return;
    var last = state.lights[state.lights.length - 1] || { pos: '0', C: '90', G: '40', off: '0' }, p = A.num(last.pos), d = A.num(state.dest);
    var np = isNaN(p) ? '' : String(p + 400);
    state.lights.push({ pos: np, C: last.C, G: last.G, off: '0' });
    if (!isNaN(d) && !isNaN(p) && d < p + 400) state.dest = String(p + 400 + 200);
    fill(); update();
  });
  function schedule() { clearTimeout(tmr); tmr = setTimeout(update, 80); }
  $('presets').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (!b) return; state = presetState(b.getAttribute('data-p')); fill(); update(); });
  $('acts').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || !out.ok) return;
    var a = out.actions.filter(function (x) { return x.id === b.getAttribute('data-act'); })[0]; if (!a) return;
    state = A.applyChange(state, a); fill(); update();
  });
  $('speeds').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (!b) return; state.v = b.getAttribute('data-v'); fill(); update(); });

  function markErrors() {
    document.querySelectorAll('.bad').forEach(function (e) { e.classList.remove('bad'); });
    if (!out.ok) out.errors.forEach(function (er) { var el = $(er.field); if (el) el.classList.add('bad'); });
  }
  function renderPresets() {
    var key = presetKey(state);
    $('presets').innerHTML = PRESETS.map(function (p) { return '<button type="button" class="chip" id="preset_' + p.key + '" data-p="' + p.key + '" aria-pressed="' + (key === p.key) + '">' + esc(p.name) + '</button>'; }).join('');
    var cur = PRESETS.filter(function (p) { return p.key === key; })[0];
    $('presetNote').textContent = cur ? cur.note : '你自己改过的条件（默认那组是虚构示例）。';
  }

  /* 时间—距离图：横轴秒表时间，纵轴离起点的距离；每个灯一条红绿横条 */
  function tsModel(o) {
    var P = o.P, r = o.ev.r, v = P.v10, t0 = P.dep, t1 = r.arrive / v;
    var ns = o.ev.nonstop, nsEnd = ns ? ns.arrive / ns.v10 : null;
    var span = Math.max(t1, nsEnd || 0) - t0, pad = Math.max(5, span * 0.04);
    var path = [[t0, 0]];
    r.rows.forEach(function (w) { path.push([w.at / v, w.pos]); if (w.wait) path.push([w.leave / v, w.pos]); });
    path.push([t1, P.dest]);
    return { lo: t0 - pad, hi: t0 + span + pad, path: path, ns: ns ? [[t0, 0], [nsEnd, P.dest]] : null };
  }
  function greenSpans(l, lo, hi) {   /* [a, b) 段，lo..hi 内 */
    var res = [], k = Math.floor((lo - l.off) / l.C) - 1;
    for (; ; k++) { var a = l.off + k * l.C, b = a + l.G; if (a > hi) break; if (b > lo) res.push([Math.max(a, lo), Math.min(b, hi)]); }
    return res;
  }
  function renderTS() {
    var o = out, P = o.P, m = tsModel(o), cw0 = $('ts').clientWidth || 720, W = Math.max(300, Math.min(720, Math.round(cw0))), H = W < 500 ? 300 : 340, L = W < 500 ? 56 : 64, R = 10, T = 14, B = 34;
    $('ts').setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var X = function (t) { return L + (t - m.lo) / (m.hi - m.lo) * (W - L - R); }, Y = function (d) { return H - B - d / P.dest * (H - T - B); };
    var s = '<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" fill="#fbfbfa"/>';
    var maxT = W < 500 ? 5 : 9, tick = [10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200].filter(function (k) { return (m.hi - m.lo) / k <= maxT; })[0] || 14400;
    for (var t = Math.ceil(m.lo / tick) * tick; t <= m.hi; t += tick) s += '<line x1="' + X(t).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="#eef0f1"/><text x="' + X(t).toFixed(1) + '" y="' + (H - 12) + '" font-size="11" text-anchor="middle" fill="#80898f">' + A.tickLabel(t) + '</text>';
    s += '<text x="' + (W - R) + '" y="' + (H - 1) + '" font-size="10.5" text-anchor="end" fill="#80898f">秒表 分:秒 →</text>';
    P.lights.forEach(function (l, i) {
      var y = Y(l.pos);
      s += '<rect x="' + L + '" y="' + (y - 3).toFixed(1) + '" width="' + (W - L - R) + '" height="6" fill="#c8423a" opacity=".85"/>';
      greenSpans(l, m.lo, m.hi).forEach(function (g) { s += '<rect x="' + X(g[0]).toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" width="' + (X(g[1]) - X(g[0])).toFixed(1) + '" height="6" fill="#2f8a57"/>'; });
      s += '<text x="' + (L - 6) + '" y="' + (y + 4).toFixed(1) + '" font-size="11" text-anchor="end" fill="#4a545b">' + (W < 500 ? '' : (i + 1) + ' · ') + A.fmt(l.pos, 0) + 'm</text>';
    });
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(P.dest).toFixed(1) + '" y2="' + Y(P.dest).toFixed(1) + '" stroke="#80898f" stroke-dasharray="2 3"/><text x="' + (L - 6) + '" y="' + (Y(P.dest) + 4).toFixed(1) + '" font-size="11" text-anchor="end" fill="#80898f">终点</text>';
    function pl(pts, c, w, dash) { return '<polyline fill="none" stroke="' + c + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linejoin="round" points="' + pts.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ') + '"/>'; }
    if (m.ns && o.ev.nonstop.v10 !== P.v10) s += pl(m.ns, '#2f8a57', 2, '6 4');
    s += pl(m.path, '#3b4650', 3);
    o.ev.r.rows.forEach(function (w) { if (w.wait) s += '<circle cx="' + X(w.at / P.v10).toFixed(1) + '" cy="' + Y(w.pos).toFixed(1) + '" r="4" fill="#c8423a" stroke="#fff" stroke-width="1.5"/>'; });
    $('ts').innerHTML = s;
  }

  function renderSpeeds() {
    var o = out, sw = o.ev.sweep, mx = Math.max(1, Math.max.apply(null, sw.map(function (x) { return x.stops; })));
    $('speeds').innerHTML = sw.map(function (x) {
      var k = x.v10 / 10, h = x.stops ? 8 + 62 * x.stops / mx : 70;
      return '<button type="button" data-v="' + k + '" class="' + (x.stops ? '' : 'z') + (x.v10 === o.P.v10 ? ' cur' : '') + '" style="height:' + h.toFixed(0) + 'px" title="' + k + ' km/h：' + (x.stops ? '停 ' + x.stops + ' 次' : '一路不停') + '，全程 ' + A.secs(x.trip / x.v10) + '" aria-label="' + k + ' km/h"></button>';
    }).join('');
    $('sAxis').innerHTML = '<span>5 km/h</span><span>' + o.P.limit + ' km/h</span>';
    $('spNote').textContent = '· 绿 = 一路不停，红越高停得越多；点一根直接换成那个速度' + (o.ev.bands.length ? '' : '（这个出发时刻没有一路不停的速度）');
  }

  function renderLightRes() {
    state.lights.forEach(function (_, i) { var c = $('res' + i); if (c) { c.className = 'res'; c.innerHTML = ''; } });
    if (!out.ok) return;
    A.lightRows(out).forEach(function (x) {
      var c = $('res' + x.i); if (!c) return;
      c.className = 'res ' + (x.green ? 'g' : 'r');
      c.innerHTML = '<span class="dot" style="background:' + (x.green ? '#2f8a57' : '#c8423a') + '"></span>' + (x.green ? '绿<span class="rt">，还剩 ' + A.secs(x.greenLeft) + '</span>' : '等 ' + A.secs(x.wait));
    });
  }

  function render() {
    var o = out;
    $('errBox').classList.toggle('hide', o.ok); $('okBox').classList.toggle('hide', !o.ok);
    renderLightRes();
    if (!o.ok) { $('errBox').innerHTML = '先改好标红的地方：<ul>' + o.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>'; return; }
    $('headline').textContent = A.headline(o);
    $('why').textContent = A.explain(o);
    renderTS(); renderSpeeds();
    $('acts').innerHTML = o.actions.length ? o.actions.map(function (a) { return '<button type="button" class="act" id="' + a.id + '" data-act="' + a.id + '">→ ' + esc(a.text) + '</button>'; }).join('')
      : '<span class="muted">' + (o.ev.r.stops === 0 ? '这趟一路绿，不用改。' : '换速度、早晚几秒出门都到不了更早。') + '</span>';
  }
  function update() { clearTimeout(tmr); out = A.compute(state); markErrors(); renderPresets(); render(); save(); }

  function stamp() { var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function tag() { if (!out.ok) return '待改'; var r = out.ev.r; return r.stops ? '停' + r.stops + '次' : '一路绿'; }
  $('dlCsv').addEventListener('click', function () { if (out.ok) download('灯又红了-逐灯与速度.csv', new Blob(['\ufeff' + A.toCSV(out, stamp())], { type: 'text/csv;charset=utf-8' })); });
  $('dlMd').addEventListener('click', function () { if (out.ok) download('灯又红了-' + tag() + '.md', new Blob([A.toMD(out, stamp())], { type: 'text/markdown;charset=utf-8' })); });
  $('dlJson').addEventListener('click', function () { download('灯又红了-备份.json', new Blob([JSON.stringify({ app: '灯又红了', slug: 'red-again', version: 1, exported_at: stamp(), state: state }, null, 2)], { type: 'application/json' })); });
  $('impJson').addEventListener('click', function () { $('impFile').click(); });
  $('impFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { importText(String(rd.result)); }; rd.readAsText(f); this.value = ''; });
  function importText(t) {
    var s = null;
    try { var j = JSON.parse(t); s = sanitize(j && j.state ? j.state : j); } catch (e) { s = null; }
    if (!s) { $('impMsg').textContent = '这个文件读不出来，没改动。'; return false; }
    $('impMsg').textContent = '已导入。'; state = s; fill(); update(); return true;
  }
  $('reset').addEventListener('click', function () { state = A.defaultState(); $('impMsg').textContent = ''; fill(); update(); });

  /* 结果卡 PNG 1080×1350：文字、图与逐灯读数取自同一次 out */
  function drawCard() {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d'), FF = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = '#eceff0'; g.fillRect(0, 0, W, H); g.fillStyle = '#fcfcfb'; g.fillRect(50, 50, W - 100, H - 100);
    var L = 100, Rr = W - 100, maxW = Rr - L, y = 145;
    function font(size, bold) { g.font = (bold ? '700 ' : '') + size + 'px ' + FF; }
    function clip(t, w) { t = String(t); if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
    function wrap(t, size, color, bold, lim) {
      font(size, bold); g.fillStyle = color; var cur = '', n = 0;
      var toks = String(t).match(/\d{1,2}:\d{2}(?:\.\d)?[）)。，、；：]?|[0-9.,–+−-]+ ?(?:km\/h|秒|米|分|次|%)?[）)。，、；：]?|[（(「]?[A-Za-z]+[）)」。，、；：]?|[（(「]?[^\s（(「][）)」。，、；：]?|\s/g) || [];
      for (var i = 0; i < toks.length; i++) { var ch = toks[i]; if (g.measureText(cur + ch).width > maxW && cur) { if (lim && ++n >= lim) { g.fillText(clip(cur + '…', maxW), L, y); y += size * 1.45; return; } g.fillText(cur, L, y); y += size * 1.45; cur = ch.trim() ? ch : ''; } else cur += ch; }
      if (cur) { g.fillText(cur, L, y); y += size * 1.45; }
    }
    font(54, true); g.fillStyle = '#1f2529'; g.fillText('灯又红了', L, y); y += 54;
    if (!out.ok) { font(42, true); g.fillStyle = '#a8372b'; g.fillText('还算不了', L, y + 20); y += 90; out.errors.slice(0, 8).forEach(function (e) { wrap('· ' + e.message, 28, '#4a545b', false, 2); y += 8; }); y += 30; wrap('改好标红的地方，会自动重算。', 26, '#80898f'); return cv; }
    var o = out, P = o.P, r = o.ev.r;
    font(26); g.fillStyle = '#80898f'; g.fillText(clip(P.name + ' · ' + P.lights.length + ' 个灯 · ' + A.fmt(P.dest, 0) + ' 米 · ' + A.kmh(P.v10) + ' · 秒表第 ' + P.dep + ' 秒出门', maxW), L, y); y += 104;
    font(80, true); g.fillStyle = r.stops ? '#c8423a' : '#2f8a57'; g.fillText(r.stops ? '停 ' + r.stops + ' 次' : '一路绿', L, y);
    var w0 = g.measureText(r.stops ? '停 ' + r.stops + ' 次' : '一路绿').width; font(34); g.fillStyle = '#4a545b'; g.fillText(clip(r.stops ? '路口耽误 ' + A.secs(r.waitN / P.v10) : '全程 ' + A.secs(r.trip / P.v10), maxW - w0 - 30), L + w0 + 30, y); y += 56;
    wrap(A.headline(o), 29, '#1f2529', true, 3); y += 6;
    /* 时间—距离图（与页面同一个模型） */
    var m = tsModel(o), cT = y, cH = 380, cx0 = L + 120, cw = maxW - 120;
    var X = function (t) { return cx0 + (t - m.lo) / (m.hi - m.lo) * cw; }, Yd = function (d) { return cT + cH - d / P.dest * cH; };
    g.fillStyle = '#fbfbfa'; g.fillRect(cx0, cT, cw, cH);
    P.lights.forEach(function (l, i) {
      var yy = Yd(l.pos); g.fillStyle = '#c8423a'; g.fillRect(cx0, yy - 5, cw, 10); g.fillStyle = '#2f8a57';
      greenSpans(l, m.lo, m.hi).forEach(function (s) { g.fillRect(X(s[0]), yy - 5, X(s[1]) - X(s[0]), 10); });
      font(20); g.fillStyle = '#4a545b'; g.textAlign = 'right'; g.fillText((i + 1) + ' · ' + A.fmt(l.pos, 0) + 'm', cx0 - 10, yy + 7); g.textAlign = 'left';
    });
    function pl(pts, c, w, dash) { g.strokeStyle = c; g.lineWidth = w; g.setLineDash(dash || []); g.lineJoin = 'round'; g.beginPath(); pts.forEach(function (p, j) { var a = X(p[0]), b = Yd(p[1]); if (j) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke(); g.setLineDash([]); }
    if (m.ns && o.ev.nonstop.v10 !== P.v10) pl(m.ns, '#2f8a57', 3, [12, 8]);
    pl(m.path, '#3b4650', 5);
    y = cT + cH + 34; font(20); g.fillStyle = '#3b4650'; g.fillText('— 你（走平 = 停着等灯）', L, y);
    if (m.ns && o.ev.nonstop.v10 !== P.v10) { g.fillStyle = '#2f8a57'; g.fillText('- - ' + A.kmh(o.ev.nonstop.v10) + ' 一路不停', L + 300, y); }
    g.fillStyle = '#80898f'; g.fillText('横条：绿 = 能过，红 = 不能过', L + 560, y);
    y += 50;
    if (o.actions.length) { font(26, true); g.fillStyle = '#1f2529'; g.fillText('改一样试试', L, y); y += 40; o.actions.slice(0, 4).forEach(function (a) { wrap('→ ' + a.text, 25, '#2b5a3f', false, 1); y += 2; }); }
    else wrap(A.explain(o), 24, '#4a545b', false, 4);
    /* 剩下的高度放逐灯读数（同一次 out），两列排，放不下就只放停车的灯 */
    var lr = A.lightRows(o), room = Math.floor((H - 160 - y - 40) / 34) * 2;
    if (lr.length > room) lr = lr.filter(function (x) { return !x.green; });
    if (lr.length && lr.length <= room) {
      y += 24; font(22, true); g.fillStyle = '#1f2529'; g.fillText('每个灯你到的时候', L, y); y += 38;
      var half = Math.ceil(lr.length / 2), y0 = y;
      lr.forEach(function (x, j) {
        var cx = j < half ? L : L + maxW / 2, yy = y0 + (j % half) * 34;
        g.fillStyle = x.green ? '#2f8a57' : '#c8423a'; g.beginPath(); g.arc(cx + 8, yy - 7, 7, 0, 7); g.fill();
        font(22); g.fillStyle = '#1f2529'; g.fillText(clip('第 ' + (x.i + 1) + ' 个 · ' + A.fmt(x.pos, 0) + ' 米 · ' + (x.green ? '绿，还剩 ' + A.secs(x.greenLeft) : '红，等 ' + A.secs(x.wait)), maxW / 2 - 40), cx + 24, yy);
      });
      y = y0 + half * 34;
    }
    y = Math.max(y + 10, H - 150);
    wrap('定时灯、匀速、只有你一个人的粗算；不算排队车辆、加减速和感应灯。别为赶绿灯超速。默认数字为虚构示例。', 20, '#80898f', false, 2);
    return cv;
  }
  $('dlPng').addEventListener('click', function () { drawCard().toBlob(function (bl) { if (bl) download('灯又红了-' + tag() + '-1080x1350.png', bl); }, 'image/png'); });

  window.__raUi = { state: function () { return clone(state); }, out: function () { return out; }, importText: importText, drawCard: drawCard, storageKey: KEY };
  fill(); update();
})();
