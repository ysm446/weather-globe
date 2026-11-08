// 都市と国の詳しい情報を、Wikidata と日本語版 Wikipedia から集めて JSON にする。
// 実行: node scripts/build-place-info.mjs
// 都市: src/renderer/cities.ts の MAP_CITIES (地球の上に名前を出す都市。アプリで書いたもので Wikidata の ID はない)。
//   名前を日本語版 Wikipedia の記事名として引き (なければ「名前+市」)、記事から ID をたどる。Wikidata の座標が都市の位置から
//   MAX_CITY_KM より離れていたら別の場所とみなして使わない。記事名が別のもの (曖昧さ回避など) になる都市は CITY_TITLES で決める。
//   出力は src/renderer/data/city-info.json (都市の名前がキー)。
// 国: src/renderer/data/countries-10m.json (w は Natural Earth に入っている Wikidata の ID)。出力は country-info.json (ADM0_A3 がキー)。
// 数値と国は Wikidata (CC0)、説明は Wikipedia (CC BY-SA 4.0) の記事の冒頭
import fs from 'node:fs';
import path from 'node:path';
import { MAP_CITIES } from '../src/renderer/cities.ts';
import { fetchArticles, fetchEntities, itemIds, label, labelJa, latestQuantity, quantity, round, summarize, UNIT } from './wiki.mjs';

const repoRoot = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const dataDir = path.join(repoRoot, 'src', 'renderer', 'data');

const MAX_CITY_KM = 40;
// 都市の名前 → 日本語版 Wikipedia の記事名。名前のままでは曖昧さ回避や別の場所になるもの
const CITY_TITLES = {
  大阪: '大阪市', // 「大阪」は地域としての大阪の記事
  ラサ: 'ラサ市', // 「ラサ」は地名の記事 (人口がない)
  バンクーバー: 'バンクーバー (ブリティッシュコロンビア州)',
  オークランド: 'オークランド (ニュージーランド)',
  サンティアゴ: 'サンティアゴ (チリ)',
  パース: 'パース (西オーストラリア州)',
  ダーウィン: 'ダーウィン (ノーザンテリトリー)',
  ハイデラバード: 'ハイデラバード (インド)',
  フェニックス: 'フェニックス (アリゾナ州)',
  グアダラハラ: 'グアダラハラ (メキシコ)',
  サンフアン: 'サンフアン (プエルトリコ)',
};

const METRES = { [UNIT.metre]: 1, [UNIT.foot]: 0.3048 };
const PEOPLE = { [UNIT.one]: 1 };

