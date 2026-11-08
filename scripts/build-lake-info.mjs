// 湖の詳しい情報 (面積、標高、最大水深、貯水量、国、流れ込む川と流れ出る川、短い説明) を、Wikidata と日本語版 Wikipedia から集めて JSON にする。
// 実行: node scripts/build-lake-info.mjs
// 入力は src/renderer/data/lakes-10m.json (名前を出す湖。w は Natural Earth に入っている Wikidata の ID)。
// 出力は src/renderer/data/lake-info.json (日本語名がキー)。
// ID のない湖は、日本語名を日本語版 Wikipedia の記事名として引き、記事から ID をたどる。どちらの ID でも、Wikidata の座標が
// 地図の湖の形 (lake-shapes-10m.json) から離れていたら別の湖とみなして使わない。数値と国は Wikidata (CC0)、説明は Wikipedia (CC BY-SA 4.0) の記事の冒頭
import fs from 'node:fs';
import path from 'node:path';
import { fetchArticles, fetchEntities, itemIds, label, labelJa, quantity, round, summarize, UNIT } from './wiki.mjs';

const repoRoot = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const dataDir = path.join(repoRoot, 'src', 'renderer', 'data');
const outFile = path.join(dataDir, 'lake-info.json');

// 日本語名 → Wikidata の ID。Natural Earth の ID が違うもの、記事名から引けないもの
const QID_OVERRIDES = {};
// 座標が湖の形から離れていても同じ湖と確かめたもの。Wikidata の座標がダムの位置で、地図の形が湖の一部だけのもの
// (クラスノヤルスク貯水池、ルーズベルト湖)、Wikidata の座標が誤っているもの (ハバニヤー湖。実際は北緯 33.2〜33.4 度)
const SAME_LAKE = new Set(['クラスノヤルスク貯水池', 'ルーズベルト湖', 'ハバニヤー湖']);
const MAX_RIVERS = 4; // 流れ込む川は多いことがあるので、これだけ載せる

const MAX_OUTSIDE_KM = 30; // Wikidata の座標が、地図の湖の形を囲む四角形からこれより離れていたら、別の湖とみなす

// Wikidata の座標 (P625) から、地図の湖の形を囲む四角形までの距離 (km。中なら 0)。座標がなければ null。
// 細長い貯水池は代表点が名前の位置から遠いことがあるので、名前の位置ではなく形の範囲と比べる
function outsideKm(entity, polygons) {
  const snak = entity.claims?.P625?.[0]?.mainsnak;
  if (snak?.snaktype !== 'value') return null;
  const { latitude, longitude } = snak.datavalue.value;
  const coords = polygons.flat(2);
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (let i = 0; i + 1 < coords.length; i += 2) {
    west = Math.min(west, coords[i]);
    east = Math.max(east, coords[i]);
    south = Math.min(south, coords[i + 1]);
    north = Math.max(north, coords[i + 1]);
  }
  const dLon = Math.max(west - longitude, 0, longitude - east) * Math.cos((latitude * Math.PI) / 180);
  const dLat = Math.max(south - latitude, 0, latitude - north);
  return Math.hypot(dLon, dLat) * 111.2;
}

const lakes = JSON.parse(fs.readFileSync(path.join(dataDir, 'lakes-10m.json'), 'utf8'));
const shapes = JSON.parse(fs.readFileSync(path.join(dataDir, 'lake-shapes-10m.json'), 'utf8'));
const problems = [];

// ID のない湖は記事名から引く
const missing = lakes.filter((lake) => !lake.w && !QID_OVERRIDES[lake.ja]);
const titleArticles = await fetchArticles(missing.map((lake) => lake.ja));
const qidOf = new Map(); // 日本語名 → { qid, fromTitle }
for (const lake of lakes) {
  if (QID_OVERRIDES[lake.ja]) qidOf.set(lake.ja, { qid: QID_OVERRIDES[lake.ja], fromTitle: false });
  else if (lake.w) qidOf.set(lake.ja, { qid: lake.w, fromTitle: false });
  else {
    const article = titleArticles.get(lake.ja);
    if (article?.qid && !article.disambiguation) qidOf.set(lake.ja, { qid: article.qid, fromTitle: true });
  }
}

