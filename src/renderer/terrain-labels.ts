// 地球儀の上に出す地形の名前 (山脈、砂漠、高原、平野、盆地など)、川、湖と山の頂。設定の「地形の名前を表示」で出す。
// データはツアーのハイライトと同じ Natural Earth (highlight-data.ts)。引いているときは大きな地形だけ、寄るほど小さな地形まで出す。
// 川は日本語名の対応表 (data/river-names-ja.json。アプリで追加した名前) にあるものだけを出し、名前は線の上で画面の中心に近い所に置く。
// 湖は Natural Earth の日本語名 (scripts/build-lakes.mjs で絞ったもの) を、湖の内側の奥まった点に置く。クリックすると湖の形を描く。
// 山の頂は寄ったときだけ、印と標高を付けて出す。都市名、国名、地点のマーカーには重ねない
import * as THREE from 'three';
import { lonLatToVector3 } from './globe';
import { riverLines, type PointRecord, type RegionRecord, type RiverLine, type RiverRecord } from './highlight-data';
import { placeLabels, type LabelBox } from './label-layout';
import { labelPoint } from './label-point';
import { applyLayout, ensureMeasured, labelAt, rankAtAltitude, shownBoxes, updateHover, type RankTable, type ScreenLabel, type WorldToScreen } from './screen-labels';

export type { RiverLine } from './highlight-data';

// 出す範囲の種類と、色分けの組。島、半島、海岸などは数が多く混むので出さない
const REGION_GROUPS: Record<string, 'desert' | 'mountain' | 'plateau' | 'lowland' | 'cold'> = {
  Desert: 'desert',
  'Range/mtn': 'mountain',
  Foothills: 'mountain',
  Gorge: 'mountain',
  Valley: 'mountain',
  Plateau: 'plateau',
  Plain: 'lowland',
  Basin: 'lowland',
  Lowland: 'lowland',
  Delta: 'lowland',
  Wetlands: 'lowland',
  Depression: 'lowland',
  Tundra: 'cold',
};

// カメラの高さ (レンズの分を換算、地球の半径が 1) ごとの、出す地形の重要度 (scalerank) の上限。上から順に、この高さ以上なら
const REGION_RANK_BY_ALTITUDE: RankTable = [
  [1.4, 1],
  [0.7, 2],
  [0.35, 3],
  [0.18, 4],
  [0.09, 5],
  [0, 6],
];
// 川と湖。上と同じく、カメラの高さごとの重要度 (scalerank) の上限
const RIVER_RANK_BY_ALTITUDE: RankTable = [
  [1.4, 2],
  [0.7, 3],
  [0.35, 5],
  [0.18, 6],
  [0.09, 8],
  [0, 10],
];
const LAKE_RANK_BY_ALTITUDE: RankTable = [
  [1.4, 1],
  [0.7, 3],
  [0.35, 5],
  [0.18, 7],
  [0.09, 8],
  [0, 9],
];
// 範囲をクリックしたときに描く輪郭の色。地球の上の名前の色 (style.css の .terrain-label.desert など) と同じ
const REGION_OUTLINE_COLORS: Record<(typeof REGION_GROUPS)[string], string> = {
  desert: '#f0cd8c',
  mountain: '#e1af87',
  plateau: '#dcc3a0',
  lowland: '#afd796',
  cold: '#b9d7e6',
};
const RIVER_CANDIDATES = 80; // 川の名前を置く候補の点の数 (同じ名前の線をまとめて)
const RIVER_KEEP_RATIO = 0.6; // 今の点より画面の中心にこれだけ近い点が見つかったときだけ、名前を動かす (ちらつかないように)
const SCREEN_MARGIN_X = 0.06; // 川の名前を置く点は、画面の端からこの割合より内側にする
const SCREEN_MARGIN_Y = 0.1;

interface LakeRecord {
  n: string;
  ja: string;
  r: number;
  x: number;
  y: number;
  a: number; // 面積 (km²。おおよそ)
  w?: string; // Wikidata の ID (詳しい情報は data/lake-info.json)
}

// 山の頂。-1 は出さない
const PEAK_RANK_BY_ALTITUDE: RankTable = [
  [0.35, -1],
  [0.18, 3],
  [0.09, 5],
  [0.04, 7],
  [0, 9],
];
const PEAK_MARK_HALF = 5; // 山の頂の印 (▲) の幅の半分 (px)。印の中心を頂の位置に合わせる

type TerrainKind = 'region' | 'peak' | 'river' | 'lake';

