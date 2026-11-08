// 国の形のデータの検証。実行: node --test tests/country-shapes.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import type { CountryRecord } from '../src/renderer/highlight-data.ts';

const countries = JSON.parse(fs.readFileSync('src/renderer/data/countries-10m.json', 'utf8')) as CountryRecord[];
const shapes = JSON.parse(fs.readFileSync('src/renderer/data/country-shapes-10m.json', 'utf8')) as Record<string, number[][][]>;

test('国名を出す国はすべて形がある (小国も消えない)', () => {
  assert.deepEqual(
    countries.filter((country) => !shapes[country.a3]?.length).map((country) => country.a3),
    [],
  );
  assert.ok(shapes.MCO.length > 0 && shapes.VAT.length > 0);
});

test('形の輪は 3 点以上で、経度と緯度が範囲に収まる', () => {
  for (const [a3, polygons] of Object.entries(shapes)) {
    for (const ring of polygons.flat()) {
      assert.ok(ring.length >= 8 && ring.length % 2 === 0, a3);
      for (let i = 0; i < ring.length; i += 2) {
        assert.ok(Math.abs(ring[i]) <= 180 && Math.abs(ring[i + 1]) <= 90, a3);
      }
    }
  }
});