const entities = await fetchEntities([...qidOf.values()].map(({ qid }) => qid));
const relatedIds = [];
for (const entity of entities.values()) {
  relatedIds.push(...itemIds(entity, 'P17'), ...itemIds(entity, 'P200'), ...itemIds(entity, 'P201'));
}
const related = await fetchEntities(relatedIds, 'labels');

// 説明は Wikidata の日本語版の記事から取る (記事名で引いた湖は取得済み)
const wikiTitles = [];
for (const entity of entities.values()) {
  const title = entity.sitelinks?.jawiki?.title;
  if (title) wikiTitles.push(title);
}
const articles = await fetchArticles([...new Set(wikiTitles)]);

const out = {
  _note:
    '湖の詳しい情報。scripts/build-lake-info.mjs で作る。キーは lakes-10m.json の日本語名。' +
    '数値と国、川は Wikidata (CC0)、summary は日本語版 Wikipedia (CC BY-SA 4.0) の記事の冒頭を短くしたもの',
};
let noData = 0;
for (const lake of lakes) {
  const found = qidOf.get(lake.ja);
  const entity = found && entities.get(found.qid);
  if (!entity) {
    noData++;
    continue;
  }
  // Natural Earth の ID が別の湖を指していることもある (トラウト湖、グランド湖など) ので、離れていたらどちらも使わない
  const outside = outsideKm(entity, shapes[lake.ja]);
  if (outside !== null && outside > MAX_OUTSIDE_KM && !SAME_LAKE.has(lake.ja)) {
    problems.push(`${lake.ja}: Wikidata の座標が湖の形から ${Math.round(outside)}km 離れているので使わない (${found.qid}${found.fromTitle ? '、記事名から' : ''})`);
    noData++;
    continue;
  }
  const area = quantity(entity, 'P2046', { [UNIT.km2]: 1, [UNIT.hectare]: 0.01 });
  const elevation = quantity(entity, 'P2044', { [UNIT.metre]: 1, [UNIT.foot]: 0.3048 });
  const depth = quantity(entity, 'P4511', { [UNIT.metre]: 1, [UNIT.foot]: 0.3048 });
  const volume = quantity(entity, 'P2234', { [UNIT.km3]: 1, [UNIT.m3]: 1e-9 });
  const names = (property, toName, limit = Infinity) =>
    [...new Set(itemIds(entity, property).map((id) => toName(related.get(id))).filter(Boolean))].slice(0, limit);
  const countries = names('P17', label);
  // 川は日本語名のあるものだけ (小さな川は英語名しかないことが多い)
  const inflows = names('P200', labelJa, MAX_RIVERS);
  const outflows = names('P201', labelJa);
  const record = { qid: found.qid };
  if (area !== null) record.area_km2 = area >= 100 ? round(area, 1) : round(area, 0.1);
  if (elevation !== null) record.elevation_m = round(elevation, 1);
  if (depth !== null) record.depth_m = round(depth, 1);
  if (volume !== null) record.volume_km3 = volume >= 10 ? round(volume, 1) : round(volume, 0.01);
  if (countries.length) record.countries = countries;
  if (inflows.length) record.inflows = inflows;
  if (outflows.length) record.outflows = outflows;
  const wikiTitle = entity.sitelinks?.jawiki?.title ?? null;
  const article = wikiTitle ? articles.get(wikiTitle) : null;
  const summary = article ? summarize(article.extract) : '';
  if (summary) record.summary = summary;
  if (wikiTitle) record.wiki = wikiTitle;
  // 何も分からない湖は載せない (札を出さない)
  if (Object.keys(record).length > 1) out[lake.ja] = record;
  else noData++;
}

fs.writeFileSync(outFile, `${JSON.stringify(out, null, 1)}\n`);
const count = Object.keys(out).length - 1;
console.log(`${count}/${lakes.length} 件を ${path.relative(repoRoot, outFile)} に書いた (情報のない湖 ${noData})`);
for (const problem of problems) console.log(`  要確認: ${problem}`);