interface TerrainLabel extends ScreenLabel {
  rank: number;
  kind: TerrainKind;
  peak: boolean;
  lon: number; // 名前を置く点 (山の頂へ寄るのに使う。川は使わない)
  lat: number;
  candidates: THREE.Vector3[] | null; // 川の名前を置く候補の点。範囲、湖、山の頂は null
  bounds: THREE.Sphere | null; // 候補の点をすべて含む球 (川だけ)。画面の外や地球の裏にある川は候補を 1 つずつ調べない
  lines: RiverLine[] | null; // 川の線 (クリックしたときに描く)。川のほかは null (湖の形は lakeShape で引く)
  polygons: number[][][] | null; // 範囲の形 (クリックしたときに描く)。範囲のほかは null
  color: string; // 範囲の輪郭の色
  key: string; // 川と湖は名前、範囲と山の頂は Wikidata の ID (同じ名前の別の山脈がある。なければ名前)
  name: string; // 出している名前
  group: (typeof REGION_GROUPS)[string] | null; // 範囲の色分けの組
  category: string; // 範囲の種類 (Natural Earth の FEATURECLA。Range/mtn など)
  elevation: number | null; // 山の頂の標高 (m。Natural Earth の値)
  current: number; // 川の名前を今置いている候補 (-1 は置いていない)
  world: THREE.Vector3;
}

// マウスの下にある名前。川は線、湖は形をあとで引く (lakeShape)、範囲は形を持つ。山の頂は札を出すだけでクリックしない
export type TerrainPick =
  | { kind: 'river'; key: string; name: string; lines: RiverLine[]; box: LabelBox }
  | { kind: 'lake'; key: string; name: string; box: LabelBox }
  | { kind: 'region'; key: string; name: string; polygons: number[][][]; color: string; category: string; box: LabelBox }
  | { kind: 'peak'; key: string; name: string; elevation: number | null; lon: number; lat: number; box: LabelBox };

export class TerrainLabels {
  private labels: TerrainLabel[] = [];
  private hovered: TerrainLabel | null = null;
  private loading: Promise<void> | null = null;
  private lakeShapes: Promise<Record<string, number[][][]>> | null = null;
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();

  constructor(
    private readonly container: HTMLElement,
    private readonly radius: number,
  ) {
    container.hidden = true;
  }

  // 初めて出すときにデータを読み込む
  setVisible(visible: boolean): void {
    this.container.hidden = !visible;
    if (visible) this.loading ??= this.load();
  }

