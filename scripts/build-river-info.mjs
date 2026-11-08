// 川の詳しい情報 (長さ、流れる国、注ぐ先、流域面積、短い説明) を、Wikidata と日本語版 Wikipedia から集めて JSON にする。
// 実行: node scripts/build-river-info.mjs
// 入力は src/renderer/data/river-names-ja.json の日本語名。出力は src/renderer/data/river-info.json (日本語名がキー)。
// Natural Earth の川には Wikidata の ID がないので、日本語名を日本語版 Wikipedia の記事名として引き、記事から ID をたどる。
// 記事名が別の川や曖昧さ回避のページになるものは TITLE_OVERRIDES で記事名を、それでも合わないものは QID_OVERRIDES で ID を直に決める。
// 数値と国は Wikidata (CC0)、説明は Wikipedia (CC BY-SA 4.0) の記事の冒頭。ネットにつなぐのはこのスクリプトだけで、アプリは出力を読むだけ
import fs from 'node:fs';
import path from 'node:path';
import { fetchArticles, fetchEnglishQids, fetchEntities, itemIds, label, quantity, round, summarize, UNIT } from './wiki.mjs';

const repoRoot = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const dataDir = path.join(repoRoot, 'src', 'renderer', 'data');
const outFile = path.join(dataDir, 'river-info.json');

// 日本語名 → 日本語版 Wikipedia の記事名。日本語名のままでは別の記事になるもの
const TITLE_OVERRIDES = {};
// 日本語名 → Wikidata の ID。日本語版に記事がないもの (Wikidata の説明と、同名の川は地図の位置で確かめた)
const QID_OVERRIDES = {
  通天河: 'Q7821148', // 長江の上流
  ルアラバ川: 'Q836812',
  ファール川: 'Q209530',
  カフエ川: 'Q846063',
  ブグ川: 'Q156237', // 西ブグ川
  ベーラヤ川: 'Q192157', // バシコルトスタンの川 (カマ川の支流)。地図の線は東経 53〜56 度
  ラーヴィー川: 'Q317899',
  ガンダキ川: 'Q849494',
  トンレサップ川: 'Q939958',
};
// 日本語名 → 英語版 Wikipedia の記事名。日本語版の記事が曖昧さ回避や別の川 (本流など) になるもの
const EN_TITLE_OVERRIDES = {
  マルヌ川: 'Marne (river)',
  ジェイハン川: 'Ceyhan River',
  黒ヴォルタ川: 'Black Volta', // 日本語版はヴォルタ川 (本流) へ転送される
};

const names = JSON.parse(fs.readFileSync(path.join(dataDir, 'river-names-ja.json'), 'utf8'));
const jaNames = [...new Set(Object.entries(names).filter(([key]) => !key.startsWith('_')).map(([, ja]) => ja))];

// 英語版の記事名から ID を引き、QID_OVERRIDES に足す
const enQids = await fetchEnglishQids(Object.values(EN_TITLE_OVERRIDES));
for (const [ja, title] of Object.entries(EN_TITLE_OVERRIDES)) {
  const qid = enQids.get(title);
  if (qid) QID_OVERRIDES[ja] = qid;
  else console.log(`  要確認: ${ja}: 英語版の記事 ${title} から ID を引けない`);
}

const titles = jaNames.map((ja) => TITLE_OVERRIDES[ja] ?? ja);
const articles = await fetchArticles(titles);

const qidOf = new Map();
const problems = [];
for (const ja of jaNames) {
  const article = articles.get(TITLE_OVERRIDES[ja] ?? ja);
  const qid = QID_OVERRIDES[ja] ?? article?.qid ?? null;
  if (!qid) problems.push(`${ja}: 記事か Wikidata の ID がない`);
  else if (!QID_OVERRIDES[ja] && article.disambiguation) problems.push(`${ja}: 曖昧さ回避のページ (${article.title})`);
  else qidOf.set(ja, qid);
}

const rivers = await fetchEntities([...qidOf.values()]);
// 国と注ぐ先の名前を引く
const relatedIds = [];
for (const entity of rivers.values()) relatedIds.push(...itemIds(entity, 'P17'), ...itemIds(entity, 'P403'));
const related = await fetchEntities(relatedIds, 'labels');

// 川や水路の種類 (P31)。これ以外のものに解決したら、記事が川ではない疑いがある
const WATERCOURSE = new Set(['Q4022', 'Q47521', 'Q573344', 'Q1437299', 'Q159675', 'Q55659167', 'Q12284', 'Q1267889', 'Q11660']);

// 記事の冒頭は QID_OVERRIDES で決めた川では、Wikidata の日本語版の記事から取り直す
const overrideTitles = [];
for (const ja of Object.keys(QID_OVERRIDES)) {
  const title = rivers.get(QID_OVERRIDES[ja])?.sitelinks?.jawiki?.title;
  if (title) overrideTitles.push(title);
}
const overrideArticles = overrideTitles.length ? await fetchArticles(overrideTitles) : new Map();

const out = {
  _note:
    '川の詳しい情報。scripts/build-river-info.mjs で作る。キーは river-names-ja.json の日本語名。' +
    '数値と国、注ぐ先は Wikidata (CC0)、summary は日本語版 Wikipedia (CC BY-SA 4.0) の記事の冒頭を短くしたもの',
};
for (const ja of jaNames) {
  const qid = qidOf.get(ja);
  const entity = qid && rivers.get(qid);
  if (!entity) continue;
  const kinds = itemIds(entity, 'P31');
  if (!kinds.some((kind) => WATERCOURSE.has(kind))) problems.push(`${ja}: 川ではないかもしれない (${qid}、P31 ${kinds.join(',')})`);
  const wikiTitle = entity.sitelinks?.jawiki?.title ?? null;
  const article = QID_OVERRIDES[ja] ? overrideArticles.get(wikiTitle) : articles.get(TITLE_OVERRIDES[ja] ?? ja);
  const length = quantity(entity, 'P2043', { [UNIT.km]: 1, [UNIT.metre]: 0.001, [UNIT.mile]: 1.609344 });
  const area = quantity(entity, 'P2053', { [UNIT.km2]: 1 });
  const discharge = quantity(entity, 'P2225', { [UNIT.m3s]: 1 });
  const countries = [...new Set(itemIds(entity, 'P17').map((id) => label(related.get(id))).filter(Boolean))];
  const mouth = itemIds(entity, 'P403').map((id) => label(related.get(id))).find(Boolean) ?? null;
  const record = { qid };
  // 長さは丸めない (説明の文に書かれた長さと食い違って見えるため)
  if (length !== null) record.length_km = round(length, 1);
  if (area !== null) record.area_km2 = round(area, area >= 10000 ? 1000 : 10);
  if (discharge !== null) record.discharge_m3s = round(discharge, discharge >= 100 ? 10 : 1);
  if (countries.length) record.countries = countries;
  if (mouth) record.mouth = mouth;
  const summary = article ? summarize(article.extract) : '';
  if (summary) record.summary = summary;
  if (wikiTitle) record.wiki = wikiTitle;
  out[ja] = record;
}

fs.writeFileSync(outFile, `${JSON.stringify(out, null, 1)}\n`);
const count = Object.keys(out).length - 1;
console.log(`${count}/${jaNames.length} 件を ${path.relative(repoRoot, outFile)} に書いた`);
for (const problem of problems) console.log(`  要確認: ${problem}`);
