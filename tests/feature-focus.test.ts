// 地形の名前をクリックしたときにカメラを寄せる位置を求めるための、点の選び方の検証。実行: node --test tests/feature-focus.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { samplePoints } from '../src/renderer/feature-focus.ts';

test('点は上限の数までに間引き、最初の点を含む', () => {
  const line = Array.from({ length: 2000 }, (_, i) => [i * 0.01, 10]).flat();
  const points = samplePoints([line], 400);
  assert.ok(points.length <= 400 && points.length >= 300, `${points.length}`);
  assert.deepEqual(points[0], { lon: 0, lat: 10 });
});

test('少ない点はそのまま使い、複数の線にまたがって選ぶ', () => {
  assert.deepEqual(samplePoints([[1, 2, 3, 4]]), [{ lon: 1, lat: 2 }, { lon: 3, lat: 4 }]);
  assert.deepEqual(samplePoints([[1, 2], [5, 6]]), [{ lon: 1, lat: 2 }, { lon: 5, lat: 6 }]);
});