  private async load(): Promise<void> {
    const [regionModule, pointModule, riverModule, riverNameModule, lakeModule] = await Promise.all([
      import('./data/regions-10m.json'),
      import('./data/points-10m.json'),
      import('./data/rivers-10m.json'),
      import('./data/river-names-ja.json'),
      import('./data/lakes-10m.json'),
    ]);
    const regions = (regionModule.default as unknown as RegionRecord[]).filter((region) => REGION_GROUPS[region.c]);
    const peaks = (pointModule.default as unknown as PointRecord[]).filter((point) => point.c === 'mountain');
    const labels: TerrainLabel[] = [];
    for (const region of regions) {
      const element = document.createElement('span');
      element.className = `terrain-label ${REGION_GROUPS[region.c]} rank-${Math.min(region.r, 4)} off`;
      element.textContent = region.ja || region.n;
      const { lon, lat } = labelPoint(region.p);
      const label = this.makeLabel(element, lon, lat, region.r, 'region');
      label.polygons = region.p;
      label.color = REGION_OUTLINE_COLORS[REGION_GROUPS[region.c]];
      label.key = region.w ?? `region:${region.n}:${region.r}`;
      label.name = region.ja || region.n;
      label.group = REGION_GROUPS[region.c];
      label.category = region.c;
      labels.push(label);
    }
    // 川。区間ごとに英語名が分かれている川 (Rhine と Rhein など) は、同じ日本語名で 1 つにまとめる
    const riverNames = riverNameModule.default as unknown as Record<string, string>;
    // まとめた区間は、それぞれの区間の源流から伸ばす (区間どうしのつながりは元データにない)
    const riverGroups = new Map<string, { rank: number; lines: RiverLine[] }>();
    for (const river of riverModule.default as unknown as RiverRecord[]) {
      const ja = riverNames[river.n];
      if (!ja) continue;
      const group = riverGroups.get(ja) ?? { rank: river.r, lines: [] };
      group.rank = Math.min(group.rank, river.r);
      group.lines.push(...riverLines(river));
      riverGroups.set(ja, group);
    }
    for (const [ja, group] of riverGroups) {
      const total = group.lines.reduce((sum, line) => sum + line.coords.length / 2, 0);
      const stride = Math.max(1, Math.floor(total / RIVER_CANDIDATES));
      const candidates: THREE.Vector3[] = [];
      for (const { coords } of group.lines) {
        for (let i = 0; i + 1 < coords.length; i += stride * 2) candidates.push(lonLatToVector3(coords[i], coords[i + 1], this.radius));
      }
      if (candidates.length === 0) continue;
      const element = document.createElement('span');
      element.className = 'terrain-label river off';
      element.textContent = ja;
      const label = this.makeLabel(element, 0, 0, group.rank, 'river');
      label.candidates = candidates;
      label.bounds = new THREE.Sphere().setFromPoints(candidates);
      label.lines = group.lines;
      label.key = ja;
      label.name = ja;
      labels.push(label);
    }
    for (const lake of lakeModule.default as unknown as LakeRecord[]) {
      const element = document.createElement('span');
      element.className = `terrain-label lake ${lake.r <= 1 ? 'rank-2' : lake.r <= 4 ? 'rank-3' : ''} off`;
      element.textContent = lake.ja;
      const label = this.makeLabel(element, lake.x, lake.y, lake.r, 'lake');
      label.key = lake.ja;
      label.name = lake.ja;
      labels.push(label);
    }
    for (const peak of peaks) {
      const element = document.createElement('span');
      element.className = 'terrain-label peak off';
      const mark = document.createElement('span');
      mark.className = 'peak-mark';
      mark.textContent = '▲';
      element.append(mark, peak.ja || peak.n);
      if (peak.e) {
        const elevation = document.createElement('span');
        elevation.className = 'peak-elevation';
        elevation.textContent = `${peak.e.toLocaleString('ja-JP')}m`;
        element.append(elevation);
      }
      const label = this.makeLabel(element, peak.x, peak.y, peak.r, 'peak');
      label.key = peak.w ?? `peak:${peak.n}:${peak.x},${peak.y}`;
      label.name = peak.ja || peak.n;
      label.elevation = peak.e;
      labels.push(label);
    }
    // 重要な地形を先に置く。同じ重要度なら範囲を山の頂より先に
    labels.sort((a, b) => a.rank - b.rank || Number(a.peak) - Number(b.peak));
    this.container.append(...labels.map((label) => label.element));
    this.labels = labels;
  }

  private makeLabel(element: HTMLElement, lon: number, lat: number, rank: number, kind: TerrainKind): TerrainLabel {
    return {
      rank,
      kind,
      peak: kind === 'peak',
      candidates: null,
      bounds: null,
      lines: null,
      polygons: null,
      color: '',
      key: '',
      name: '',
      group: null,
      category: '',
      elevation: null,
      current: -1,
      element,
      lon,
      lat,
      world: lonLatToVector3(lon, lat, this.radius),
      width: 0,
      height: 0,
      box: null,
      transform: '',
      shown: false,
      far: false,
      farSince: 0,
    };
  }

  // 川の候補の点がどれも画面に入らないか。候補を含む球が視錐台の外にあるか、カメラから見て地平線の向こうにあるとき。
  // 224 本の川の候補 (80 点ずつ) を毎フレーム投影すると、巡航中の CPU 時間の 1 割近くを占めていた
  private riverOutOfView(label: TerrainLabel, eye: THREE.Vector3): boolean {
    const bounds = label.bounds!;
    if (!this.frustum.intersectsSphere(bounds)) return true;
    // 球の中心とカメラの間の角度から球の見込みの角度を引いたものが地平線の角度 (地球の半径が 1 で、カメラまでの距離が d のとき acos(1/d)) より
    // 大きければ、球のどの点も地平線の向こう (toScreen の判定と同じ)
    const distance = eye.length();
    const angle = Math.acos(THREE.MathUtils.clamp(bounds.center.dot(eye) / (bounds.center.length() * distance), -1, 1));
    const spread = Math.asin(Math.min(1, bounds.radius / bounds.center.length()));
    return angle - spread > Math.acos(Math.min(1, 1 / distance));
  }

