/* 灯又红了 · 核心测试：node --test tests/core.test.cjs
 * 锚点：tests/ref.json（独立 Python 按文字规则用 Fraction 重写，300 组）、默认场景手算、阈值两侧（绿灯最后一刻/变红那一刻）、
 *       边界与非法输入、改法真的重算、导出。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const A = require(path.join(__dirname, '..', 'core.js'));
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'ref.json'), 'utf8'));
const D = () => A.defaultState();
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' ' + a + ' vs ' + b);
const one = (o) => Object.assign(D(), o);

test('默认场景：手算读数、标题、说明、改法', () => {
  const o = A.compute(D()); assert.ok(o.ok, JSON.stringify(o.errors));
  const R = A.lightRows(o);
  /* 50 km/h = 125/9 m/s。出发第 30 秒；第 1 灯 300 米 → 30 + 21.6 = 51.6，相位 51.6 − 27 = 24.6 < 40 绿 */
  near(R[0].at, 51.6, 1e-9); near(R[0].phase, 24.6, 1e-9); assert.equal(R[0].green, true);
  /* 第 5 灯 2000 米：30 + 144 = 174，相位 174 mod 90 = 84 ≥ 40 红，红灯剩 6 秒 + 起步 2 = 8 */
  near(R[4].at, 174, 1e-9); assert.equal(R[4].green, false); near(R[4].wait, 8, 1e-9);
  /* 第 6 灯：174 + 8 + 450 × 0.072 = 214.4，相位 214.4 − 40 = 174.4 mod 90 = 84.4 → 等 5.6 + 2 */
  near(R[5].at, 214.4, 1e-9); near(R[5].wait, 7.6, 1e-9);
  assert.equal(o.ev.r.stops, 2);
  near(o.ev.r.trip / o.P.v10, 2700 * 0.072 + 15.6, 1e-9);
  assert.deepEqual(o.ev.bands, [[12, 12], [39, 46]]);
  assert.equal(o.ev.best.v10, 600);
  assert.equal(A.headline(o), '上班那条路按 50 km/h 走，6 个灯要停 2 次，路口一共耽误 15.6 秒，全程 3 分 30 秒（一路不停只要 3 分 14.4 秒）。');
  assert.equal(A.explain(o), '耽误最久的是第 5 个灯（2,000 米）：到的时候红灯还剩 6 秒，再加起步 2 秒。按现在的出发时刻，12、39–46 km/h 能一路不停；5–60 km/h 里到得最早的是 60 km/h（全程 3 分 27 秒，停 4 次）。');
  assert.deepEqual(o.actions.map((a) => a.text), [
    '开 60 km/h：停 4 次，全程快 3 秒',
    '开 46 km/h：一路不停，全程慢 1.3 秒',
    '晚 15 秒出门：反而早到 0.6 秒，路上停 0 次']);
});

test('与独立 Python 实现逐组对拍（300 组）', () => {
  assert.equal(REF.cases.length, 300);
  const st = REF.stats;
  assert.ok(st.nonstop_now >= 20 && st.stops3plus >= 40 && st.no_band >= 20 && st.has_early >= 40 && st.has_later >= 40, JSON.stringify(st));
  let actChecked = 0;
  for (const c of REF.cases) {
    const o = A.compute(c.state), m = JSON.stringify(c.state); assert.ok(o.ok, JSON.stringify(o.errors) + m);
    const x = c.expect, r = o.ev.r, v = o.P.v10;
    assert.equal(r.stops, x.stops, m); near(r.waitN / v, x.wait, 1e-9, m); near(r.trip / v, x.trip, 1e-9, m);
    assert.deepEqual(r.rows.map((w) => w.green), x.green, m);
    assert.equal(o.ev.best.v10 / 10, x.bestV, m); assert.equal(o.ev.best.stops, x.bestStops, m); near(o.ev.best.trip / o.ev.best.v10, x.bestTrip, 1e-9, m);
    assert.deepEqual(o.ev.sweep.map((s) => s.stops), x.sweepStops, m);
    assert.equal(o.ev.nonstop ? o.ev.nonstop.v10 / 10 : null, x.nonstopMax, m);
    const ids = o.actions.map((a) => a.id);
    if (x.stops === 0) assert.equal(o.actions.length, 0, m);
    else {
      const later = o.actions.find((a) => a.id === 'act_later'), early = o.actions.find((a) => a.id === 'act_earlier');
      assert.equal(later ? later.d : null, x.later, m + ' later'); assert.equal(early ? early.d : null, x.early, m + ' early');
      if (early) near((r.arrive - early.run.arrive) / v - early.d, x.earlyGain, 1e-9, m);
      actChecked++;
    }
    assert.equal(new Set(ids).size, ids.length, '改法 id 不重复');
  }
  assert.ok(actChecked >= 200);
});

