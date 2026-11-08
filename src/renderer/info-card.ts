// 地球の上の名前 (今は川) にマウスを乗せたときに出す、詳しい情報の札。
// データは scripts/build-river-info.mjs で作った data/river-info.json (Wikidata と日本語版 Wikipedia)。
// 初めて出すときに読み込む。名前は毎フレーム動くので、札も毎フレーム名前の位置に合わせる
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

export interface InfoTarget {
  kind: 'river';
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

export function riverFacts(info: RiverInfo): [string, string][] {
  const facts: [string, string][] = [];
  if (info.length_km !== undefined) facts.push(['長さ', `${numberText(info.length_km)} km`]);
  if (info.area_km2 !== undefined) facts.push(['流域面積', `${largeNumberText(info.area_km2)} km²`]);
  if (info.discharge_m3s !== undefined) facts.push(['平均流量', `${numberText(info.discharge_m3s)} m³/s`]);
  if (info.mouth) facts.push(['注ぐ先', info.mouth]);
  if (info.countries?.length) {
    const shown = info.countries.slice(0, MAX_COUNTRIES).join('、');
    const rest = info.countries.length - MAX_COUNTRIES;
    facts.push(['流れる国', rest > 0 ? `${shown} ほか${rest}か国` : shown]);
  }
  return facts;
}

export class InfoCard {
  private readonly element: HTMLElement;
  private rivers: Record<string, RiverInfo> | null = null;
  private loading: Promise<void> | null = null;
  private pendingKey: string | null = null; // 乗せてから出すまで待っている名前
  private pendingSince = 0;
  private shownKey: string | null = null;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'info-card';
    this.element.setAttribute('role', 'tooltip');
    this.element.hidden = true;
    parent.append(this.element);
  }

  private load(): Promise<void> {
    this.loading ??= import('./data/river-info.json').then((module) => {
      this.rivers = module.default as unknown as Record<string, RiverInfo>;
    });
    return this.loading;
  }

  // 毎フレーム呼ぶ。target はマウスの下の名前 (なければ null)
  update(target: InfoTarget | null, now: number): void {
    if (!target) {
      this.pendingKey = null;
      this.hide();
      return;
    }
    if (target.key !== this.shownKey) {
      this.hide();
      if (target.key !== this.pendingKey) {
        this.pendingKey = target.key;
        this.pendingSince = now;
        void this.load(); // 待っている間に読み込んでおく
      }
      const info = this.rivers?.[target.key];
      if (now - this.pendingSince < SHOW_DELAY_MS || !info) return;
      this.render(target.key, info);
      this.shownKey = target.key;
    }
    this.place(target.box);
  }

  private render(name: string, info: RiverInfo): void {
    const title = document.createElement('div');
    title.className = 'info-card-title';
    title.textContent = name;
    const facts = document.createElement('dl');
    facts.className = 'info-card-facts';
    for (const [term, value] of riverFacts(info)) {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      facts.append(dt, dd);
    }
    const parts: HTMLElement[] = [title, facts];
    if (info.summary) {
      const summary = document.createElement('p');
      summary.className = 'info-card-summary';
      summary.textContent = info.summary;
      parts.push(summary);
    }
    const source = document.createElement('div');
    source.className = 'info-card-source';
    source.textContent = info.summary ? '出典: Wikipedia、Wikidata' : '出典: Wikidata';
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
