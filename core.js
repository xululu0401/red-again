/* 灯又红了 · 计算核心（core.js）
 * 问题：同一条路天天走，一路上几个红绿灯总是一个接一个变红。按现在的速度要停几次、在路口一共等多久；
 *       开（骑）快一点、慢一点，或早几秒、晚几秒出门，会不会一路绿、早到多少。
 * 模型（设计选择，页面「怎么算的」写明，不是实测）：
 *   - 定时信号灯：每个灯有固定周期 C 秒、可以通过的时间 G 秒（绿灯，黄灯算不算由用户自己决定），
 *     在「秒表」第 off 秒开始变绿（用户在路口记下的任意一次变绿，按周期折算），之后每 C 秒重复一次。
 *     秒表：用户自己按下的一块表，出门时刻 dep 和各灯变绿时刻都按它记。可通过区间是左闭右开：[off + kC, off + kC + G)。
 *   - 车（人）在两个灯之间匀速 v，不算加减速；碰到红灯就停，变绿后再过 L 秒（起步损失）才离开。
 *   - 只有你一个人：不算排队的车、不算行人和左转。感应灯、潮汐灯、按钮灯都不适用。
 * 精确计算：距离是整数米、速度最多一位小数（v10 = 速度 × 10 是整数），走 1 米要 36 / v10 秒，
 *   所以所有时刻都写成「整数 ÷ v10」，相位判断不受浮点误差影响。不同速度之间比较用交叉相乘。 */
