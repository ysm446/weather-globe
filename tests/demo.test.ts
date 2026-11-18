// デモの場面と行き先の検証。実行: node --test tests/demo.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CITIES, demoArrival, sunElevation } from '../src/renderer/demo.ts';
import { cruiseCoverage, pickDemoLeg, type DemoWay } from '../src/renderer/demo-leg.ts';
import { separationDegrees } from '../src/renderer/math.ts';

test('太陽の高度は真下で 90 度、裏側で -90 度', () => {
  assert.ok(Math.abs(sunElevation({ lat: 10, lon: 20 }, { lat: 10, lon: 20 }) - 90) < 1e-6);
  assert.ok(Math.abs(sunElevation({ lat: -10, lon: -160 }, { lat: 10, lon: 20 }) + 90) < 1e-6);
});

const PARIS = { lat: 48.9, lon: 2.4 };
const SUNS = [-180, -135, -90, -45, 0, 45, 90, 135].flatMap((lon) => [-23, 0, 23].map((lat) => ({ lat, lon })));

test('次の都市は、今の太陽で昼か夜の都市から選ぶ (薄明は除く)', () => {
  const sun = { lat: 0, lon: 80 };
  for (let i = 0; i < 100; i++) {
    const elevation = sunElevation(pickDemoLeg(PARIS, sun, [], null).place, sun);
    assert.ok(elevation >= 15 || elevation <= -6, String(elevation));
  }
});

test('どの太陽の位置でも昼と夜の都市が見つかる', () => {
  for (let lon = -180; lon < 180; lon += 15) {
    for (const lat of [-23, 0, 23]) {
      const sun = { lat, lon };
      assert.ok(CITIES.some((place) => sunElevation(place, sun) >= 15), `昼 ${lat},${lon}`);
      assert.ok(CITIES.some((place) => sunElevation(place, sun) <= -6), `夜 ${lat},${lon}`);
    }
  }
});

test('最近行った都市を避ける', () => {
  const sun = { lat: 0, lon: 0 };
  const recent: string[] = [];
  const names: string[] = [];
  let from = PARIS;
  for (let i = 0; i < 40; i++) {
    const { place } = pickDemoLeg(from, sun, recent, null);
    names.push(place.name);
    from = place;
  }
  names.forEach((name, index) => {
    assert.ok(!names.slice(Math.max(0, index - 5), index).includes(name), `${index}: ${name}`);
  });
  assert.equal(recent.length, 5);
});

test('移り方は都市までの角度に合い、巡航は都市の近くを飛ぶ区間だけ', () => {
  const seen = new Set<DemoWay>();
  for (const sun of SUNS) {
    for (const from of CITIES) {
      for (let i = 0; i < 10; i++) {
        const { place, way } = pickDemoLeg(from, sun, [], null);
        const separation = separationDegrees(from, place);
        const label = `${from.name} → ${place.name} ${way} ${separation.toFixed(1)} 度`;
        seen.add(way);
        if (way === 'arc') assert.ok(separation >= 15 && separation <= 70, label);
        else if (way === 'cruise') {
          assert.ok(separation >= 20 && separation <= 45, label);
          assert.ok(cruiseCoverage(from, place) >= 0.5, label);
        } else assert.ok(way === 'globe' && separation >= 70, label);
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['arc', 'cruise', 'globe']);
});

test('ほかの移り方があれば、直前と同じ移り方は選ばない', () => {
  const sun = { lat: 0, lon: 80 };
  for (const last of ['arc', 'cruise', 'globe'] as const) {
    for (let i = 0; i < 50; i++) assert.notEqual(pickDemoLeg(PARIS, sun, [], last).way, last);
  }
});

test('地球ビューにいるときは、そのまま都市へ降りる', () => {
  for (let i = 0; i < 20; i++) assert.equal(pickDemoLeg(null, { lat: 0, lon: 0 }, [], null).way, 'descend');
});

test('都市の近くを飛ぶ割合は、陸の上で大きく、海の上で小さい', () => {
  const coverage = (from: string, to: string): number =>
    cruiseCoverage(CITIES.find((place) => place.name === from)!, CITIES.find((place) => place.name === to)!);
  assert.ok(coverage('パリ', 'イスタンブール') > 0.8);
  assert.ok(coverage('ロサンゼルス', 'ホノルル') < 0.5);
});

test('都市へは進んできた向きのまま着く', () => {
  const tokyo = { lat: 35.7, lon: 139.7 };
  assert.ok(Math.abs(demoArrival({ lat: 35.7, lon: 120 }, tokyo).heading - 90) < 1e-6); // 西から来れば東向き
  assert.ok(Math.abs(Math.abs(demoArrival({ lat: 50, lon: 139.7 }, tokyo).heading) - 180) < 1e-6); // 北から来れば南向き
  assert.ok(Math.abs(demoArrival({ lat: 35.7, lon: -170 }, tokyo).heading + 90) < 1e-6); // 日付変更線の向こうからは西向き
  assert.equal(demoArrival(null, tokyo).heading, 0);
  for (let i = 0; i < 20; i++) {
    const { tilt, distance } = demoArrival(null, tokyo);
    assert.ok(tilt >= 56 && tilt <= 66 && distance >= 0.19 && distance <= 0.25);
  }
});
