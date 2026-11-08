// 山脈、砂漠、平野などの範囲と、山の頂の詳しい情報を、Wikidata と日本語版 Wikipedia から集めて JSON にする。
// 実行: node scripts/build-terrain-info.mjs
// 入力は src/renderer/data/regions-10m.json と points-10m.json (地形の名前に出すもの。w は Natural Earth に入っている Wikidata の ID)。
// 出力は src/renderer/data/region-info.json と peak-info.json (Wikidata の ID がキー。同じ名前の別の山脈があるので名前は使わない)。
// Natural Earth の ID が別のものを指していることがあるので、Wikidata の座標が地図の位置から離れていたら使わない。
// 数値と国は Wikidata (CC0)、説明は Wikipedia (CC BY-SA 4.0) の記事の冒頭
import fs from 'node:fs';
import path from 'node:path';
import { fetchArticles, fetchEntities, itemIds, label, labelJa, quantity, round, summarize, UNIT } from './wiki.mjs';

const repoRoot = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const dataDir = path.join(repoRoot, 'src', 'renderer', 'data');

// 地形の名前に出す範囲の種類 (src/renderer/terrain-labels.ts の REGION_GROUPS と同じ)
const REGION_KINDS = new Set(['Desert', 'Range/mtn', 'Foothills', 'Gorge', 'Valley', 'Plateau', 'Plain', 'Basin', 'Lowland', 'Delta', 'Wetlands', 'Depression', 'Tundra']);
const REGION_MAX_OUTSIDE_KM = 200; // 範囲は大きく、代表の座標が形の外寄りのこともあるので広めに許す
const PEAK_MAX_KM = 50; // Natural Earth の山の位置は数十 km ずれていることがある。別の山を指す ID は数百 km 以上離れる

const METRES = { [UNIT.metre]: 1, [UNIT.foot]: 0.3048 };

function coordinate(entity) {
  const snak = entity.claims?.P625?.[0]?.mainsnak;
  return snak?.snaktype === 'value' ? snak.datavalue.value : null;
}

// 座標から、形を囲む四角形までの距離 (km。中なら 0)
function outsideKm({ latitude, longitude }, polygons) {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const ring of polygons.flat()) {
    for (let i = 0; i + 1 < ring.length; i += 2) {
      west = Math.min(west, ring[i]);
      east = Math.max(east, ring[i]);
      south = Math.min(south, ring[i + 1]);
      north = Math.max(north, ring[i + 1]);
    }
  }
  const dLon = Math.max(west - longitude, 0, longitude - east) * Math.cos((latitude * Math.PI) / 180);
  const dLat = Math.max(south - latitude, 0, latitude - north);
  return Math.hypot(dLon, dLat) * 111.2;
}

