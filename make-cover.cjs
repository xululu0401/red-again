/* 封面 cover.svg（1200×1200）：时间—距离图与读数来自 core.js 同一次 compute；再用浏览器截成 cover.png。 */
const fs = require('node:fs');
const A = require('./core.js');
const o = A.compute(A.defaultState()), P = o.P, r = o.ev.r, ns = o.ev.nonstop;
if (!o.ok || r.stops !== 2 || ns.v10 !== 460) throw new Error('默认场景不对');
const F = "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
const x0 = 230, w = 830, y0 = 500, h = 470, lo = P.dep - 6, hi = Math.max(r.arrive / P.v10, ns.arrive / ns.v10) + 6;
const X = (t) => x0 + (t - lo) / (hi - lo) * w, Y = (d) => y0 + h - d / P.dest * h;
let bars = '';
P.lights.forEach((l, i) => {
  const y = Y(l.pos);
  bars += `<rect x="${x0}" y="${(y - 6).toFixed(1)}" width="${w}" height="12" fill="#c8423a"/>`;
  for (let k = Math.floor((lo - l.off) / l.C) - 1; ; k++) { const a = l.off + k * l.C, b = a + l.G; if (a > hi) break; if (b > lo) bars += `<rect x="${X(Math.max(a, lo)).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="${(X(Math.min(b, hi)) - X(Math.max(a, lo))).toFixed(1)}" height="12" fill="#2f8a57"/>`; }
  bars += `<text x="${x0 - 16}" y="${(y + 9).toFixed(1)}" text-anchor="end" font-family="${F}" font-size="26" fill="#4a545b">第 ${i + 1} 个灯</text>`;
});
const path = [[P.dep, 0]]; r.rows.forEach((x) => { path.push([x.at / P.v10, x.pos]); if (x.wait) path.push([x.leave / P.v10, x.pos]); }); path.push([r.arrive / P.v10, P.dest]);
const pl = (pts, c, sw, dash) => `<polyline fill="none" stroke="${c}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linejoin="round" points="${pts.map((p) => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ')}"/>`;
const dots = r.rows.filter((x) => x.wait).map((x) => `<circle cx="${X(x.at / P.v10).toFixed(1)}" cy="${Y(x.pos).toFixed(1)}" r="9" fill="#c8423a" stroke="#fff" stroke-width="3"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#eceff0"/>
  <rect x="60" y="60" width="1080" height="1080" rx="18" fill="#fcfcfb"/>
  <text x="140" y="225" font-family="${F}" font-size="120" font-weight="800" fill="#1f2529">灯又红了</text>
  <text x="140" y="300" font-family="${F}" font-size="40" fill="#4a545b">换个速度、早几秒晚几秒出门，能不能一路绿</text>
  <text x="140" y="390" font-family="${F}" font-size="36" fill="#4a545b">${P.lights.length} 个灯，开 ${A.kmh(P.v10)}：</text>
  <text x="140" y="455" font-family="${F}" font-size="54" font-weight="800" fill="#c8423a">停 ${r.stops} 次　<tspan fill="#2f8a57">开 ${A.kmh(ns.v10)} 一路不停</tspan></text>
  ${bars}
  ${pl([[P.dep, 0], [ns.arrive / ns.v10, P.dest]], '#2f8a57', 4, '14 10')}${pl(path, '#3b4650', 8)}${dots}
  <text x="140" y="1090" font-family="${F}" font-size="24" fill="#80898f">定时灯、匀速的粗算 · 路和灯是虚构示例</text>
</svg>`;
fs.writeFileSync('cover.svg', svg);
fs.writeFileSync('/tmp/cover100.html', '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body>' + svg + '</body></html>');
console.log('cover.svg', svg.length);
