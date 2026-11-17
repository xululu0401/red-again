'use strict';
/* 注入测试：对 core.js 做一处小改动，看核心测试能不能抓到。跑完自动还原。
 * 首轮 26/32：秒表读数 off % C 是等价变异（相位取模时已折算）→ 删掉这处折算与变异；全角负号替换是死代码（没有字段允许负数）→ 删代码与变异；
 * 最早到达并列取停得少、耽误最久并列取靠前的灯、最快与不停同档只给一条、第 0 秒出发也能当早出门 → 补测。 */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const F=path.join(__dirname,'../core.js'),src=fs.readFileSync(F,'utf8');
const M=[
["T += (l.pos - prev) * 36; prev = l.pos;","T += (l.pos - prev) * 36;"],
["green = ph < l.G * v10","green = ph <= l.G * v10"],
["var ph = mod(T - l.off * v10, l.C * v10)","var ph = mod(T + l.off * v10, l.C * v10)"],
["w = l.C * v10 - ph + P.loss * v10;","w = l.C * v10 - ph;"],
["T += w;\n","\n"],
["T += (P.dest - prev) * 36;",""],
["var T = dep * v10,","var T = dep,"],
["for (var k = 5; k <= P.limit; k++)","for (var k = 5; k < P.limit; k++)"],
["if (r.stops === 0) { if (cur && cur[1] === k - 1)","if (r.stops === 0) { if (cur)"],
["(cmpArrive(x, best) === 0 && x.stops < best.stops)","false"],
["if (x.stops === 0) nonstop = x;","if (x.stops === 0 && !nonstop) nonstop = x;"],
["if (w.wait && (!worst || w.wait > worst.wait)) worst = w;","if (w.wait && (!worst || w.wait >= worst.wait)) worst = w;"],
["if (r.stops === 0) return acts;",""],
["if (b && b.v10 !== P.v10 && cmpArrive(b, r) < 0) {","if (b && b.v10 !== P.v10) {"],
["!(b && n.v10 === b.v10 && acts.length)","true"],
["d <= ev.maxC && P.dep + d <= 3599","d <= ev.maxC"],
["if (y.arrive <= r.arrive) later","if (y.arrive < r.arrive) later"],
["if (gain > 0 && (!early || gain > early.gain))","if (gain > 0 && (!early || gain >= early.gain))"],
["gain = r.arrive - z.arrive - e * P.v10","gain = r.arrive - z.arrive"],
["e <= ev.maxC && P.dep - e >= 0","e <= ev.maxC && P.dep - e > 0"],
["if (pos <= prev) errs.push","if (pos < prev) errs.push"],
["if (P.dest !== null && prev >= 0 && P.dest < prev)","if (false)"],
["need(x.G, k + 'G', 1, C - 1,","need(x.G, k + 'G', 1, C,"],
["if (d > (dec || 0))","if (d > 1)"],
["if (L.length > MAX_LIGHTS)","if (false)"],
["if (t < 60) return","if (t <= 60) return"],
["function r1(x) { return Math.round(x * 10 + 1e-9) / 10; }","function r1(x) { return Math.floor(x * 10) / 10; }"],
["if (/^[=+\\-@]/.test(x) && !/^-?\\d+(\\.\\d+)?$/.test(x)) x = \"'\" + x;",""],
["P.name = String(st.name == null ? '' : st.name).slice(0, 12).trim()","P.name = String(st.name == null ? '' : st.name).trim()"],
["(P.loss ? '，再加起步 ' + P.loss + ' 秒' : '')","''"],
];
let caught=0;const rows=[];
for(const [a,b] of M){
  if(src.indexOf(a)<0){rows.push('✗ 找不到原文：'+a.slice(0,80));continue;}
  fs.writeFileSync(F,src.replace(a,b));
  let ok=true;try{execFileSync('node',['--test',path.join(__dirname,'core.test.cjs')],{stdio:'pipe',timeout:120000});}catch(e){ok=false;}
  rows.push((ok?'✗ 没抓到':'✓ 抓到')+'：'+a.slice(0,70)+' → '+b.slice(0,70));if(!ok)caught++;
}
fs.writeFileSync(F,src);
console.log(rows.join('\n'));console.log('合计 '+caught+'/'+M.length);
