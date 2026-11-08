// 計算の共通部品。DOM と Three.js に依存しない。
// node --test が直接読むファイルからは、拡張子付き ('./math.ts') で import する
export const DEG = Math.PI / 180;
export const KM_PER_DEGREE = 111.2; // 地表の緯度 1 度の長さ (km)。経度は緯度の余弦で縮める

export type Vec3 = readonly [number, number, number];

export interface LonLat {
  lat: number;
  lon: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// -180 以上 180 未満へ折り返す
export function wrapDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

// 動き始めと終わりをなめらかにする。t は 0〜1
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  return easeInOut(clamp((x - edge0) / (edge1 - edge0), 0, 1));
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// 経度と緯度から、地球の中心を原点とした単位ベクトル。globe.ts の lonLatToVector3 (Three.js 版) と同じ座標系で、
// 球のテクスチャの左端 (u=0) が経度 -180 度にあたる
export function lonLatToUnit(lon: number, lat: number): Vec3 {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  return [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
}

// a から b へ大円に沿って向かうときの、a での方角 (度。0 が北、90 が東、0 以上 360 未満)
export function bearingDegrees(a: LonLat, b: LonLat): number {
  const [lat1, lat2] = [a.lat * DEG, b.lat * DEG];
  const dLon = (b.lon - a.lon) * DEG;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

// 球面上の 2 点の角度
export function separationDegrees(a: LonLat, b: LonLat): number {
  const cosine =
    Math.sin(a.lat * DEG) * Math.sin(b.lat * DEG) +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos((a.lon - b.lon) * DEG);
  return Math.acos(clamp(cosine, -1, 1)) / DEG;
}
