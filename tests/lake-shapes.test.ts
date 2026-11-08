// 湖の形のデータの検証。実行: node --test tests/lake-shapes.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const lakes = JSON.parse(fs.readFileSync('src/renderer/data/lakes-10m.json', 'utf8')) as { ja: string; x: number; y: number }[];
const shapes = JSON.parse(fs.readFileSync('src/renderer/data/lake-shapes-10m.json', 'utf8')) as Record<string, number[][][]>;

test('名前を出す湖はすべて形がある', () => {
  assert.deepEqual(
    lakes.filter((lake) => !shapes[lake.ja]?.length).map((lake) => lake.ja),
    [],
  );
});

test('形の輪は 3 点以上で、経度と緯度が範囲に収まる', () => {
  for (const [name, polygons] of Object.entries(shapes)) {
    for (const ring of polygons.flat()) {
      assert.ok(ring.length >= 8 && ring.length % 2 === 0, name);
      for (let i = 0; i < ring.length; i += 2) {
        assert.ok(Math.abs(ring[i]) <= 180 && Math.abs(ring[i + 1]) <= 90, name);
      }
    }
  }
});

test('名前を置く点は、その湖の形の範囲の近くにある', () => {
  for (const lake of lakes) {
    const coords = shapes[lake.ja].flat(2);
    const lons = coords.filter((_, i) => i % 2 === 0);
    const lats = coords.filter((_, i) => i % 2 === 1);
    const margin = 0.5;
    assert.ok(lake.x >= Math.min(...lons) - margin && lake.x <= Math.max(...lons) + margin, lake.ja);
    assert.ok(lake.y >= Math.min(...lats) - margin && lake.y <= Math.max(...lats) + margin, lake.ja);
  }
});
