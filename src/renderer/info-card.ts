// 地球の上の名前 (川、湖、山脈などの範囲、山の頂) にマウスを乗せたときに出す、詳しい情報の札。
// データは scripts/build-river-info.mjs、build-lake-info.mjs、build-terrain-info.mjs で作った data/river-info.json、
// lake-info.json (日本語名がキー)、region-info.json、peak-info.json (Wikidata の ID がキー)。出典は Wikidata と日本語版 Wikipedia。
// 種類ごとに、初めて出すときに読み込む。名前は毎フレーム動くので、札も毎フレーム名前の位置に合わせる
import type { LabelBox } from './label-layout';

const SHOW_DELAY_MS = 300; // 地球を回す途中で名前の上を通っただけでは出さない
const GAP = 8;
const EDGE = 8;
const MAX_COUNTRIES = 5; // これより多い国は「ほか n か国」にまとめる

export interface RiverInfo {
  qid: string;
  length_km?: number;
  area_km2?: number;
  discharge_m3s?: number;
  countries?: string[];
  mouth?: string;
  summary?: string;
  wiki?: string;
}

export interface LakeInfo {
  qid: string;
  area_km2?: number;
  elevation_m?: number;
  depth_m?: number; // 最大水深
  volume_km3?: number;
  countries?: string[];
  inflows?: string[];
  outflows?: string[];
  summary?: string;
  wiki?: string;
}

export interface RegionInfo {
  qid: string;
  area_km2?: number;
  length_km?: number;
  highest?: string; // 最高地点の名前
  highest_m?: number; // 最高地点の標高
  countries?: string[];
  summary?: string;
  wiki?: string;
}

export interface PeakInfo {
  qid: string;
  elevation_m?: number;
  prominence_m?: number; // 独立標高
  range?: string; // 属する山脈
  countries?: string[];
  first_ascent?: number; // 初登頂の年
  summary?: string;
  wiki?: string;
}

export type InfoKind = 'river' | 'lake' | 'region' | 'peak';

export interface InfoTarget {
  kind: InfoKind;
  key: string; // データを引く鍵。川と湖は日本語名、範囲と山の頂は Wikidata の ID
  name: string; // 札の見出し
  box: LabelBox; // 名前の画面上の範囲
  category?: string; // 範囲の種類 (Natural Earth の FEATURECLA)
  color?: string; // 見出しの色 (範囲は地球の上の名前と同じ色)
}

// 範囲の種類 (Natural Earth の FEATURECLA) の日本語
const REGION_CATEGORY: Record<string, string> = {
  'Range/mtn': '山脈',
  Foothills: '丘陵',
  Gorge: '峡谷',
  Valley: '谷',
  Plateau: '高原',
  Plain: '平野',
  Basin: '盆地',
  Lowland: '低地',
  Delta: '三角州',
  Wetlands: '湿地',
  Depression: 'くぼ地',
  Tundra: 'ツンドラ',
  Desert: '砂漠',
};

const numberText = (value: number): string => value.toLocaleString('ja-JP');

// 1 万以上は「80.1万」のように万でまとめる
function largeNumberText(value: number): string {
  if (value < 10_000) return numberText(value);
  const man = value / 10_000;
  return `${man >= 100 ? Math.round(man).toLocaleString('ja-JP') : man.toFixed(1).replace(/\.0$/, '')}万`;
}

function listText(items: string[]): string {
  const shown = items.slice(0, MAX_COUNTRIES).join('、');
  const rest = items.length - MAX_COUNTRIES;
  return rest > 0 ? `${shown} ほか${rest}か国` : shown;
}

export function lakeFacts(info: LakeInfo): [string, string][] {
  const facts: [string, string][] = [];
  if (info.area_km2 !== undefined) facts.push(['面積', `${largeNumberText(info.area_km2)} km²`]);
  if (info.elevation_m !== undefined) facts.push(['湖面の標高', `${numberText(info.elevation_m)} m`]);
  if (info.depth_m !== undefined) facts.push(['最大水深', `${numberText(info.depth_m)} m`]);
  if (info.volume_km3 !== undefined) facts.push(['貯水量', `${numberText(info.volume_km3)} km³`]);
  if (info.countries?.length) facts.push(['国', listText(info.countries)]);
  if (info.inflows?.length) facts.push(['流れ込む川', info.inflows.join('、')]);
  if (info.outflows?.length) facts.push(['流れ出る川', info.outflows.join('、')]);
  return facts;
}

export function regionFacts(info: RegionInfo, category?: string): [string, string][] {
  const facts: [string, string][] = [];
  const kind = category ? REGION_CATEGORY[category] : undefined;
  if (kind) facts.push(['種類', kind]);
  if (info.area_km2 !== undefined) facts.push(['面積', `${largeNumberText(info.area_km2)} km²`]);
  if (info.length_km !== undefined) facts.push(['長さ', `${numberText(info.length_km)} km`]);
  if (info.highest) {
    facts.push(['最高地点', info.highest_m !== undefined ? `${info.highest} (${numberText(info.highest_m)} m)` : info.highest]);
  }
  if (info.countries?.length) facts.push(['国', listText(info.countries)]);
  return facts;
}

export function peakFacts(info: PeakInfo): [string, string][] {
  const facts: [string, string][] = [];
  if (info.elevation_m !== undefined) facts.push(['標高', `${numberText(info.elevation_m)} m`]);
  if (info.prominence_m !== undefined) facts.push(['独立標高', `${numberText(info.prominence_m)} m`]);
  if (info.range) facts.push(['山脈', info.range]);
  if (info.countries?.length) facts.push(['国', listText(info.countries)]);
  if (info.first_ascent !== undefined) facts.push(['初登頂', `${info.first_ascent}年`]);
  return facts;
}

