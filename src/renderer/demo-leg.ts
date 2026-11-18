// デモの 1 区間 (次の都市と、そこへの移り方)。決まった道は持たず、今いる場所、太陽の位置、都市の一覧から選ぶ。
// DOM に依存しない
import { MAP_CITIES } from './cities.ts';
import { CITIES, sunElevation, type DemoPlace } from './demo.ts';
import { bearingDegrees, DEG, separationDegrees, type LonLat } from './math.ts';
import { cruiseRegionView } from './region-camera.ts';

// arc は保存した視点へ飛ぶときと同じ弧、cruise は低い高さでまっすぐ飛ぶ、globe は地球の全景まで引いてから降りる。
// descend は地球ビューにいるとき (設定地点がないときの始め) に、そのまま降りる
export type DemoWay = 'arc' | 'cruise' | 'globe' | 'descend';

export interface DemoLeg {
  place: DemoPlace;
  way: DemoWay;
}

// 移り方ごとの、今いる場所からの角度 (度) の範囲。
// 弧は近すぎると弧にならず、巡航は遠いと長くかかり (毎秒 1.2 度)、遠い都市へは全景まで引いたほうが地球を見せられる
const ARC_DEGREES = [15, 70];
const CRUISE_DEGREES = [20, 45];
const GLOBE_MIN_DEGREES = 70;

const DAY_MIN_ELEVATION = 15; // 太陽がこれより高ければ、地表がよく見える
const NIGHT_MAX_ELEVATION = -6; // 太陽がこれより低ければ、街明かりがはっきり見える
export const RECENT_LIMIT = 5; // 同じ場所が続かないよう、最近行った場所を避ける

const ROUTE_STEP_DEGREES = 2; // 道の上を調べる間隔
const ROUTE_REACH_DEGREES = 5; // 道の上の点からこの角度までに都市があれば、その点は都市の近くとみなす
// 海の上ばかり (とくに真っ暗な夜の海) は面白い絵にならないので、都市の近くを飛ぶ割合がこれより小さい区間は巡航にしない
const CRUISE_MIN_COVERAGE = 0.5;
const CRUISE_CHOICES = 3; // 巡航は、都市の近くを飛ぶ割合の上位からランダムに選ぶ

// from から to への大円の上の点 (ROUTE_STEP_DEGREES ごと) のうち、近くに都市がある点の割合
export function cruiseCoverage(from: LonLat, to: LonLat): number {
  const steps = Math.max(1, Math.round(separationDegrees(from, to) / ROUTE_STEP_DEGREES));
  let point = { lat: from.lat, lon: from.lon, heading: bearingDegrees(from, to), tilt: 0, distance: 1 };
  let covered = 0;
  for (let step = 0; step <= steps; step++) {
    const at = point;
    if (MAP_CITIES.some((place) => separationDegrees(place, at) < ROUTE_REACH_DEGREES)) covered++;
    point = cruiseRegionView(point, ROUTE_STEP_DEGREES * DEG, 0);
  }
  return covered / (steps + 1);
}

function within(value: number, [min, max]: number[]): boolean {
  return value >= min && value <= max;
}

// 次の都市は、今の太陽で見頃 (昼か夜。薄明は除く) の都市から選ぶ。recent は新しい順で、選んだ都市を先頭に足す。
// 移り方は、その都市までの角度に合うものから選び、直前 (last) と同じ移り方は、ほかがあれば選ばない。
// 日の出や夜の街明かりを必ず見せる決まりはなく、選ばれた区間がたまたま昼と夜の境目を越えれば見える
export function pickDemoLeg(
  from: LonLat | null,
  sun: LonLat,
  recent: string[],
  last: DemoWay | null,
  random: () => number = Math.random,
): DemoLeg {
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
  const suitable = CITIES.filter((place) => {
    const elevation = sunElevation(place, sun);
    return elevation >= DAY_MIN_ELEVATION || elevation <= NIGHT_MAX_ELEVATION;
  });
  const candidates = suitable.length > 0 ? suitable : CITIES;
  const fresh = candidates.filter((place) => !recent.includes(place.name));
  const pool = fresh.length > 0 ? fresh : candidates;

  let leg: DemoLeg;
  if (!from) {
    leg = { place: pick(pool), way: 'descend' };
  } else {
    const arc: DemoPlace[] = [];
    const globe: DemoPlace[] = [];
    const cruise: { place: DemoPlace; coverage: number }[] = [];
    for (const place of pool) {
      const separation = separationDegrees(place, from);
      if (within(separation, ARC_DEGREES)) arc.push(place);
      if (separation >= GLOBE_MIN_DEGREES) globe.push(place);
      if (within(separation, CRUISE_DEGREES)) {
        const coverage = cruiseCoverage(from, place);
        if (coverage >= CRUISE_MIN_COVERAGE) cruise.push({ place, coverage });
      }
    }
    const possible = (['arc', 'cruise', 'globe'] as const).filter((way) => ({ arc, cruise, globe })[way].length > 0);
    const varied = possible.filter((way) => way !== last);
    const ways = varied.length > 0 ? varied : possible;
    // どの移り方も合わない (見頃の都市がすぐ近くにしかない) ときは、弧で移る
    const way = ways.length > 0 ? pick(ways) : 'arc';
    if (way === 'cruise') {
      cruise.sort((a, b) => b.coverage - a.coverage);
      leg = { place: pick(cruise.slice(0, CRUISE_CHOICES)).place, way };
    } else if (way === 'globe') {
      leg = { place: pick(globe), way };
    } else {
      leg = { place: pick(arc.length > 0 ? arc : pool), way };
    }
  }
  recent.unshift(leg.place.name);
  recent.length = Math.min(recent.length, RECENT_LIMIT);
  return leg;
}
