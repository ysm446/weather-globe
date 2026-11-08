// 山脈などの範囲と山の頂の詳しい情報のデータと、札に出す文の検証。実行: node --test tests/terrain-info.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import type { PointRecord, RegionRecord } from '../src/renderer/highlight-data.ts';
import { peakFacts, regionFacts, type PeakInfo, type RegionInfo } from '../src/renderer/info-card.ts';

const regions = JSON.parse(fs.readFileSync('src/renderer/data/regions-10m.json', 'utf8')) as RegionRecord[];
const points = JSON.parse(fs.readFileSync('src/renderer/data/points-10m.json', 'utf8')) as PointRecord[];
const regionInfo = JSON.parse(fs.readFileSync('src/renderer/data/region-info.json', 'utf8')) as Record<string, RegionInfo>;
const peakInfo = JSON.parse(fs.readFileSync('src/renderer/data/peak-info.json', 'utf8')) as Record<string, PeakInfo>;
const entries = <T>(data: Record<string, T>): [string, T][] => Object.entries(data).filter(([key]) => !key.startsWith('_'));

test('範囲と山の頂の情報は、地図のデータの Wikidata の ID で引ける', () => {
  const regionIds = new Set(regions.map((region) => region.w));
  const peakIds = new Set(points.map((point) => point.w));
  assert.ok(entries(regionInfo).length >= 300, `範囲 ${entries(regionInfo).length} 件`);
  assert.ok(entries(peakInfo).length >= 300, `山の頂 ${entries(peakInfo).length} 件`);
  for (const [qid, record] of entries(regionInfo)) {
    assert.ok(regionIds.has(qid) && record.qid === qid, qid);
    if (record.summary) assert.ok(record.summary.length <= 140, qid);
  }
  for (const [qid, record] of entries(peakInfo)) {
    assert.ok(peakIds.has(qid) && record.qid === qid, qid);
    if (record.summary) assert.ok(record.summary.length <= 140, qid);
  }
});

test('同じ名前の別の山脈は、別の情報を引く', () => {
  const sierras = regions.filter((region) => region.ja === 'シエラネバダ山脈');
  assert.equal(sierras.length, 2);
  assert.notEqual(sierras[0].w, sierras[1].w);
});

test('エベレストの標高が大きく外れていない', () => {
  const everest = points.find((point) => point.n === 'Mount Everest');
  assert.ok(everest?.w);
  assert.ok(Math.abs((peakInfo[everest.w].elevation_m ?? 0) - 8848) <= 10);
});

test('札の文は種類と単位を付ける', () => {
  assert.deepEqual(
    regionFacts(
      { qid: 'Q1', area_km2: 9200000, length_km: 2400, highest: 'エミクーシ山', highest_m: 3415, countries: ['アルジェリア'] },
      'Desert',
    ),
    [
      ['種類', '砂漠'],
      ['面積', '920万 km²'],
      ['長さ', '2,400 km'],
      ['最高地点', 'エミクーシ山 (3,415 m)'],
      ['国', 'アルジェリア'],
    ],
  );
  assert.deepEqual(
    peakFacts({ qid: 'Q2', elevation_m: 8848, prominence_m: 8848, range: 'ヒマラヤ山脈', countries: ['ネパール', '中華人民共和国'], first_ascent: 1953 }),
    [
      ['標高', '8,848 m'],
      ['独立標高', '8,848 m'],
      ['山脈', 'ヒマラヤ山脈'],
      ['国', 'ネパール、中華人民共和国'],
      ['初登頂', '1953年'],
    ],
  );
});