test('阈值两侧：绿灯最后一刻、变红那一刻、变绿那一刻', () => {
  /* 一个灯在 100 米，周期 60、绿 30、第 0 秒变绿；36 km/h = 10 m/s，到灯用 10 秒 */
  const base = { v: '36', limit: '36', loss: '0', dest: '100', lights: [{ pos: '100', C: '60', G: '30', off: '0' }] };
  const at = (dep) => A.compute(one(Object.assign({}, base, { dep: String(dep) })));
  assert.equal(at(19).ev.r.stops, 0, '到达 29 秒：绿');
  assert.equal(at(20).ev.r.stops, 1, '到达 30 秒正好变红：红（左闭右开）');
  near(at(20).ev.r.waitN / 360, 30, 1e-12);
  assert.equal(at(50).ev.r.stops, 0, '到达 60 秒正好变绿：绿');
  assert.equal(at(49).ev.r.stops, 1); near(at(49).ev.r.waitN / 360, 1, 1e-12, '还差 1 秒变绿');
  /* 起步损失只加在停下的灯上 */
  const s = one(Object.assign({}, base, { dep: '49', loss: '3' })); near(A.compute(s).ev.r.waitN / 360, 4, 1e-12);
  /* 秒表读数大于周期时按周期折算：off 120 与 0 等价 */
  const s2 = one(Object.assign({}, base, { dep: '20' })); s2.lights[0].off = '120';
  assert.equal(A.compute(s2).ev.r.stops, 1);
  /* 小数速度：37.5 km/h 走 125 米正好 12 秒 */
  const s3 = one({ v: '37.5', limit: '40', dep: '18', loss: '0', dest: '125', lights: [{ pos: '125', C: '60', G: '30', off: '0' }] });
  assert.equal(A.compute(s3).ev.r.stops, 1, '18 + 12 = 30 正好变红');
  s3.dep = '17'; assert.equal(A.compute(s3).ev.r.stops, 0);
});

test('常识与单调：没有灯停时全程 = 距离 ÷ 速度；耽误不超过 周期 + 起步损失', () => {
  for (const c of REF.cases.slice(0, 120)) {
    const o = A.compute(c.state), P = o.P, r = o.ev.r;
    near(r.trip / P.v10, P.dest * 3.6 / (P.v10 / 10) + r.waitN / P.v10, 1e-9);
    r.rows.forEach((w, i) => { assert.ok(w.wait / P.v10 <= P.lights[i].C + P.loss + 1e-9); if (w.green) assert.equal(w.wait, 0); else assert.ok(w.wait / P.v10 > P.loss); });
    assert.ok(A.cmpArrive(o.ev.best, r) <= 0 || P.v10 > P.limit * 10 || P.v10 % 10 !== 0 || P.v10 < 50, '整数速度在扫描范围内时，最早到达不会比现在晚');
  }
});

