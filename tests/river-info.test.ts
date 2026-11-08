// 川の詳しい情報のデータと、札に出す文の検証。実行: node --test tests/river-info.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { riverFacts, type RiverInfo } from '../src/renderer/info-card.ts';

const names = JSON.parse(fs.readFileSync('src/renderer/data/river-names-ja.json', 'utf8')) as Record<string, string>;
const info = JSON.parse(fs.readFileSync('src/renderer/data/river-info.json', 'utf8')) as Record<string, RiverInfo>;

test('名前を出す川はすべて情報がある', () => {
  const missing = [...new Set(Object.entries(names).filter(([key]) => !key.startsWith('_')).map(([, ja]) => ja))].filter(
    (ja) => !info[ja],
  );
  assert.deepEqual(missing, []);
});

test('情報は Wikidata の ID を持ち、説明は短い', () => {
  for (const [name, record] of Object.entries(info)) {
    if (name.startsWith('_')) continue;
    assert.match(record.qid, /^Q\d+$/, name);
    if (record.summary) assert.ok(record.summary.length <= 140, `${name}: ${record.summary.length} 字`);
  }
});

test('主な川の数値が大きく外れていない', () => {
  assert.ok(Math.abs((info['ナイル川'].length_km ?? 0) - 6650) <= 100);
  assert.ok(Math.abs((info['ドナウ川'].length_km ?? 0) - 2850) <= 50);
  assert.equal(info['ドナウ川'].mouth, '黒海');
});

test('札の文は単位と区切りを付け、多い国はまとめる', () => {
  const facts = riverFacts({
    qid: 'Q1',
    length_km: 2850,
    area_km2: 801000,
    discharge_m3s: 5430,
    mouth: '黒海',
    countries: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  });
  assert.deepEqual(facts, [
    ['長さ', '2,850 km'],
    ['流域面積', '80.1万 km²'],
    ['平均流量', '5,430 m³/s'],
    ['注ぐ先', '黒海'],
    ['流れる国', 'A、B、C、D、E ほか2か国'],
  ]);
  assert.deepEqual(riverFacts({ qid: 'Q2', area_km2: 7050000 }), [['流域面積', '705万 km²']]);
  assert.deepEqual(riverFacts({ qid: 'Q3', area_km2: 9000 }), [['流域面積', '9,000 km²']]);
});
