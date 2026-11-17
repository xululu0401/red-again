#!/usr/bin/env python3
"""灯又红了 · 独立参考实现（按需求简报的文字规则重写，不读 core.js）。
用 Fraction 直接算秒数（不用 1/v10 的整数单位），相位用 Fraction 取模。
生成 300 组随机场景 → tests/ref.json。
规则：
  - 速度 v km/h，走 x 米用 x / (v/3.6) 秒。
  - 灯 i 绿灯区间 [off + kC, off + kC + G)，off 取秒表读数 mod C。
  - 到达时刻 t：若 (t - off) mod C < G 直接过；否则等到下一次变绿再加起步损失 L 秒。
  - 速度扫描 5..limit 每 1 km/h；到得最早（并列取停得少，再并列取慢的）；一路不停里最快的。
  - 晚出门：d = 1..maxC 且 dep+d <= 3599，到达不晚于现在的最大 d。
  - 早出门：d = 1..maxC 且 dep-d >= 0，早到秒数 - d > 0 中差值最大、并列取最小 d。
"""
import json, random
from fractions import Fraction as F


def run(lights, dest, loss, v10, dep):
    v = F(v10, 36)  # 米/秒 = v10/10/3.6
    t = F(dep); prev = 0; stops = 0; wait = F(0); rows = []
    for (pos, C, G, off) in lights:
        t += F(pos - prev) / v; prev = pos
        ph = (t - (off % C)) % C
        if ph < G:
            rows.append((True, F(0))); continue
        w = C - ph + loss
        stops += 1; wait += w; rows.append((False, w)); t += w
    t += F(dest - prev) / v
    return {'arrive': t, 'stops': stops, 'wait': wait, 'trip': t - dep, 'rows': rows}


def solve(s):
    lights = [(l['pos'], l['C'], l['G'], l['off']) for l in s['lights']]
    v10 = s['v10']; dep = s['dep']; loss = s['loss']; dest = s['dest']; lim = s['limit']
    r = run(lights, dest, loss, v10, dep)
    sweep = [(k, run(lights, dest, loss, k * 10, dep)) for k in range(5, lim + 1)]
    best = None
    for k, x in sweep:
        if best is None or x['arrive'] < best[1]['arrive'] or (x['arrive'] == best[1]['arrive'] and x['stops'] < best[1]['stops']):
            best = (k, x)
    nonstop = [k for k, x in sweep if x['stops'] == 0]
    maxC = max(l[1] for l in lights)
    later = None
    for d in range(1, maxC + 1):
        if dep + d > 3599: break
        y = run(lights, dest, loss, v10, dep + d)
        if y['arrive'] <= r['arrive']: later = d
    early = None; eg = None
    for d in range(1, maxC + 1):
        if dep - d < 0: break
        z = run(lights, dest, loss, v10, dep - d)
        g = r['arrive'] - z['arrive'] - d
        if g > 0 and (eg is None or g > eg): early, eg = d, g
    return {
        'stops': r['stops'], 'wait': float(r['wait']), 'trip': float(r['trip']), 'arrive': float(r['arrive']),
        'green': [g for g, _ in r['rows']],
        'bestV': best[0], 'bestTrip': float(best[1]['trip']), 'bestStops': best[1]['stops'],
        'nonstop': nonstop, 'nonstopMax': max(nonstop) if nonstop else None,
        'later': later, 'early': early, 'earlyGain': float(eg) if eg is not None else None,
        'sweepStops': [x['stops'] for _, x in sweep],
    }


def gen(rng):
    n = rng.randint(1, 8)
    pos = sorted(rng.sample(range(50, 5000), n))
    C = rng.choice([60, 75, 90, 100, 120, 150])
    same = rng.random() < 0.6
    lights = []
    for p in pos:
        c = C if same else rng.choice([45, 60, 90, 120, 180])
        g = rng.randint(max(1, c // 5), c - 5)
        off = rng.randint(0, 3599) if rng.random() < 0.3 else rng.randint(0, c - 1)
        lights.append({'pos': p, 'C': c, 'G': g, 'off': off})
    dest = pos[-1] + rng.randint(0, 800)
    v10 = rng.choice([rng.randint(30, 800), rng.randint(3, 80) * 10])
    lim = rng.randint(max(5, v10 // 10), 80) if rng.random() < 0.8 else rng.randint(5, 80)
    return {'v10': v10, 'limit': lim, 'dep': rng.randint(0, 3599), 'loss': rng.randint(0, 10), 'dest': dest, 'lights': lights}


def to_state(s):
    v = s['v10']
    return {'name': '对拍', 'v': (str(v // 10) if v % 10 == 0 else '%d.%d' % (v // 10, v % 10)), 'limit': str(s['limit']), 'dep': str(s['dep']),
            'loss': str(s['loss']), 'dest': str(s['dest']),
            'lights': [{k: str(l[k]) for k in ('pos', 'C', 'G', 'off')} for l in s['lights']]}


if __name__ == '__main__':
    import os
    rng = random.Random(20261118)
    cases = []
    st = {'nonstop_now': 0, 'stops3plus': 0, 'has_early': 0, 'has_later': 0, 'no_band': 0}
    while len(cases) < 300:
        s = gen(rng); e = solve(s)
        cases.append({'state': to_state(s), 'expect': e})
        st['nonstop_now'] += e['stops'] == 0; st['stops3plus'] += e['stops'] >= 3
        st['has_early'] += e['early'] is not None; st['has_later'] += e['later'] is not None; st['no_band'] += not e['nonstop']
    out = os.path.join(os.path.dirname(__file__), 'ref.json')
    json.dump({'stats': st, 'cases': cases}, open(out, 'w'), ensure_ascii=False)
    print(json.dumps(st, ensure_ascii=False))