  // 川の名前を置く点。画面に入っている候補のうち、画面の中心に一番近い点。ちらつかないよう、今の点がまだ使えて、
  // はっきり中心に近い点がなければ動かさない
  private riverPoint(label: TerrainLabel, toScreen: WorldToScreen, eye: THREE.Vector3): { x: number; y: number } | null {
    if (this.riverOutOfView(label, eye)) {
      label.current = -1;
      return null;
    }
    const candidates = label.candidates!;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const usable = (index: number): { x: number; y: number; distance: number } | null => {
      const point = toScreen(candidates[index]);
      if (!point) return null;
      if (point.x < width * SCREEN_MARGIN_X || point.x > width * (1 - SCREEN_MARGIN_X)) return null;
      if (point.y < height * SCREEN_MARGIN_Y || point.y > height * (1 - SCREEN_MARGIN_Y)) return null;
      return { x: point.x, y: point.y, distance: Math.hypot(point.x - width / 2, point.y - height / 2) };
    };
    let best: { x: number; y: number; distance: number } | null = null;
    let chosen = -1;
    for (let index = 0; index < candidates.length; index++) {
      const point = usable(index);
      if (point && (!best || point.distance < best.distance)) {
        best = point;
        chosen = index;
      }
    }
    const current = label.current >= 0 && label.current !== chosen ? usable(label.current) : null;
    if (current && (!best || best.distance > current.distance * RIVER_KEEP_RATIO)) return current;
    label.current = chosen;
    return best;
  }

  // 画面の点 (x, y) にある、出ている名前。マウスを乗せた名前を明るくし、札を出したり、クリックで川の線や湖と範囲の形を
  // 描いたりするのに使う。名前の少し外側まで反応させる。重なっているときは先に置いた (重要な) 名前を選ぶ
  pickAt(x: number, y: number): TerrainPick | null {
    const found = this.container.hidden ? null : labelAt(this.labels, x, y);
    this.hovered = updateHover(this.hovered, found);
    if (!found) return null;
    const { key, name } = found;
    const box = found.box!;
    switch (found.kind) {
      case 'river':
        return { kind: 'river', key, name, lines: found.lines!, box };
      case 'lake':
        return { kind: 'lake', key, name, box };
      case 'region':
        return { kind: 'region', key, name, polygons: found.polygons!, color: found.color, category: found.category, box };
      case 'peak':
        return { kind: 'peak', key, name, elevation: found.elevation, lon: found.lon, lat: found.lat, box };
    }
  }

  // 湖の形 (輪の並び。輪は平らな [lon, lat, ...])。形のデータは初めて使うときに読み込む
  async lakeShape(key: string): Promise<number[][][] | null> {
    this.lakeShapes ??= import('./data/lake-shapes-10m.json').then(
      (module) => module.default as unknown as Record<string, number[][][]>,
    );
    return (await this.lakeShapes)[key] ?? null;
  }

  shownBoxes(): LabelBox[] {
    return this.container.hidden ? [] : shownBoxes(this.labels);
  }

  // 毎フレーム呼ぶ。blocked は重ねない範囲 (都市のラベル、国名など)、altitude はレンズの分を換算したカメラの高さ。
  // camera は toScreen と同じカメラ (川の候補をまとめて外す判定に使う)
  update(toScreen: WorldToScreen, blocked: LabelBox[], altitude: number, camera: THREE.Camera): void {
    if (this.container.hidden || this.labels.length === 0) return;
    const maxRank: Record<TerrainKind, number> = {
      region: rankAtAltitude(REGION_RANK_BY_ALTITUDE, altitude),
      peak: rankAtAltitude(PEAK_RANK_BY_ALTITUDE, altitude),
      river: rankAtAltitude(RIVER_RANK_BY_ALTITUDE, altitude),
      lake: rankAtAltitude(LAKE_RANK_BY_ALTITUDE, altitude),
    };
    this.frustum.setFromProjectionMatrix(this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const eye = camera.position;
    const boxes = this.labels.map((label): LabelBox | null => {
      if (label.rank > maxRank[label.kind]) {
        label.current = -1;
        return null;
      }
      const point = label.candidates ? this.riverPoint(label, toScreen, eye) : toScreen(label.world);
      if (!point) return null;
      ensureMeasured(label);
      // 範囲の名前は点を中心に、山の頂は印の中心を頂に合わせる
      const x = label.peak ? point.x - PEAK_MARK_HALF : point.x - label.width / 2;
      return { x, y: point.y - label.height / 2, width: label.width, height: label.height };
    });
    applyLayout(this.labels, boxes, placeLabels(boxes, blocked), performance.now());
  }
}
