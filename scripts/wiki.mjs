// Wikidata と Wikipedia から情報を集めるビルド用スクリプトの共通部分 (build-river-info.mjs、build-lake-info.mjs)。
// 数値と国は Wikidata (CC0)、説明は日本語版 Wikipedia (CC BY-SA 4.0) の記事の冒頭
const USER_AGENT = 'weather-globe-build/0.1 (build script; https://github.com/ysm446/tiny-earth)';
export const SUMMARY_MAX = 140; // 説明の最大の文字数。超えるときは文の切れ目で切る

export async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.ok) return response.json();
    if (attempt >= 3 || (response.status !== 429 && response.status < 500)) {
      throw new Error(`${response.status} ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// 日本語版の記事名 → { title, qid, extract, disambiguation }。転送ページは転送先をたどる
export async function fetchArticles(titles) {
  const result = new Map();
  // 冒頭の抜き出し (extracts) は 1 回に 20 件まで
  for (const batch of chunks(titles, 20)) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      prop: 'pageprops|extracts',
      ppprop: 'wikibase_item|disambiguation',
      exintro: '1',
      explaintext: '1',
      exlimit: '20',
      titles: batch.join('|'),
    });
    const data = await getJson(`https://ja.wikipedia.org/w/api.php?${params}`);
    // 引いた名前 → 正規化と転送を経た記事名
    const resolved = new Map(batch.map((title) => [title, title]));
    for (const { from, to } of data.query.normalized ?? []) {
      for (const [key, value] of resolved) if (value === from) resolved.set(key, to);
    }
    for (const { from, to } of data.query.redirects ?? []) {
      for (const [key, value] of resolved) if (value === from) resolved.set(key, to);
    }
    const pages = new Map(data.query.pages.map((page) => [page.title, page]));
    for (const [asked, title] of resolved) {
      const page = pages.get(title);
      if (!page || page.missing) continue;
      result.set(asked, {
        title: page.title,
        qid: page.pageprops?.wikibase_item ?? null,
        extract: page.extract ?? '',
        disambiguation: page.pageprops?.disambiguation !== undefined,
      });
    }
  }
  return result;
}

// 英語版の記事名 → Wikidata の ID
export async function fetchEnglishQids(titles) {
  if (titles.length === 0) return new Map();
  const data = await getJson(
    `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      prop: 'pageprops',
      ppprop: 'wikibase_item',
      titles: titles.join('|'),
    })}`,
  );
  return new Map(data.query.pages.map((page) => [page.title, page.pageprops?.wikibase_item]));
}

export async function fetchEntities(ids, props = 'claims|labels|sitelinks') {
  const result = new Map();
  for (const batch of chunks([...new Set(ids)], 50)) {
    const params = new URLSearchParams({
      action: 'wbgetentities',
      format: 'json',
      ids: batch.join('|'),
      props,
      languages: 'ja|en',
      sitefilter: 'jawiki',
    });
    const data = await getJson(`https://www.wikidata.org/w/api.php?${params}`);
    for (const [id, entity] of Object.entries(data.entities)) if (!entity.missing) result.set(id, entity);
  }
  return result;
}

// 優先順位の高い (preferred) 値を先に、非推奨 (deprecated) は除いて返す
function claimsOf(entity, property) {
  const claims = (entity.claims?.[property] ?? []).filter((claim) => claim.rank !== 'deprecated');
  const preferred = claims.filter((claim) => claim.rank === 'preferred');
  return (preferred.length ? preferred : claims).map((claim) => claim.mainsnak).filter((snak) => snak.snaktype === 'value');
}

export const UNIT = {
  km: 'http://www.wikidata.org/entity/Q828224',
  metre: 'http://www.wikidata.org/entity/Q11573',
  mile: 'http://www.wikidata.org/entity/Q253276',
  foot: 'http://www.wikidata.org/entity/Q3710',
  km2: 'http://www.wikidata.org/entity/Q712226',
  hectare: 'http://www.wikidata.org/entity/Q35852',
  m3s: 'http://www.wikidata.org/entity/Q794261',
  km3: 'http://www.wikidata.org/entity/Q4243638',
  m3: 'http://www.wikidata.org/entity/Q25517',
};

// units は単位の URI → 掛ける数。知らない単位の値は使わない
export function quantity(entity, property, units) {
  for (const snak of claimsOf(entity, property)) {
    const { amount, unit } = snak.datavalue.value;
    const scale = units[unit];
    if (scale !== undefined) return Number(amount) * scale;
  }
  return null;
}

export function itemIds(entity, property) {
  return claimsOf(entity, property).map((snak) => snak.datavalue.value.id);
}

export function label(entity) {
  return entity?.labels?.ja?.value ?? entity?.labels?.en?.value ?? null;
}

// 日本語の名前だけ (英語名が混ざると読みにくい一覧に使う)
export function labelJa(entity) {
  return entity?.labels?.ja?.value ?? null;
}

// 記事の冒頭から、読みがなや外国語の表記の括弧を除き、最初の文から SUMMARY_MAX 字に収まるだけの文を残す
export function summarize(extract) {
  const first = extract.split('\n').find((line) => line.trim()) ?? '';
  let text = first;
  // 入れ子の括弧も外側ごと除く
  for (let previous = ''; previous !== text; ) {
    previous = text;
    text = text.replace(/[（(][^（）()]*[）)]/g, '');
  }
  text = text.replace(/\s+/g, ' ').replace(/ ?、/g, '、').replace(/ ?。/g, '。').trim();
  const sentences = text.match(/[^。]+。/g) ?? [text];
  let out = '';
  for (const sentence of sentences) {
    if (out && (out + sentence).length > SUMMARY_MAX) break;
    // 抜き出しが崩れた文 (アラビア語などの表記の周りで、途中が欠けてかぎ括弧が対にならないもの。死海など) から先は使わない
    if ((sentence.match(/「/g) ?? []).length !== (sentence.match(/」/g) ?? []).length) break;
    out += sentence;
  }
  return out.length > SUMMARY_MAX ? `${out.slice(0, SUMMARY_MAX - 1)}…` : out;
}

// step 刻みに丸める。0.1 刻みなどで 1.9000000000000001 のような誤差が出ないよう、桁で切りそろえる
export const round = (value, step) => (value === null ? null : Number((Math.round(value / step) * step).toFixed(6)));