test('改法：点了之后真的变成那个结果', () => {
  for (const c of REF.cases.slice(0, 150)) {
    const o = A.compute(c.state);
    for (const a of o.actions) {
      const o2 = A.compute(A.applyChange(c.state, a)); assert.ok(o2.ok);
      assert.equal(o2.ev.r.arrive * a.run.v10, a.run.arrive * o2.P.v10);
      assert.equal(o2.ev.r.stops, a.run.stops);
      if (a.kind === 'later') { assert.ok(o2.ev.r.arrive * o.P.v10 <= o.ev.r.arrive * o2.P.v10, '晚出门不晚到'); assert.ok(a.d >= 1); }
      if (a.kind === 'earlier') assert.ok((o.ev.r.arrive - o2.ev.r.arrive) / o.P.v10 > a.d, '早到的比早出门的多');
      if (a.id === 'act_nonstop') assert.equal(o2.ev.r.stops, 0);
      if (a.id === 'act_best') assert.ok(A.cmpArrive(o2.ev.r, o.ev.r) < 0);
    }
  }
  /* 一路绿时不给改法 */
  const s = D(); s.v = '42'; const o = A.compute(s); assert.equal(o.ev.r.stops, 0); assert.equal(o.actions.length, 0);
  assert.equal(A.headline(o), '上班那条路按 42 km/h 走一路绿：6 个灯一次没停，全程 3 分 51.4 秒。');
  assert.match(A.explain(o), /^最险的是第 \d 个灯：过的时候绿灯只剩 [\d.]+ 秒。/);
  /* 最快那档与一路不停是同一档时只给一条 */
  const s2 = D(); s2.limit = '46'; const o3 = A.compute(s2);
  assert.deepEqual(o3.actions.filter((a) => a.kind === 'speed').map((a) => a.text), ['开 46 km/h：一路不停，全程慢 1.3 秒']);
});

test('没有能一路不停的速度、早出门赶上前一波', () => {
  /* 一个灯 100 米，周期 60、绿 10、第 20 秒变绿；36 km/h 走 10 秒。第 25 秒出发 → 35 秒到（红），等到 80 秒变绿。
   * 早 6 秒（第 19 秒出发）→ 29 秒到，绿灯最后 1 秒，早到 51 秒；早 15 秒也是 20 秒到、早到 60 秒，多出来的同为 45 秒，取早得少的 6 秒。 */
  const s = { name: '', v: '36', limit: '36', dep: '25', loss: '0', dest: '100', lights: [{ pos: '100', C: '60', G: '10', off: '20' }] };
  const o = A.compute(s); assert.ok(o.ok); assert.equal(o.P.name, '这条路');
  assert.equal(o.ev.r.stops, 1); near(o.ev.r.waitN / 360, 45, 1e-9);
  const e = o.actions.find((a) => a.kind === 'earlier'); assert.ok(e); assert.equal(e.d, 6);
  assert.equal(e.text, '早 6 秒出门：早到 51 秒，路上停 0 次');
  /* 晚出门：第 26～70 秒出发都在 80 秒或之前到 → 最多晚 45 秒（第 70 秒出发 80 秒到，正好绿） */
  const l = o.actions.find((a) => a.kind === 'later'); assert.equal(l.d, 45); assert.equal(l.text, '晚 45 秒出门：到的时刻不变，路上停 0 次');
  /* 已经在第 0 秒出发就不给早出门 */
  s.dep = '0'; assert.equal(A.compute(s).actions.find((a) => a.kind === 'earlier'), undefined);
  /* 没有能一路不停的速度：从对拍样本里找一组，说明要说出来 */
  const c = REF.cases.find((x) => !x.expect.nonstop.length && x.expect.stops > 0);
  assert.ok(c); const o2 = A.compute(c.state);
  assert.equal(o2.ev.bands.length, 0); assert.match(A.explain(o2), /5–\d+ km\/h 里没有能一路不停的速度/);
  assert.equal(o2.actions.find((a) => a.id === 'act_nonstop'), undefined);
});

