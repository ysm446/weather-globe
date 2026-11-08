// 都市と国の詳しい情報のデータと、札に出す文の検証。実行: node --test tests/place-info.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { MAP_CITIES } from '../src/renderer/cities.ts';
import type { CountryRecord } from '../src/renderer/highlight-data.ts';
import { cityFacts, countryFacts, type CityInfo, type CountryInfo } from '../src/renderer/info-card.ts';

const cityInfo = JSON.parse(fs.readFileSync('src/renderer/data/city-info.json', 'utf8')) as Record<string, CityInfo>;
const countryInfo = JSON.parse(fs.readFileSync('src/renderer/data/country-info.json', 'utf8')) as Record<string, CountryInfo>;
const countries = JSON.parse(fs.readFileSync('src/renderer/data/countries-10m.json', 'utf8')) as CountryRecord[];

test('名前を出す都市はすべて情報があり、人口がある', () => {
  for (const city of MAP_CITIES) {
    const info = cityInfo[city.name];
    assert.ok(info, city.name);
    assert.match(info.qid, /^Q\d+$/, city.name);
    assert.ok((info.population ?? 0) > 0, `${city.name}: 人口がない`);
    if (info.summary) assert.ok(info.summary.length <= 140, city.name);
  }
});

test('地域の名前ではなく都市の記事を使う', () => {
  assert.equal(cityInfo['大阪'].wiki, '大阪市');
  assert.equal(cityInfo['ワシントン'].wiki, 'ワシントンD.C.');
  assert.equal(cityInfo['オークランド'].country, 'ニュージーランド');
});

test('国の情報は国名のデータの a3 で引け、主な国の首都が合う', () => {
  const codes = new Set(countries.map((country) => country.a3));
  const entries = Object.entries(countryInfo).filter(([key]) => !key.startsWith('_'));
  assert.ok(entries.length >= 240, `${entries.length} 件`);
  for (const [a3] of entries) assert.ok(codes.has(a3), a3);
  assert.equal(countryInfo.JPN.capital, '東京都');
  assert.equal(countryInfo.FRA.capital, 'パリ');
});

test('州だけの公用語は国の公用語に出さない', () => {
  // アメリカには国レベルの公用語がなく、Wikidata の公用語はハワイ州のハワイ語など州ごとのもの
  assert.equal(countryInfo.USA.languages, undefined);
  assert.deepEqual(countryInfo.CAN.languages, ['英語', 'フランス語']);
});

test('札の文は人口を万でまとめ、年を添える', () => {
  assert.deepEqual(cityFacts({ qid: 'Q1', country: '日本', population: 2751862, population_year: 2021, area_km2: 223, elevation_m: 20 }), [
    ['国', '日本'],
    ['人口', '275万人 (2021年)'],
    ['面積', '223 km²'],
    ['標高', '20 m'],
  ]);
  assert.deepEqual(
    countryFacts({ qid: 'Q2', capital: 'パリ', population: 68605616, population_year: 2025, area_km2: 643800, languages: ['フランス語'], currency: 'ユーロ' }),
    [
      ['首都', 'パリ'],
      ['人口', '6,861万人 (2025年)'],
      ['面積', '64.4万 km²'],
      ['公用語', 'フランス語'],
      ['通貨', 'ユーロ'],
    ],
  );
  assert.deepEqual(cityFacts({ qid: 'Q3', population: 9000 }), [['人口', '9,000人']]);
});