export function riverFacts(info: RiverInfo): [string, string][] {
  const facts: [string, string][] = [];
  if (info.length_km !== undefined) facts.push(['長さ', `${numberText(info.length_km)} km`]);
  if (info.area_km2 !== undefined) facts.push(['流域面積', `${largeNumberText(info.area_km2)} km²`]);
  if (info.discharge_m3s !== undefined) facts.push(['平均流量', `${numberText(info.discharge_m3s)} m³/s`]);
  if (info.mouth) facts.push(['注ぐ先', info.mouth]);
  if (info.countries?.length) facts.push(['流れる国', listText(info.countries)]);
  return facts;
}

export class InfoCard {
  private readonly element: HTMLElement;
  private readonly data: {
    river: Record<string, RiverInfo> | null;
    lake: Record<string, LakeInfo> | null;
    region: Record<string, RegionInfo> | null;
    peak: Record<string, PeakInfo> | null;
  } = { river: null, lake: null, region: null, peak: null };
  private readonly loading: Partial<Record<InfoKind, Promise<void>>> = {};
  private pendingKey: string | null = null; // 乗せてから出すまで待っている名前
  private pendingSince = 0;
  private shownKey: string | null = null; // 種類を付けた名前 (同じ名前の川と湖を区別する)

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'info-card';
    this.element.setAttribute('role', 'tooltip');
    this.element.hidden = true;
    parent.append(this.element);
  }

  private load(kind: InfoKind): Promise<void> {
    const imports: Record<InfoKind, () => Promise<void>> = {
      river: () => import('./data/river-info.json').then((m) => void (this.data.river = m.default as unknown as Record<string, RiverInfo>)),
      lake: () => import('./data/lake-info.json').then((m) => void (this.data.lake = m.default as unknown as Record<string, LakeInfo>)),
      region: () => import('./data/region-info.json').then((m) => void (this.data.region = m.default as unknown as Record<string, RegionInfo>)),
      peak: () => import('./data/peak-info.json').then((m) => void (this.data.peak = m.default as unknown as Record<string, PeakInfo>)),
    };
    this.loading[kind] ??= imports[kind]();
    return this.loading[kind];
  }

  // 札に出す事実の並びと説明。データがなければ null
  private content(target: InfoTarget): { facts: [string, string][]; summary?: string } | null {
    switch (target.kind) {
      case 'river': {
        const info = this.data.river?.[target.key];
        return info ? { facts: riverFacts(info), summary: info.summary } : null;
      }
      case 'lake': {
        const info = this.data.lake?.[target.key];
        return info ? { facts: lakeFacts(info), summary: info.summary } : null;
      }
      case 'region': {
        const info = this.data.region?.[target.key];
        return info ? { facts: regionFacts(info, target.category), summary: info.summary } : null;
      }
      case 'peak': {
        const info = this.data.peak?.[target.key];
        return info ? { facts: peakFacts(info), summary: info.summary } : null;
      }
    }
  }

  // 毎フレーム呼ぶ。target はマウスの下の名前 (なければ null)
  update(target: InfoTarget | null, now: number): void {
    if (!target) {
      this.pendingKey = null;
      this.hide();
      return;
    }
    const id = `${target.kind}:${target.key}`;
    if (id !== this.shownKey) {
      this.hide();
      if (id !== this.pendingKey) {
        this.pendingKey = id;
        this.pendingSince = now;
        void this.load(target.kind); // 待っている間に読み込んでおく
      }
      if (now - this.pendingSince < SHOW_DELAY_MS) return;
      const content = this.content(target);
      if (!content) return;
      this.render(target, content.facts, content.summary);
      this.shownKey = id;
    }
    this.place(target.box);
  }

  private render(target: InfoTarget, items: [string, string][], summaryText: string | undefined): void {
    const title = document.createElement('div');
    title.className = `info-card-title ${target.kind}`;
    title.textContent = target.name;
    title.style.color = target.color ?? '';
    const facts = document.createElement('dl');
    facts.className = 'info-card-facts';
    for (const [term, value] of items) {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      facts.append(dt, dd);
    }
    const parts: HTMLElement[] = [title, facts];
    if (summaryText) {
      const summary = document.createElement('p');
      summary.className = 'info-card-summary';
      summary.textContent = summaryText;
      parts.push(summary);
    }
    const source = document.createElement('div');
    source.className = 'info-card-source';
    source.textContent = summaryText ? '出典: Wikipedia、Wikidata' : '出典: Wikidata';
    parts.push(source);
    this.element.replaceChildren(...parts);
    this.element.hidden = false;
  }

  // 名前の下に出し、画面の下にはみ出すなら上に出す
  private place(box: LabelBox): void {
    const width = this.element.offsetWidth;
    const height = this.element.offsetHeight;
    const left = Math.min(Math.max(box.x + box.width / 2 - width / 2, EDGE), window.innerWidth - width - EDGE);
    const below = box.y + box.height + GAP;
    const top = below + height <= window.innerHeight - EDGE ? below : box.y - GAP - height;
    this.element.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(top, EDGE))}px)`;
  }

  private hide(): void {
    if (this.shownKey === null) return;
    this.shownKey = null;
    this.element.hidden = true;
  }
}
