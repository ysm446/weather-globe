// デモの都市と、着いたときのカメラ。画面の計算から切り離して検証できるよう、DOM に依存しない。
// 次の都市と移り方は demo-leg.ts で選ぶ (cities.ts がこのファイルを読むので、分けている)
import { DEG, separationDegrees, wrapDegrees, type LonLat } from './math.ts';

export interface DemoPlace extends LonLat {
  name: string;
}

// デモは、始めに地球の全景と設定地点を見せ、そのあと都市から都市へ移る区間を繰り返す。
// 今の様子を見せたいので、ずっと天気モード (雲を出す) にする
export const DEMO_MODE: MapMode = 'weather';
export const DEMO_GLOBE_SECONDS = 20; // 始めの地球の全景 (昼側)
export const DEMO_HOME_SECONDS = 20; // 設定地点へ降りて旋回する時間 (降りる時間を含む)
export const DEMO_STAY_SECONDS = 15; // 都市に着いてから旋回する時間
export const DEMO_GLOBE_HOLD_SECONDS = 6; // 地球まで引く区間で、全景のまま地球が回るのを見せる時間
export const DEMO_LEGS_PER_LOOP = 6; // この数の区間を巡ったら、始めの全景と設定地点へ戻る

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

export function sunElevation(place: LonLat, sun: LonLat): number {
  return 90 - separationDegrees(place, sun);
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
