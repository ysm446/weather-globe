// デモの場面と行き先の検証。実行: node --test tests/demo.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CITIES, DEMO_SCENES, demoArrival, demoCruiseStart, pickDemoPlace, sunElevation } from '../src/renderer/demo.ts';
import { separationDegrees } from '../src/renderer/math.ts';
import { cruiseRegionView } from '../src/renderer/region-camera.ts';

test('太陽の高度は真下で 90 度、裏側で -90 度', () => {
  assert.ok(Math.abs(sunElevation({ lat: 10, lon: 20 }, { lat: 10, lon: 20 }) - 90) < 1e-6);
  assert.ok(Math.abs(sunElevation({ lat: -10, lon: -160 }, { lat: 10, lon: 20 }) + 90) < 1e-6);
});

test('昼の都市は太陽が高い場所から、夜の都市は太陽が沈んだ場所から選ぶ', () => {
  const sun = { lat: 0, lon: 80 };
  for (let i = 0; i < 50; i++) {
    assert.ok(sunElevation(pickDemoPlace('day', sun, []), sun) >= 15);
    assert.ok(sunElevation(pickDemoPlace('night', sun, []), sun) <= -6);
  }
});

test('都市は昼夜を問わず選ばれる', () => {
  const sun = { lat: 0, lon: 80 };
  const picked = new Set(Array.from({ length: 300 }, () => pickDemoPlace('city', sun, []).name));
  assert.equal(picked.size, CITIES.length);
});

test('最近行った場所を避ける', () => {
  const sun = { lat: 0, lon: 0 };
  const recent: string[] = [];
  const names: string[] = [];
  for (let i = 0; i < 40; i++) names.push(pickDemoPlace('city', sun, recent).name);
  names.forEach((name, index) => {
    assert.ok(!names.slice(Math.max(0, index - 5), index).includes(name), `${index}: ${name}`);
  });
  assert.equal(recent.length, 5);
});

test('すべての場面で雲を出す', () => {
  for (const scene of DEMO_SCENES) assert.equal(scene.mode, 'weather');
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

test('近くに程よく離れた都市があれば、その中から選ぶ', () => {
  const sun = { lat: 0, lon: 0 };
  const near = { lat: 48.9, lon: 2.4 }; // パリ
  for (let i = 0; i < 50; i++) {
    const separation = separationDegrees(pickDemoPlace('city', sun, [], Math.random, near), near);
    assert.ok(separation >= 15 && separation <= 70, String(separation));
  }
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

test('巡航は東へ進み、どの太陽の位置でも昼と夜の境目を越える', () => {
  for (let lon = -180; lon < 180; lon += 30) {
    for (const lat of [-23.4, 0, 23.4]) {
      const sun = { lat, lon };
      for (const near of [null, { lat: 35, lon: 139 }, { lat: -34, lon: -58 }]) {
        for (const kind of ['night', 'day'] as const) {
          const start = demoCruiseStart(kind, sun, near);
          const label = `${kind} 太陽 ${lat},${lon} 出発 ${start.lat.toFixed(1)},${start.lon.toFixed(1)}`;
          assert.ok(start.heading > 0 && start.heading < 180, label);
          assert.ok(Math.abs(sunElevation(start, sun) - (kind === 'night' ? 12 : -20)) < 1e-6, label);
          // 場面の間に進む約 22 度のうちの前半
          const end = cruiseRegionView({ ...start, tilt: 70, distance: 0.2 }, (11 * Math.PI) / 180, 0);
          const change = sunElevation(end, sun) - sunElevation(start, sun);
          assert.ok(kind === 'night' ? change < -5 : change > 5, `${label} 変化 ${change.toFixed(1)}`);
        }
      }
    }
  }
});

test('巡航は今いる場所に近い所から始める', () => {
  const sun = { lat: 10, lon: 40 };
  const near = { lat: 30, lon: 120 };
  const start = demoCruiseStart('night', sun, near);
  assert.ok(separationDegrees(start, near) < 30);
});

test('地球ビューの場面は 1 つだけで、巡航の場面は地域ビュー', () => {
  assert.equal(DEMO_SCENES.filter((scene) => scene.view === 'globe').length, 1);
  for (const scene of DEMO_SCENES) assert.ok(!scene.cruise || scene.view === 'region');
});
