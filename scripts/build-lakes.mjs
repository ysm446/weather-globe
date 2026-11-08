// 地形の名前のラベルに出す湖を、Natural Earth の湖 (ne_10m_lakes.geojson) から小さな JSON に変換する。
// 実行: node scripts/build-lakes.mjs <ne_10m_lakes.geojson>
// 入力は https://github.com/nvkelso/natural-earth-vector の geojson/ から取る。出力は src/renderer/data/lakes-10m.json (名前の位置) と
// lake-shapes-10m.json (湖の形。名前をクリックしたときに輪郭を描く。初めてクリックしたときに読み込むので別のファイルにする)。
// 日本語名は元データの name_ja (Wikidata 由来) を使う。音写や湾・海峡・ダムの名前が混ざっているので、
// 「湖・海・池・沼・潟」で終わるものだけを残す。元データで「湖」が抜けているだけの主な湖は NAME_OVERRIDES で補う
import fs from 'node:fs';
import path from 'node:path';
import { labelPoint } from '../src/renderer/label-point.ts';
import { simplify } from './simplify.mjs';

const [lakesFile] = process.argv.slice(2);
if (!lakesFile) {
  console.error('usage: node scripts/build-lakes.mjs <ne_10m_lakes.geojson>');
  process.exit(1);
}
const repoRoot = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const outFile = path.join(repoRoot, 'src', 'renderer', 'data', 'lakes-10m.json');
const shapesFile = path.join(repoRoot, 'src', 'renderer', 'data', 'lake-shapes-10m.json');

// 元データの英語名 (name) → 日本語名。アプリで補った名前
const NAME_OVERRIDES = {
  'Tonlé Sap': 'トンレサップ湖',
  'Issyk-Kul': 'イシク・クル湖',
};
// 元データの誤り。名前と Wikidata の ID が別の湖の形に付いているもの。元データの ID → 正しい名前と ID。
// Natural Earth の 10m の湖には本物のコモ湖とブラッチャーノ湖の形がなく、その名前がマッジョーレ湖とボルセーナ湖の形に付いている。
// Wikidata の座標がその形の中にあることを確かめた (scripts/build-lake-info.mjs の座標の確認で見つかったもの)
const FEATURE_FIXES = {
  Q15523: { name: 'Lago Maggiore', ja: 'マッジョーレ湖', wikidataid: 'Q14379' }, // 元はコモ湖
  Q896551: { name: 'Lago di Bolsena', ja: 'ボルセーナ湖', wikidataid: 'Q208180' }, // 元はブラッチャーノ湖
};
const JA_SUFFIX = /(湖|海|池|沼|潟)$/;

const round = (value) => Math.round(value * 1000) / 1000;
// 形の点を間引くときの許容のずれ (度)。山脈などの範囲 (build-highlights.mjs) と同じ約 400m。
// 小さな湖はこれでは輪が潰れるので、潰れたら細かい許容で、それでも潰れたら元の点のまま使う
const SHAPE_TOLERANCES = [0.004, 0.001];
const MIN_RING_POINTS = 4; // 閉じる点を含めて。三角形より少ないと面にならない

function simplifyRing(ring) {
  for (const tolerance of SHAPE_TOLERANCES) {
    const simplified = simplify(ring, tolerance);
    if (simplified.length >= MIN_RING_POINTS) return simplified;
  }
  return ring;
}
const flatten = (ring) => ring.flatMap(([lon, lat]) => [round(lon), round(lat)]);

// 輪の面積 (km²)。経度を緯度で縮めた平面で求める
function ringAreaKm2(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const k = Math.cos((((ring[i][1] + ring[j][1]) / 2) * Math.PI) / 180);
    sum += (ring[j][0] - ring[i][0]) * k * (ring[j][1] + ring[i][1]);
  }
  return (Math.abs(sum) / 2) * 111.2 * 111.2;
}