(function (root) {
  'use strict';
  var MAX_LIGHTS = 12;

  function defaultState() {
    return {
      name: '上班那条路', v: '50', limit: '60', dep: '30', loss: '2', dest: '2700',
      lights: [
        { pos: '300', C: '90', G: '40', off: '27' },
        { pos: '750', C: '90', G: '40', off: '67' },
        { pos: '1150', C: '90', G: '40', off: '13' },
        { pos: '1600', C: '90', G: '40', off: '54' },
        { pos: '2000', C: '90', G: '40', off: '0' },
        { pos: '2450', C: '90', G: '40', off: '40' }
      ]
    };
  }

  function half(s) { return String(s == null ? '' : s).replace(/[\uFF01-\uFF5E]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); }).replace(/\u3000/g, ' ').replace(/\s/g, ''); }
  function num(s) { s = half(s).replace(/。/g, '.'); return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; }
  function fmtN(x) { return String(x); }

  function parse(st) {
    var errs = [], P = {};
    st = st && typeof st === 'object' ? st : {};
    function need(v, f, lo, hi, label, unit, dec) {
      var s = half(v).replace(/。/g, '.'), x = num(v);
      if (isNaN(x)) { errs.push({ field: f, message: label + '要填数字' }); return null; }
      var d = (s.split('.')[1] || '').length;
      if (d > (dec || 0)) { errs.push({ field: f, message: label + (dec ? '最多一位小数' : '要填整数') }); return null; }
      if (x < lo || x > hi) { var u = String(unit || '').split('|'); errs.push({ field: f, message: label + '要在 ' + fmtN(lo) + '～' + fmtN(hi) + u[0] + ' 之间' + (u[1] || '') }); return null; }
      return x;
    }
    P.name = String(st.name == null ? '' : st.name).slice(0, 12).trim() || '这条路';
    var v = need(st.v, 'v', 3, 80, '速度', ' km/h', 1);
    if (v !== null) P.v10 = Math.round(v * 10);
    P.limit = need(st.limit, 'limit', 5, 80, '最快能到', ' km/h');
    P.dep = need(st.dep, 'dep', 0, 3599, '出发时刻', ' 秒');
    P.loss = need(st.loss, 'loss', 0, 10, '起步损失', ' 秒');
    P.dest = need(st.dest, 'dest', 1, 30000, '终点距起点', ' 米');
    var L = Array.isArray(st.lights) ? st.lights : [];
    if (!L.length) errs.push({ field: 'lights', message: '至少要有 1 个红绿灯' });
    if (L.length > MAX_LIGHTS) errs.push({ field: 'lights', message: '最多 ' + MAX_LIGHTS + ' 个红绿灯' });
    P.lights = [];
    var prev = -1;
    L.slice(0, MAX_LIGHTS).forEach(function (x, i) {
      x = x && typeof x === 'object' ? x : {};
      var tag = '第 ' + (i + 1) + ' 个灯的', k = 'L' + i + '_';
      var pos = need(x.pos, k + 'pos', 0, 30000, tag + '位置', ' 米');
      var C = need(x.C, k + 'C', 20, 300, tag + '周期', ' 秒');
      var G = C === null ? null : need(x.G, k + 'G', 1, C - 1, tag + '绿灯', ' 秒|（要比周期短）');
      var off = need(x.off, k + 'off', 0, 3599, tag + '变绿时刻', ' 秒|（秒表读数）');
      if (pos !== null) {
        if (pos <= prev) errs.push({ field: k + 'pos', message: tag + '位置要比前一个灯远' });
        prev = pos;
      }
      P.lights.push({ pos: pos, C: C, G: G, off: off });   /* 秒表读数可以超过周期：相位取模时自然折算 */
    });
    if (P.dest !== null && prev >= 0 && P.dest < prev) errs.push({ field: 'dest', message: '终点不能比最后一个灯近（最后一个灯在 ' + prev + ' 米）' });
    return errs.length ? { errors: errs } : { P: P, errors: [] };
  }

  function mod(a, m) { return ((a % m) + m) % m; }

  /* 跑一趟：v10 = 速度 × 10，dep = 出发的秒表秒数（整数）。所有时刻的分子都以 1/v10 秒为单位。 */
  function run(P, v10, dep) {
    var T = dep * v10, prev = 0, stops = 0, waitN = 0, rows = [];
    P.lights.forEach(function (l, i) {
      T += (l.pos - prev) * 36; prev = l.pos;
      var ph = mod(T - l.off * v10, l.C * v10), green = ph < l.G * v10, w = 0;
      if (!green) { w = l.C * v10 - ph + P.loss * v10; stops++; waitN += w; }
      rows.push({ i: i, pos: l.pos, at: T, phase: ph, green: green, wait: w, redLeft: green ? 0 : l.C * v10 - ph, greenLeft: green ? l.G * v10 - ph : 0, leave: T + w });
      T += w;
    });
    T += (P.dest - prev) * 36;
    return { v10: v10, dep: dep, arrive: T, stops: stops, waitN: waitN, rows: rows, trip: T - dep * v10, free: P.dest * 36 };
  }
  function sec(n, v10) { return n / v10; }
  /* 到达时刻比较：a.arrive/a.v10 vs b.arrive/b.v10 */
  function cmpArrive(a, b) { var x = a.arrive * b.v10, y = b.arrive * a.v10; return x < y ? -1 : x > y ? 1 : 0; }

  /* 速度扫描：5 km/h 到「最快能到」，每 1 km/h 一档 */
  function sweepSpeed(P) {
    var out = [];
    for (var k = 5; k <= P.limit; k++) out.push(run(P, k * 10, P.dep));
    return out;
  }
  function bands(sw) {   /* 一路不停的整数速度段 */
    var b = [], cur = null;
    sw.forEach(function (r) {
      var k = r.v10 / 10;
      if (r.stops === 0) { if (cur && cur[1] === k - 1) cur[1] = k; else { cur = [k, k]; b.push(cur); } }
    });
    return b;
  }

  function evaluate(P) {
    var r = run(P, P.v10, P.dep), sw = sweepSpeed(P), best = null, nonstop = null;
    sw.forEach(function (x) {
      if (!best || cmpArrive(x, best) < 0 || (cmpArrive(x, best) === 0 && x.stops < best.stops)) best = x;
      if (x.stops === 0) nonstop = x;   /* 一路不停里速度最快的（也就到得最早） */
    });
    var worst = null; r.rows.forEach(function (w) { if (w.wait && (!worst || w.wait > worst.wait)) worst = w; });
    return { r: r, sweep: sw, best: best, nonstop: nonstop, bands: bands(sw), worst: worst, maxC: Math.max.apply(null, P.lights.map(function (l) { return l.C; })) };
  }

  function applyChange(st, act) {
    var s = JSON.parse(JSON.stringify(st));
    if (act.kind === 'speed') s.v = String(act.to);
    else if (act.kind === 'later' || act.kind === 'earlier') s.dep = String(act.to);
    return s;
  }

  function actions(st, P, ev) {
    var acts = [], r = ev.r;
    if (r.stops === 0) return acts;
    function verify(a) { var q = parse(applyChange(st, a)); return q.P ? run(q.P, q.P.v10, q.P.dep) : null; }
    function diffText(x) {   /* 与现在相比的全程差，x 为 run 结果 */
      var d = r.trip * x.v10 - x.trip * r.v10, den = r.v10 * x.v10;   /* 正 = 更快 */
      if (d === 0) return '全程一样';
      return (d > 0 ? '全程快 ' : '全程慢 ') + secs(Math.abs(d) / den);
    }
    var b = ev.best;
    if (b && b.v10 !== P.v10 && cmpArrive(b, r) < 0) {
      var a1 = { kind: 'speed', to: b.v10 / 10 }, x1 = verify(a1);
      a1.id = 'act_best'; a1.text = '开 ' + a1.to + ' km/h：' + (x1.stops ? '停 ' + x1.stops + ' 次' : '一路不停') + '，' + diffText(x1); a1.run = x1; acts.push(a1);
    }
    var n = ev.nonstop;
    if (n && n.v10 !== P.v10 && !(b && n.v10 === b.v10 && acts.length)) {
      var a2 = { kind: 'speed', to: n.v10 / 10 }, x2 = verify(a2);
      a2.id = 'act_nonstop'; a2.text = '开 ' + a2.to + ' km/h：一路不停，' + diffText(x2); a2.run = x2; acts.push(a2);
    }
    /* 晚一点出门：出发晚 d 秒、到达不晚于现在的最大 d（路口少等的时间挪到出门前） */
    var later = null;
    for (var d = 1; d <= ev.maxC && P.dep + d <= 3599; d++) { var y = run(P, P.v10, P.dep + d); if (y.arrive <= r.arrive) later = { d: d, x: y }; }
    if (later) {
      var a3 = { kind: 'later', to: P.dep + later.d, d: later.d }, x3 = verify(a3);
      a3.id = 'act_later'; a3.text = '晚 ' + later.d + ' 秒出门：' + (x3.arrive === r.arrive ? '到的时刻不变' : '反而早到 ' + secs((r.arrive - x3.arrive) / P.v10)) + '，路上停 ' + x3.stops + ' 次'; a3.run = x3; acts.push(a3);
    }
    /* 早一点出门：早到的秒数比早出门的秒数还多（赶上前一波绿灯），取多出最多的里最小的 d */
    var early = null;
    for (var e = 1; e <= ev.maxC && P.dep - e >= 0; e++) {
      var z = run(P, P.v10, P.dep - e), gain = r.arrive - z.arrive - e * P.v10;
      if (gain > 0 && (!early || gain > early.gain)) early = { d: e, x: z, gain: gain };
    }
    if (early) {
      var a4 = { kind: 'earlier', to: P.dep - early.d, d: early.d }, x4 = verify(a4);
      a4.id = 'act_earlier'; a4.text = '早 ' + early.d + ' 秒出门：早到 ' + secs((r.arrive - x4.arrive) / P.v10) + '，路上停 ' + x4.stops + ' 次'; a4.run = x4; acts.push(a4);
    }
    return acts;
  }

  function compute(st) {
    var q = parse(st);
    if (!q.P) return { ok: false, errors: q.errors };
    var P = q.P, ev = evaluate(P);
    return { ok: true, errors: [], P: P, ev: ev, actions: actions(st, P, ev) };
  }

  /* —— 文字 —— */
  function fmt(x, d) {
    var neg = x < 0, s = Math.abs(x).toFixed(d);
    if (Number(s) === 0) neg = false;
    var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + p.join('.');
  }
  function r1(x) { return Math.round(x * 10 + 1e-9) / 10; }
  /* 秒数一律四舍五入到 0.1 秒；60 秒以上写成「x 分 y 秒」 */
  function secs(x) {
    var t = r1(x);
    if (t < 60) return fmt(t, t % 1 ? 1 : 0) + ' 秒';
    if (t >= 3600) { var h = Math.floor(t / 3600), mm = Math.round((t - h * 3600) / 60); if (mm === 60) { h++; mm = 0; } return h + ' 小时' + (mm ? ' ' + mm + ' 分' : ''); }   /* 一小时以上精确到分 */
    var m = Math.floor(t / 60), s = r1(t - m * 60);
    return m + ' 分' + (s ? ' ' + fmt(s, s % 1 ? 1 : 0) + ' 秒' : '');
  }
  function clock(x) {   /* 秒表：第 x 秒 → mm:ss.s（超过 60 分钟时分钟照写，如 125:03.0） */
    var t = r1(x), m = Math.floor(t / 60), s = r1(t - m * 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + fmt(s, 1);
  }
  function tickLabel(t) { var m = Math.floor(t / 60), s = Math.round(t - m * 60); return m + ':' + (s < 10 ? '0' : '') + s; }
  function kmh(v10) { return fmt(v10 / 10, v10 % 10 ? 1 : 0) + ' km/h'; }
  function bandText(b) { return b.map(function (x) { return x[0] === x[1] ? x[0] : x[0] + '–' + x[1]; }).join('、'); }

  function headline(o) {
    var P = o.P, r = o.ev.r, n = P.lights.length, v = kmh(P.v10);
    if (!r.stops) return P.name + '按 ' + v + ' 走一路绿：' + n + ' 个灯一次没停，全程 ' + secs(r.trip / P.v10) + '。';
    return P.name + '按 ' + v + ' 走，' + n + ' 个灯要停 ' + r.stops + ' 次，路口一共耽误 ' + secs(r.waitN / P.v10) + '，全程 ' + secs(r.trip / P.v10) + '（一路不停只要 ' + secs(r.free / P.v10) + '）。';
  }
  function explain(o) {
    var P = o.P, ev = o.ev, r = ev.r, s = '';
    if (ev.worst) {
      var w = ev.worst;
      s += '耽误最久的是第 ' + (w.i + 1) + ' 个灯（' + fmt(w.pos, 0) + ' 米）：到的时候红灯还剩 ' + secs(w.redLeft / P.v10) + (P.loss ? '，再加起步 ' + P.loss + ' 秒' : '') + '。';
    } else {
      var tight = null; r.rows.forEach(function (x) { if (!tight || x.greenLeft < tight.greenLeft) tight = x; });
      s += '最险的是第 ' + (tight.i + 1) + ' 个灯：过的时候绿灯只剩 ' + secs(tight.greenLeft / P.v10) + '。';
    }
    if (ev.bands.length) s += '按现在的出发时刻，' + bandText(ev.bands) + ' km/h 能一路不停';
    else s += '按现在的出发时刻，5–' + P.limit + ' km/h 里没有能一路不停的速度';
    var b = ev.best;
    s += '；5–' + P.limit + ' km/h 里到得最早的是 ' + kmh(b.v10) + '（全程 ' + secs(b.trip / b.v10) + '，停 ' + b.stops + ' 次）。';
    if (P.v10 > P.limit * 10) s += '你填的速度比「最快能到」的 ' + P.limit + ' km/h 还快。';
    return s;
  }

  function lightRows(o) {
    var P = o.P;
    return o.ev.r.rows.map(function (x) {
      var l = P.lights[x.i];
      return { i: x.i, pos: x.pos, C: l.C, G: l.G, off: l.off, at: x.at / P.v10, phase: x.phase / P.v10, green: x.green, wait: x.wait / P.v10, redLeft: x.redLeft / P.v10, greenLeft: x.greenLeft / P.v10 };
    });
  }

  function csvCell(v) { var x = String(v); if (/^[=+\-@]/.test(x) && !/^-?\d+(\.\d+)?$/.test(x)) x = "'" + x; return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }
  function row(a) { return a.map(csvCell).join(','); }
  function toCSV(o, when) {
    var P = o.P, L = [];
    L.push(row(['灯又红了', '导出时间', when, '路', P.name, '速度 km/h', P.v10 / 10, '出发 秒表秒', P.dep, '起步损失 秒', P.loss, '终点 米', P.dest]));
    L.push(row(['第几个灯', '距起点 米', '周期 秒', '绿灯 秒', '变绿时刻 秒', '到达 秒表秒', '到达时相位 秒', '灯色', '耽误 秒']));
    lightRows(o).forEach(function (x) { L.push(row([x.i + 1, x.pos, x.C, x.G, x.off, x.at.toFixed(2), x.phase.toFixed(2), x.green ? '绿' : '红', x.wait.toFixed(2)])); });
    L.push(row(['终点', P.dest, '', '', '', (o.ev.r.arrive / P.v10).toFixed(2), '', '', '']));
    L.push('');
    L.push(row(['速度 km/h', '停几次', '全程 秒']));
    o.ev.sweep.forEach(function (x) { L.push(row([x.v10 / 10, x.stops, (x.trip / x.v10).toFixed(2)])); });
    return L.join('\r\n') + '\r\n';
  }
  function toMD(o, when) {
    var P = o.P, L = [];
    L.push('# 灯又红了 · ' + P.name, '', '_导出：' + when + '_', '', '**' + headline(o) + '**', '', explain(o), '');
    L.push('| 条件 | 数值 |', '|---|---|');
    L.push('| 速度 | ' + kmh(P.v10) + '（扫描 5–' + P.limit + ' km/h） |', '| 出发 | 秒表第 ' + P.dep + ' 秒 |', '| 起步损失 | ' + P.loss + ' 秒 |', '| 终点 | ' + fmt(P.dest, 0) + ' 米 |', '');
    L.push('| 灯 | 距起点 | 周期/绿灯/变绿 | 到达（秒表） | 灯色 | 耽误 |', '|---:|---:|---|---:|---|---:|');
    lightRows(o).forEach(function (x) { L.push('| ' + (x.i + 1) + ' | ' + fmt(x.pos, 0) + ' 米 | ' + x.C + ' / ' + x.G + ' / 第 ' + x.off + ' 秒 | ' + clock(x.at) + ' | ' + (x.green ? '绿（还剩 ' + secs(x.greenLeft) + '）' : '红（还剩 ' + secs(x.redLeft) + '）') + ' | ' + (x.wait ? secs(x.wait) : '—') + ' |'); });
    L.push('');
    o.actions.forEach(function (a) { L.push('- ' + a.text); });
    if (o.actions.length) L.push('');
    L.push('> 定时灯、匀速、只有你一个人的粗算：不算排队车辆、加减速、感应灯和潮汐灯。灯的周期和变绿时刻要自己在路口数，默认数字是虚构示例。');
    return L.join('\n') + '\n';
  }

  var api = { MAX_LIGHTS: MAX_LIGHTS, defaultState: defaultState, parse: parse, run: run, sweepSpeed: sweepSpeed, bands: bands, cmpArrive: cmpArrive, evaluate: evaluate,
    applyChange: applyChange, actions: actions, compute: compute, headline: headline, explain: explain, lightRows: lightRows,
    fmt: fmt, secs: secs, clock: clock, tickLabel: tickLabel, kmh: kmh, bandText: bandText, num: num, sec: sec, toCSV: toCSV, toMD: toMD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