function distanceKm({ latitude, longitude }, lon, lat) {
  const toRad = Math.PI / 180;
  const a =
    Math.sin(((latitude - lat) * toRad) / 2) ** 2 +
    Math.cos(lat * toRad) * Math.cos(latitude * toRad) * Math.sin(((longitude - lon) * toRad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// 年だけ (時刻の値 +1953-05-29T00:00:00Z から)
function year(entity, property) {
  const snak = entity.claims?.[property]?.find((claim) => claim.rank !== 'deprecated')?.mainsnak;
  if (snak?.snaktype !== 'value') return null;
  const match = /^([+-]\d+)-/.exec(snak.datavalue.value.time);
  return match ? Number(match[1]) : null;
}

const regions = JSON.parse(fs.readFileSync(path.join(dataDir, 'regions-10m.json'), 'utf8')).filter(
  (region) => REGION_KINDS.has(region.c) && region.w,
);
const peaks = JSON.parse(fs.readFileSync(path.join(dataDir, 'points-10m.json'), 'utf8')).filter(
  (point) => point.c === 'mountain' && point.w,
);

const entities = await fetchEntities([...regions.map((region) => region.w), ...peaks.map((peak) => peak.w)]);
const relatedIds = [];
for (const entity of entities.values()) {
  relatedIds.push(...itemIds(entity, 'P17'), ...itemIds(entity, 'P610'), ...itemIds(entity, 'P4552'));
}
// 最高地点は標高も要るので claims も取る
const related = await fetchEntities(relatedIds, 'claims|labels');
const wikiTitles = [...new Set([...entities.values()].map((entity) => entity.sitelinks?.jawiki?.title).filter(Boolean))];
const articles = await fetchArticles(wikiTitles);

const problems = [];
function summaryOf(entity, record) {
  const title = entity.sitelinks?.jawiki?.title;
  const summary = title ? summarize(articles.get(title)?.extract ?? '') : '';
  if (summary) record.summary = summary;
  if (title) record.wiki = title;
}

const regionOut = {
  _note:
    '山脈、砂漠、平野などの範囲の詳しい情報。scripts/build-terrain-info.mjs で作る。キーは Wikidata の ID (regions-10m.json の w)。' +
    '数値と国は Wikidata (CC0)、summary は日本語版 Wikipedia (CC BY-SA 4.0) の記事の冒頭を短くしたもの',
};
for (const region of regions) {
  const entity = entities.get(region.w);
  if (!entity || regionOut[region.w]) continue;
  const at = coordinate(entity);
  const outside = at ? outsideKm(at, region.p) : 0;
  if (outside > REGION_MAX_OUTSIDE_KM) {
    problems.push(`${region.ja || region.n}: Wikidata の座標が範囲から ${Math.round(outside)}km 離れているので使わない (${region.w})`);
    continue;
  }
  const record = { qid: region.w };
  const area = quantity(entity, 'P2046', { [UNIT.km2]: 1 });
  const length = quantity(entity, 'P2043', { [UNIT.km]: 1, [UNIT.metre]: 0.001, [UNIT.mile]: 1.609344 });
  if (area !== null) record.area_km2 = round(area, area >= 10000 ? 1000 : 10);
  if (length !== null) record.length_km = round(length, 1);
  const highestId = itemIds(entity, 'P610')[0];
  const highest = highestId ? related.get(highestId) : null;
  const highestName = labelJa(highest);
  if (highestName) {
    record.highest = highestName;
    const metres = quantity(highest, 'P2044', METRES);
    if (metres !== null) record.highest_m = round(metres, 1);
  }
  const countries = [...new Set(itemIds(entity, 'P17').map((id) => label(related.get(id))).filter(Boolean))];
  if (countries.length) record.countries = countries;
  summaryOf(entity, record);
  if (Object.keys(record).length > 1) regionOut[region.w] = record;
}

const peakOut = {
  _note:
    '山の頂の詳しい情報。scripts/build-terrain-info.mjs で作る。キーは Wikidata の ID (points-10m.json の w)。' +
    '数値と国は Wikidata (CC0)、summary は日本語版 Wikipedia (CC BY-SA 4.0) の記事の冒頭を短くしたもの',
};
for (const peak of peaks) {
  const entity = entities.get(peak.w);
  if (!entity || peakOut[peak.w]) continue;
  const at = coordinate(entity);
  const distance = at ? distanceKm(at, peak.x, peak.y) : 0;
  if (distance > PEAK_MAX_KM) {
    problems.push(`${peak.ja || peak.n}: Wikidata の座標が ${Math.round(distance)}km 離れているので使わない (${peak.w})`);
    continue;
  }
  const record = { qid: peak.w };
  const elevation = quantity(entity, 'P2044', METRES);
  const prominence = quantity(entity, 'P2660', METRES);
  if (elevation !== null) record.elevation_m = round(elevation, 1);
  if (prominence !== null) record.prominence_m = round(prominence, 1);
  const range = itemIds(entity, 'P4552').map((id) => labelJa(related.get(id))).find(Boolean);
  if (range) record.range = range;
  const countries = [...new Set(itemIds(entity, 'P17').map((id) => label(related.get(id))).filter(Boolean))];
  if (countries.length) record.countries = countries;
  const ascent = year(entity, 'P1619');
  if (ascent !== null) record.first_ascent = ascent;
  summaryOf(entity, record);
  if (Object.keys(record).length > 1) peakOut[peak.w] = record;
}

for (const [name, out, total] of [
  ['region-info.json', regionOut, regions.length],
  ['peak-info.json', peakOut, peaks.length],
]) {
  const file = path.join(dataDir, name);
  fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${Object.keys(out).length - 1} 件 (ID のあるもの ${total}) を ${path.relative(repoRoot, file)} に書いた`);
}
for (const problem of problems) console.log(`  要確認: ${problem}`);