const geo = JSON.parse(fs.readFileSync(lakesFile, 'utf8'));
const byName = new Map();
const partsByName = new Map(); // 日本語名 → 部分 ({ area, polygons, box }) の並び。polygons の輪は平らな [lon, lat, ...]
const PART_GAP_KM = 50; // 一番大きい部分からこれより離れた部分は、同じ名前の別の湖 (各地のトラウト湖など) とみなして描かない

// 部分を囲む四角形
function boxOf(polygons) {
  const box = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
  for (const ring of polygons.flat()) {
    for (let i = 0; i + 1 < ring.length; i += 2) {
      box.west = Math.min(box.west, ring[i]);
      box.east = Math.max(box.east, ring[i]);
      box.south = Math.min(box.south, ring[i + 1]);
      box.north = Math.max(box.north, ring[i + 1]);
    }
  }
  return box;
}

// 2 つの四角形のすき間 (km。重なっていれば 0)
function boxGapKm(a, b) {
  const lat = (Math.max(a.south, b.south) + Math.min(a.north, b.north)) / 2;
  const dLon = Math.max(0, a.west - b.east, b.west - a.east) * Math.cos((lat * Math.PI) / 180);
  const dLat = Math.max(0, a.south - b.north, b.south - a.north);
  return Math.hypot(dLon, dLat) * 111.2;
}
for (const feature of geo.features) {
  const fix = FEATURE_FIXES[feature.properties.wikidataid];
  const p = fix ? { ...feature.properties, name: fix.name, name_en: fix.name, name_ja: fix.ja, wikidataid: fix.wikidataid } : feature.properties;
  const ja = (NAME_OVERRIDES[p.name] ?? (p.name_ja || '')).trim();
  if (!ja || !JA_SUFFIX.test(ja)) continue;
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const area = polygons.reduce((sum, rings) => sum + ringAreaKm2(rings[0]), 0);
  const flat = polygons.map((rings) => rings.map((ring) => ring.flat()));
  const { lon, lat } = labelPoint(flat);
  const record = { n: (p.name_en || p.name || '').trim(), ja, r: p.scalerank, x: round(lon), y: round(lat), a: Math.round(area) };
  // Wikidata の ID (湖の詳しい情報を引くのに使う。scripts/build-lake-info.mjs)。同じ日本語名の別の湖 (龍湖など) もあるので、
  // 名前を置く部分 (一番大きい部分) のものを使う
  if (p.wikidataid) record.w = p.wikidataid;
  // 形は、一番大きい部分と、その近くにある同じ日本語名の部分 (死海の北と南など) を描く (下で選ぶ)
  const shape = polygons
    .map((rings) => rings.map((ring) => flatten(simplifyRing(ring))).filter((ring) => ring.length >= MIN_RING_POINTS * 2))
    .filter((rings) => rings.length > 0);
  if (shape.length > 0) {
    const parts = partsByName.get(ja) ?? [];
    parts.push({ area, polygons: shape, box: boxOf(shape) });
    partsByName.set(ja, parts);
  }
  // 同じ日本語名 (死海の北と南など) は、一番大きいものを残す
  const existing = byName.get(ja);
  if (!existing || record.a > existing.a) byName.set(ja, { ...record, r: Math.min(record.r, existing?.r ?? record.r) });
}
const lakes = [...byName.values()].sort((a, b) => a.r - b.r || b.a - a.a);
fs.writeFileSync(outFile, JSON.stringify(lakes));
console.log(`wrote ${lakes.length} lakes to ${path.relative(repoRoot, outFile)}`);
const shapes = Object.fromEntries(
  lakes.map((lake) => {
    const parts = partsByName.get(lake.ja);
    const largest = parts.reduce((best, part) => (part.area > best.area ? part : best));
    return [lake.ja, parts.filter((part) => boxGapKm(part.box, largest.box) <= PART_GAP_KM).flatMap((part) => part.polygons)];
  }),
);
fs.writeFileSync(shapesFile, JSON.stringify(shapes));
const points = Object.values(shapes).flat(2).reduce((sum, ring) => sum + ring.length / 2, 0);
console.log(`wrote ${lakes.length} shapes (${points} points) to ${path.relative(repoRoot, shapesFile)}`);
