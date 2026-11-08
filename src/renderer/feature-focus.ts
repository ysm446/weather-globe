// 地形の名前 (川、湖、範囲) をクリックしたときにカメラを寄せる、その位置を求めるための点を選ぶ。
// 寄せ方そのものはツアーと同じ frameRegionView (region-camera.ts) で、クリックのたびに全体が見える位置へ動かす
import type { LonLat } from './math.ts';

export const FOCUS_MAX_POINTS = 400; // カメラの計算に使う点の数の上限 (長い川は点が多い)

// 平らな [lon, lat, ...] の並びの集まりから、最大 max 個の点を等間隔に選ぶ
export function samplePoints(lines: number[][], max = FOCUS_MAX_POINTS): LonLat[] {
  const total = lines.reduce((sum, line) => sum + Math.floor(line.length / 2), 0);
  const stride = Math.max(1, Math.ceil(total / max));
  const out: LonLat[] = [];
  let index = 0;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i += 2, index++) {
      if (index % stride === 0) out.push({ lon: line[i], lat: line[i + 1] });
    }
  }
  return out;
}
