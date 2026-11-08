// 輪郭までの距離を格子で求める処理の検証。実行: node --test tests/edge-index.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EdgeIndex } from '../src/renderer/edge-index.ts';

// すべての辺と比べる素直な求め方 (EdgeIndex を入れる前の buildFill と同じ式)
function bruteKm(segments: [number, number, number, number][], lon: number, lat: number): number {
  const k = Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (const [x1, y1, x2, y2] of segments) {
    const ax = (x1 - lon) * k;
    const ay = y1 - lat;
    const bx = (x2 - lon) * k;
    const by = y2 - lat;
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1e-12)));
    best = Math.min(best, Math.hypot(ax + dx * t, ay + dy * t));
  }
  return best * 111.2;
}

// ぎざぎざの輪 (中心 (lon0, lat0)、半径 radius 度)
function ring(lon0: number, lat0: number, radius: number, count: number): [number, number, number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = radius * (1 + 0.3 * Math.sin(a * 7) + 0.1 * Math.sin(a * 31));
    points.push([lon0 + r * Math.cos(a), lat0 + r * Math.sin(a)]);
  }
  return points.map(([x, y], i) => [x, y, points[(i + 1) % count][0], points[(i + 1) % count][1]]);
}

test('上限より近い距離は、すべての辺と比べた値と同じ', () => {
  for (const [lon0, lat0] of [[20, 0], [100, 65], [-60, -40]]) {
    const segments = ring(lon0, lat0, 8, 900);
    const index = new EdgeIndex(segments);
    for (let i = 0; i < 300; i++) {
      const lon = lon0 + (Math.sin(i * 12.9898) * 0.5) * 20;
      const lat = lat0 + (Math.sin(i * 78.233) * 0.5) * 12;
      const expected = Math.min(bruteKm(segments, lon, lat), 600);
      assert.ok(Math.abs(index.distance(lon, lat) - expected) < 1e-6, `${lon},${lat}`);
    }
  }
});

test('上限より遠い点は上限の距離になる', () => {
  const index = new EdgeIndex([[0, 0, 1, 0]], 0.5, 600);
  assert.equal(index.distance(0.5, 20), 600);
  assert.ok(Math.abs(index.distance(0.5, 1) - 111.2) < 1e-6);
});

test('辺がなければ上限の距離になる', () => {
  assert.equal(new EdgeIndex([]).distance(10, 10), 600);
});
