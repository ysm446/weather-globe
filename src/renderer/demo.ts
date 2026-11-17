// デモの場面の順番と行き先。画面の計算から切り離して検証できるよう、DOM に依存しない
import { bearingDegrees, clamp, DEG, separationDegrees, wrapDegrees, type LonLat } from './math.ts';

export interface DemoPlace extends LonLat {
  name: string;
}

export interface DemoScene {
  mode: MapMode;
  view: GlobeView;
  place?: 'home' | DemoPlaceKind;
  cruise?: DemoCruiseKind; // 低い高さで昼と夜の境目を越えて飛ぶ
  dayside?: boolean; // 雲や海の反射が見えるよう、地域ビューから昼側へ移って回る
  seconds: number;
}

export type DemoPlaceKind = 'day' | 'night' | 'city';
export type DemoCruiseKind = 'night' | 'day'; // night は昼から夜へ、day は夜から昼へ (日の出)

// 今の様子を見せたいので、すべての場面で雲を出す。
// 地域ビューの場面が続くときは、地球ビューへ戻らずに弧を描いて次の場所へ移る
export const DEMO_SCENES: DemoScene[] = [
  { mode: 'weather', view: 'globe', dayside: true, seconds: 20 },
  { mode: 'weather', view: 'region', place: 'home', seconds: 20 },
  { mode: 'weather', view: 'region', place: 'day', seconds: 25 },
  { mode: 'weather', view: 'region', cruise: 'night', seconds: 40 },
  { mode: 'weather', view: 'region', place: 'night', seconds: 25 },
  { mode: 'weather', view: 'region', cruise: 'day', seconds: 40 },
];

// 世界の都市。デモの行き先と、地球儀のラベルに使う。ラベルが重なるときは前の都市を優先する
export const CITIES: DemoPlace[] = [
  { name: '東京', lat: 35.7, lon: 139.7 },
  { name: 'ソウル', lat: 37.6, lon: 127 },
  { name: '上海', lat: 31.2, lon: 121.5 },
  { name: '香港', lat: 22.3, lon: 114.2 },
  { name: 'シンガポール', lat: 1.4, lon: 103.8 },
  { name: 'バンコク', lat: 13.8, lon: 100.5 },
  { name: 'デリー', lat: 28.6, lon: 77.2 },
  { name: 'ムンバイ', lat: 19.1, lon: 72.9 },
  { name: 'ドバイ', lat: 25.2, lon: 55.3 },
  { name: 'イスタンブール', lat: 41, lon: 29 },
  { name: 'カイロ', lat: 30, lon: 31.2 },
  { name: 'モスクワ', lat: 55.8, lon: 37.6 },
  { name: 'パリ', lat: 48.9, lon: 2.4 },
  { name: 'ロンドン', lat: 51.5, lon: -0.1 },
  { name: 'ローマ', lat: 41.9, lon: 12.5 },
  { name: 'ベルリン', lat: 52.5, lon: 13.4 },
  { name: 'ラゴス', lat: 6.5, lon: 3.4 },
  { name: 'ナイロビ', lat: -1.3, lon: 36.8 },
  { name: 'ケープタウン', lat: -33.9, lon: 18.4 },
  { name: 'ニューヨーク', lat: 40.7, lon: -74 },
  { name: 'シカゴ', lat: 41.9, lon: -87.6 },
  { name: 'ロサンゼルス', lat: 34, lon: -118.2 },
  { name: 'バンクーバー', lat: 49.3, lon: -123.1 },
  { name: 'メキシコシティ', lat: 19.4, lon: -99.1 },
  { name: 'ハバナ', lat: 23.1, lon: -82.4 },
  { name: 'リマ', lat: -12, lon: -77 },
  { name: 'サンパウロ', lat: -23.5, lon: -46.6 },
  { name: 'ブエノスアイレス', lat: -34.6, lon: -58.4 },
  { name: 'シドニー', lat: -33.9, lon: 151.2 },
  { name: 'オークランド', lat: -36.9, lon: 174.8 },
  { name: 'ホノルル', lat: 21.3, lon: -157.9 },
];

const DAY_MIN_ELEVATION = 15; // 太陽がこれより高ければ、地表がよく見える
const NIGHT_MAX_ELEVATION = -6; // 太陽がこれより低ければ、街明かりがはっきり見える
const RECENT_LIMIT = 5; // 同じ場所が続かないよう、最近行った場所を避ける
// 今いる場所からこの範囲 (度) の都市を優先する。近すぎると弧にならず、遠すぎると移動が長い
const HOP_MIN_DEGREES = 15;
const HOP_MAX_DEGREES = 70;

export function sunElevation(place: LonLat, sun: LonLat): number {
  return 90 - separationDegrees(place, sun);
}