test('并列：到得一样早取停得少的、耽误一样久取前面的灯、第 0 秒出发', () => {
  /* 第 2 个灯在终点，周期 300、绿 1、第 200 秒变绿：5–40 km/h 里 2.6～? 都要在终点等到 200 秒，到达时刻一样。
   * 36 km/h 到第 1 灯 10 秒正好变红（停），40 km/h 9 秒绿 → 并列时取 40（停得少），不取扫描里先出现的。 */
  const s = { name: '', v: '36', limit: '40', dep: '0', loss: '0', dest: '1000', lights: [{ pos: '100', C: '60', G: '10', off: '0' }, { pos: '1000', C: '300', G: '1', off: '200' }] };
  const o = A.compute(s), b = o.ev.best;
  const ties = o.ev.sweep.filter((x) => A.cmpArrive(x, b) === 0);
  assert.ok(ties.length > 1 && ties.some((x) => x.stops > b.stops), '样例要有不同停车次数的并列');
  assert.equal(b.stops, Math.min(...ties.map((x) => x.stops)));
  /* 两个灯耽误一样久（各 10 秒）：说的是第 1 个 */
  const t = { name: '', v: '36', limit: '36', dep: '0', loss: '0', dest: '300', lights: [{ pos: '100', C: '60', G: '10', off: '20' }, { pos: '300', C: '60', G: '10', off: '50' }] };
  const o2 = A.compute(t); assert.deepEqual(o2.ev.r.rows.map((x) => x.wait / 360), [10, 10]);
  assert.match(A.explain(o2), /^耽误最久的是第 1 个灯/);
  /* 最快那档也一路不停（30 km/h 起步，扫到 46，最早的是 46 且不停）→ 只给一条速度改法 */
  const u = D(); u.limit = '46'; u.v = '30';
  assert.deepEqual(A.compute(u).actions.filter((a) => a.kind === 'speed').map((a) => a.id), ['act_best']);
  /* 早出门正好早到第 0 秒：100 米 10 秒，绿 [1, 11)；第 6 秒出发 16 秒到红，第 0 秒出发 10 秒到绿 */
  const w = { name: '', v: '36', limit: '36', dep: '6', loss: '0', dest: '100', lights: [{ pos: '100', C: '60', G: '10', off: '1' }] };
  const e = A.compute(w).actions.find((a) => a.kind === 'earlier'); assert.ok(e); assert.equal(e.d, 6);
});

test('非法输入：每个字段都给出能看懂的提示', () => {
  const bad = (patch, field, msg) => {
    const s = D(); patch(s); const o = A.compute(s); assert.equal(o.ok, false);
    const e = o.errors.find((x) => x.field === field); assert.ok(e, field + ' ' + JSON.stringify(o.errors)); if (msg) assert.match(e.message, msg);
  };
  bad((s) => { s.v = 'abc'; }, 'v', /速度要填数字/);
  bad((s) => { s.v = '2'; }, 'v', /3～80/);
  bad((s) => { s.v = '81'; }, 'v');
  bad((s) => { s.v = '40.25'; }, 'v', /一位小数/);
  bad((s) => { s.limit = '4'; }, 'limit');
  bad((s) => { s.limit = '50.5'; }, 'limit', /整数/);
  bad((s) => { s.dep = '-1'; }, 'dep');
  bad((s) => { s.dep = '3600'; }, 'dep');
  bad((s) => { s.loss = '11'; }, 'loss');
  bad((s) => { s.dest = '2000'; }, 'dest', /最后一个灯在 2450 米/);
  bad((s) => { s.lights[2].pos = '700'; }, 'L2_pos', /比前一个灯远/);
  bad((s) => { s.lights[1].pos = '300'; }, 'L1_pos', /比前一个灯远/);
  bad((s) => { s.lights[0].C = '19'; }, 'L0_C', /20～300/);
  bad((s) => { s.lights[0].G = '90'; }, 'L0_G', /要比周期短/);
  bad((s) => { s.lights[0].G = '0'; }, 'L0_G');
  bad((s) => { s.lights[0].off = '3600'; }, 'L0_off');
  bad((s) => { s.lights = []; }, 'lights', /至少/);
  bad((s) => { s.lights = Array.from({ length: 13 }, (_, i) => ({ pos: String(i * 100), C: '60', G: '30', off: '0' })); }, 'lights', /最多 12/);
  /* 全角与中文小数点、全角负号都认 */
  const s = D(); s.v = '５０'; s.dest = '２７００'; assert.ok(A.compute(s).ok);
  s.v = '37。5'; assert.equal(A.compute(s).P.v10, 375);
  /* 名字截 12 字；第 1 个灯可以在 0 米；终点可以等于最后一个灯 */
  const t = D(); t.name = '一二三四五六七八九十甲乙丙丁'; t.lights[0].pos = '0'; t.dest = '2450';
  const o = A.compute(t); assert.ok(o.ok); assert.equal(o.P.name, '一二三四五六七八九十甲乙');
  assert.equal(A.compute(null).ok, false);
});

