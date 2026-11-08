// 地球の上の名前 (川と湖) にマウスを乗せたときに出す、詳しい情報の札。
// データは scripts/build-river-info.mjs と build-lake-info.mjs で作った data/river-info.json と lake-info.json
// (Wikidata と日本語版 Wikipedia)。種類ごとに、初めて出すときに読み込む。名前は毎フレーム動くので、札も毎フレーム名前の位置に合わせる
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

export type InfoKind = 'river' | 'lake';

export interface InfoTarget {
  kind: InfoKind;
  key: string; // 日本語名
  box: LabelBox; // 名前の画面上の範囲
}

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
  private readonly data: { river: Record<string, RiverInfo> | null; lake: Record<string, LakeInfo> | null } = {
    river: null,
    lake: null,
  };
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
    this.loading[kind] ??=
      kind === 'river'
        ? import('./data/river-info.json').then((module) => {
            this.data.river = module.default as unknown as Record<string, RiverInfo>;
          })
        : import('./data/lake-info.json').then((module) => {
            this.data.lake = module.default as unknown as Record<string, LakeInfo>;
          });
    return this.loading[kind];
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
      const river = target.kind === 'river' ? this.data.river?.[target.key] : undefined;
      const lake = target.kind === 'lake' ? this.data.lake?.[target.key] : undefined;
      const info = river ?? lake;
      if (!info) return;
      this.render(target.kind, target.key, river ? riverFacts(river) : lakeFacts(lake!), info.summary);
      this.shownKey = id;
    }
    this.place(target.box);
  }

  private render(kind: InfoKind, name: string, items: [string, string][], summaryText: string | undefined): void {
    const title = document.createElement('div');
    title.className = `info-card-title ${kind}`;
    title.textContent = name;
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