// 昼や夜の都市は、今の太陽で見頃の都市からランダムに選ぶ。recent は新しい順で、選んだ場所を先頭に足す。
// near を渡すと、そこから程よく離れた都市があればその中から選ぶ
export function pickDemoPlace(
  kind: DemoPlaceKind,
  sun: LonLat,
  recent: string[],
  random: () => number = Math.random,
  near?: LonLat,
): DemoPlace {
  const suitable = CITIES.filter((place) => {
    if (kind === 'day') return sunElevation(place, sun) >= DAY_MIN_ELEVATION;
    return kind === 'city' || sunElevation(place, sun) <= NIGHT_MAX_ELEVATION;
  });
  const candidates = suitable.length > 0 ? suitable : CITIES;
  const fresh = candidates.filter((place) => !recent.includes(place.name));
  const unvisited = fresh.length > 0 ? fresh : candidates;
  const reachable = near
    ? unvisited.filter((place) => {
        const separation = separationDegrees(place, near);
        return separation >= HOP_MIN_DEGREES && separation <= HOP_MAX_DEGREES;
      })
    : [];
  const pool = reachable.length > 0 ? reachable : unvisited;
  const place = pool[Math.floor(random() * pool.length)];
  recent.unshift(place.name);
  recent.length = Math.min(recent.length, RECENT_LIMIT);
  return place;
}

// 都市に着いたときのカメラ。from (今いる場所) から移るときは、進んできた向きのまま着く。
// 飛行は緯度と経度をそれぞれ補間するので、進む向きは着く地点での緯度と経度の差から求める。
// 傾きと距離は場面ごとに少し変える
export function demoArrival(
  from: LonLat | null,
  to: LonLat,
  random: () => number = Math.random,
): { heading: number; tilt: number; distance: number } {
  const east = from ? wrapDegrees(to.lon - from.lon) * Math.cos(to.lat * DEG) : 0;
  const north = from ? to.lat - from.lat : 1;
  return {
    heading: wrapDegrees(Math.atan2(east, north) / DEG),
    tilt: 56 + 10 * random(),
    distance: 0.19 + 0.06 * random(),
  };
}

const ISS_INCLINATION = 51.6; // 国際宇宙ステーションの軌道の傾き (度)。地上の軌跡の向きを合わせる
// 巡航を始めるときの、画面の中心の地点での太陽の高度 (度)。
// 夜へ向かうときは境目の少し手前から。昼へ向かうときはカメラが中心より約 10 度後ろにあるので、
// 太陽がまだ地平線の下にある所から始め、途中で地平線から昇らせる
const CRUISE_START_ELEVATION: Record<DemoCruiseKind, number> = { night: 12, day: -20 };
const CRUISE_LATITUDES = [-40, -30, -20, -10, 0, 10, 20, 30, 40];
const CRUISE_LATITUDE_JITTER = 10; // 毎回同じ所を飛ばないよう、緯度をこの幅 (度) でずらす

// 巡航の出発点 (画面の中心の地点) と向き。今の太陽の位置から、昼と夜の境目を越える道を求める。
// ISS と同じく東へ進むので、夜へは夕方の側、昼へは朝の側の境目を越える。
// near を渡すと、そこに一番近い出発点を選ぶ
export function demoCruiseStart(
  kind: DemoCruiseKind,
  sun: LonLat,
  near: LonLat | null,
  random: () => number = Math.random,
): { lat: number; lon: number; heading: number } {
  const fromSun = (90 - CRUISE_START_ELEVATION[kind]) * DEG;
  const jitter = (random() - 0.5) * CRUISE_LATITUDE_JITTER;
  const starts = CRUISE_LATITUDES.map((base) => {
    const lat = base + jitter;
    // 太陽の真下の地点から fromSun だけ離れた円と、この緯度の線が交わる経度
    const cosHour =
      (Math.cos(fromSun) - Math.sin(lat * DEG) * Math.sin(sun.lat * DEG)) / (Math.cos(lat * DEG) * Math.cos(sun.lat * DEG));
    const hour = Math.acos(clamp(cosHour, -1, 1)) / DEG;
    return { lat, lon: wrapDegrees(sun.lon + (kind === 'night' ? hour : -hour)) };
  });
  const start = near
    ? starts.reduce((best, next) => (separationDegrees(next, near) < separationDegrees(best, near) ? next : best))
    : starts[Math.floor(random() * starts.length)];
  // この緯度での軌跡の向きは、北東へ上る向きと南東へ下る向きの 2 つ。境目をより早く越えるほうを選ぶ
  const rising = Math.asin(clamp(Math.cos(ISS_INCLINATION * DEG) / Math.cos(start.lat * DEG), -1, 1)) / DEG;
  const toSun = bearingDegrees(start, sun);
  const goal = kind === 'day' ? toSun : toSun + 180;
  const off = (heading: number): number => Math.abs(wrapDegrees(heading - goal));
  return { ...start, heading: off(rising) <= off(180 - rising) ? rising : 180 - rising };
}
