// 湖の詳しい情報のデータと、札に出す文の検証。実行: node --test tests/lake-info.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { lakeFacts, type LakeInfo } from '../src/renderer/info-card.ts';

const lakes = JSON.parse(fs.readFileSync('src/renderer/data/lakes-10m.json', 'utf8')) as { ja: string }[];
const info = JSON.parse(fs.readFileSync('src/renderer/data/lake-info.json', 'utf8')) as Record<string, LakeInfo>;
const entries = Object.entries(info).filter(([name]) => !name.startsWith('_'));

test('情報は名前を出している湖のもので、Wikidata の ID を持ち、説明は短い', () => {
  const names = new Set(lakes.map((lake) => lake.ja));
  assert.ok(entries.length >= 500, `${entries.length} 件`);
  for (const [name, record] of entries) {
    assert.ok(names.has(name), name);
    assert.match(record.qid, /^Q\d+$/, name);
    if (record.summary) assert.ok(record.summary.length <= 140, `${name}: ${record.summary.length} 字`);
  }
});

test('川の名前は日本語だけで、数値に丸めの誤差がない', () => {
  for (const [name, record] of entries) {
    for (const river of [...(record.inflows ?? []), ...(record.outflows ?? [])]) {
      // 日本語名にローマ字が混ざるもの (Daliyot川) はあるが、ローマ字だけの名前は出さない
      assert.doesNotMatch(river, /^[\p{Script=Latin}\s'’.-]+$/u, `${name}: ${river}`);
    }
    for (const value of [record.area_km2, record.volume_km3, record.depth_m, record.elevation_m]) {
      if (value !== undefined) assert.ok(String(value).length < 12, `${name}: ${value}`);
    }
  }
});

test('主な湖の数値が大きく外れていない', () => {
  assert.ok(Math.abs((info['バイカル湖'].depth_m ?? 0) - 1642) <= 20);
  assert.ok((info['死海'].elevation_m ?? 0) < -400);
  assert.deepEqual(info['ヴィクトリア湖'].outflows, ['白ナイル川']);
});

test('座標が合わず別の湖を指していた ID は使わない', () => {
  // Natural Earth の ID がオンタリオ州の別の湖を指していた
  assert.equal(info['トラウト湖'], undefined);
});

test('札の文は単位と区切りを付ける', () => {
  assert.deepEqual(
    lakeFacts({
      qid: 'Q1',
      area_km2: 31722,
      elevation_m: 456,
      depth_m: 1642,
      volume_km3: 23615,
      countries: ['ロシア'],
      inflows: ['セレンガ川', 'バルグジン川'],
      outflows: ['アンガラ川'],
    }),
    [
      ['面積', '3.2万 km²'],
      ['湖面の標高', '456 m'],
      ['最大水深', '1,642 m'],
      ['貯水量', '23,615 km³'],
      ['国', 'ロシア'],
      ['流れ込む川', 'セレンガ川、バルグジン川'],
      ['流れ出る川', 'アンガラ川'],
    ],
  );
  assert.deepEqual(lakeFacts({ qid: 'Q2', elevation_m: -430 }), [['湖面の標高', '-430 m']]);
});