function distanceKm(entity, lon, lat) {
  const snak = entity.claims?.P625?.[0]?.mainsnak;
  if (snak?.snaktype !== 'value') return null;
  const { latitude, longitude } = snak.datavalue.value;
  const toRad = Math.PI / 180;
  const a =
    Math.sin(((latitude - lat) * toRad) / 2) ** 2 +
    Math.cos(lat * toRad) * Math.cos(latitude * toRad) * Math.sin(((longitude - lon) * toRad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const problems = [];

// ---------------------------------------------------------------- 都市

// 候補の記事名を順に試し、座標が合う最初のものを使う
const candidates = new Map(MAP_CITIES.map((city) => [city.name, CITY_TITLES[city.name] ? [CITY_TITLES[city.name]] : [city.name, `${city.name}市`]]));
const cityArticles = await fetchArticles([...new Set([...candidates.values()].flat())]);
const candidateQids = [...cityArticles.values()].filter((article) => article.qid && !article.disambiguation).map((article) => article.qid);
const cityEntities = await fetchEntities(candidateQids);

const cityOf = new Map(); // 都市の名前 → { entity, article }
for (const city of MAP_CITIES) {
  const tried = [];
  for (const title of candidates.get(city.name)) {
    const article = cityArticles.get(title);
    if (!article?.qid || article.disambiguation) {
      tried.push(`${title}: ${article ? '曖昧さ回避' : '記事なし'}`);
      continue;
    }
    const entity = cityEntities.get(article.qid);
    const distance = entity ? distanceKm(entity, city.lon, city.lat) : null;
    if (entity && distance !== null && distance <= MAX_CITY_KM) {
      cityOf.set(city.name, { entity, article });
      break;
    }
    tried.push(`${title} → ${article.title} (${article.qid}): ${distance === null ? '座標なし' : `${Math.round(distance)}km`}`);
  }
  if (!cityOf.has(city.name)) problems.push(`都市 ${city.name}: 使える記事がない (${tried.join('、')})`);
}

// ---------------------------------------------------------------- 国

const countries = JSON.parse(fs.readFileSync(path.join(dataDir, 'countries-10m.json'), 'utf8')).filter((country) => country.w);
const countryEntities = await fetchEntities(countries.map((country) => country.w));
const countryTitles = [...countryEntities.values()].map((entity) => entity.sitelinks?.jawiki?.title).filter(Boolean);
const countryArticles = await fetchArticles(countryTitles);

// ---------------------------------------------------------------- 関係するもの (国、首都、言語、通貨) の名前

const relatedIds = [];
for (const { entity } of cityOf.values()) relatedIds.push(...itemIds(entity, 'P17'));
for (const entity of countryEntities.values()) {
  relatedIds.push(...itemIds(entity, 'P36'), ...itemIds(entity, 'P37'), ...itemIds(entity, 'P38'));
}
const related = await fetchEntities(relatedIds, 'labels');
const namesOf = (entity, property, toName, limit = Infinity) =>
  [...new Set(itemIds(entity, property).map((id) => toName(related.get(id))).filter(Boolean))].slice(0, limit);

// 国全体の公用語 (P37)。州や地域だけの公用語 (適用される地域 P1001、適用される部分 P518 の注記付き。アメリカのハワイ語など) は除く
function nationalLanguages(entity) {
  const ids = (entity.claims?.P37 ?? [])
    .filter((claim) => claim.rank !== 'deprecated' && claim.mainsnak.snaktype === 'value' && !claim.qualifiers?.P1001 && !claim.qualifiers?.P518)
    .map((claim) => claim.mainsnak.datavalue.value.id);
  return [...new Set(ids.map((id) => labelJa(related.get(id))).filter(Boolean))].slice(0, 3);
}

function addPopulation(record, entity) {
  const population = latestQuantity(entity, 'P1082', PEOPLE);
  if (!population) return;
  record.population = Math.round(population.value);
  if (population.year) record.population_year = population.year;
}

function addSummary(record, article, title) {
  const summary = article ? summarize(article.extract) : '';
  if (summary) record.summary = summary;
  if (title) record.wiki = title;
}

const cityOut = {
  _note:
    '都市の詳しい情報。scripts/build-place-info.mjs で作る。キーは cities.ts の都市の名前。' +
    '数値と国は Wikidata (CC0)、summary は日本語版 Wikipedia (CC BY-SA 4.0) の記事の冒頭を短くしたもの',
};
for (const city of MAP_CITIES) {
  const found = cityOf.get(city.name);
  if (!found) continue;
  const { entity, article } = found;
  const record = { qid: entity.id };
  const countryNames = namesOf(entity, 'P17', label, 1);
  if (countryNames.length) record.country = countryNames[0];
  addPopulation(record, entity);
  const area = quantity(entity, 'P2046', { [UNIT.km2]: 1, [UNIT.hectare]: 0.01 });
  if (area !== null) record.area_km2 = area >= 100 ? round(area, 1) : round(area, 0.1);
  const elevation = quantity(entity, 'P2044', METRES);
  if (elevation !== null) record.elevation_m = round(elevation, 1);
  addSummary(record, article, article.title);
  cityOut[city.name] = record;
}

const countryOut = {
  _note:
    '国の詳しい情報。scripts/build-place-info.mjs で作る。キーは countries-10m.json の a3 (ADM0_A3)。' +
    '数値、首都、言語、通貨は Wikidata (CC0)、summary は日本語版 Wikipedia (CC BY-SA 4.0) の記事の冒頭を短くしたもの',
};
for (const country of countries) {
  const entity = countryEntities.get(country.w);
  if (!entity) continue;
  const record = { qid: country.w };
  const capital = namesOf(entity, 'P36', labelJa, 1);
  if (capital.length) record.capital = capital[0];
  addPopulation(record, entity);
  const area = quantity(entity, 'P2046', { [UNIT.km2]: 1 });
  if (area !== null) record.area_km2 = area >= 1000 ? round(area, 100) : round(area, 1);
  const languages = nationalLanguages(entity);
  if (languages.length) record.languages = languages;
  const currency = namesOf(entity, 'P38', labelJa, 1);
  if (currency.length) record.currency = currency[0];
  const title = entity.sitelinks?.jawiki?.title ?? null;
  addSummary(record, title ? countryArticles.get(title) : null, title);
  if (Object.keys(record).length > 1) countryOut[country.a3] = record;
}

for (const [name, out, total] of [
  ['city-info.json', cityOut, MAP_CITIES.length],
  ['country-info.json', countryOut, countries.length],
]) {
  const file = path.join(dataDir, name);
  fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${Object.keys(out).length - 1}/${total} 件を ${path.relative(repoRoot, file)} に書いた`);
}
for (const problem of problems) console.log(`  要確認: ${problem}`);