test('格式：秒、分秒、时刻、速度、千分位', () => {
  assert.equal(A.secs(0), '0 秒'); assert.equal(A.secs(15.6), '15.6 秒'); assert.equal(A.secs(59.96), '1 分');
  assert.equal(A.secs(194.4), '3 分 14.4 秒'); assert.equal(A.secs(210), '3 分 30 秒'); assert.equal(A.secs(1.25), '1.3 秒');
  assert.equal(A.secs(3599.9), '59 分 59.9 秒'); assert.equal(A.secs(3600), '1 小时'); assert.equal(A.secs(39233), '10 小时 54 分'); assert.equal(A.secs(7199), '2 小时');
  assert.equal(A.tickLabel(90), '1:30'); assert.equal(A.tickLabel(3720), '62:00');
  assert.equal(A.clock(51.6), '00:51.6'); assert.equal(A.clock(174), '02:54.0'); assert.equal(A.clock(59.97), '01:00.0');
  assert.equal(A.kmh(500), '50 km/h'); assert.equal(A.kmh(375), '37.5 km/h');
  assert.equal(A.fmt(12345, 0), '12,345'); assert.equal(A.fmt(-0.01, 1), '0.0');
  assert.equal(A.bandText([[12, 12], [39, 46]]), '12、39–46');
});

test('极值：12 个灯、30 公里、3 km/h 起扫、最长周期', () => {
  const s = { name: 'x', v: '80', limit: '80', dep: '3599', loss: '10', dest: '30000', lights: Array.from({ length: 12 }, (_, i) => ({ pos: String(1000 + i * 2500), C: '300', G: '1', off: String(i * 7) })) };
  const o = A.compute(s); assert.ok(o.ok);
  assert.equal(o.ev.sweep.length, 76);
  assert.ok(o.ev.r.stops >= 10);
  assert.ok(!o.actions.some((a) => a.kind === 'later'), '出发已在 3599 秒，不能再晚');
  s.v = '3'; s.limit = '5'; const o2 = A.compute(s); assert.ok(o2.ok); assert.ok(isFinite(o2.ev.r.trip));
  assert.match(A.explain(o2), /^耽误最久/);
});

test('导出：CSV 防公式注入与转义、MD 含表、行数对得上', () => {
  const s = D(); s.name = '=1+1,"路"'; const o = A.compute(s);
  const csv = A.toCSV(o, '2026-11-18 04:00'), L = csv.trim().split('\r\n');
  assert.ok(L[0].includes('"\'=1+1,""路"""'));
  assert.equal(L.length, 2 + 6 + 1 + 1 + 1 + o.ev.sweep.length);
  assert.ok(L[2].startsWith('1,300,90,40,27,51.60,24.60,绿,0.00'));
  assert.ok(L[6].startsWith('5,2000,90,40,0,174.00,84.00,红,8.00'));
  const md = A.toMD(o, 'x');
  assert.ok(md.includes('| 5 | 2,000 米 | 90 / 40 / 第 0 秒 | 02:54.0 | 红（还剩 6 秒） | 8 秒 |'));
  assert.ok(md.includes('- 开 46 km/h：一路不停，全程慢 1.3 秒'));
  assert.ok(md.includes('默认数字是虚构示例'));
});
