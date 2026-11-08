// 点から輪郭 (線分の集まり) までの一番近い距離を速く求める。範囲の塗り (highlights.ts の buildFill) で、
// 塗りの頂点ごとに輪郭までの距離を測るのに使う。輪郭の辺を経度・緯度の格子に振り分け、点の近くの格子から順に調べる。
// 国のように辺が 1 万を超える形を、すべての辺と比べると画面が固まった (ロシアで十億回を超える計算になった)
const KM_PER_DEG = 111.2;

// 格子の番号 (i, j) を 1 つの数にする (文字列のキーは遅かった)。経度は続けた値 (±540 度まで) を使うので、i は ±数千に収まる
const cellKey = (i: number, j: number): number => (i + 50_000) * 100_000 + (j + 50_000);

export class EdgeIndex {
  private readonly cells = new Map<number, number[]>(); // 格子 (cellKey) → 辺の番号
  private readonly coords: Float64Array; // 辺ごとに x1, y1, x2, y2 (経度、緯度。度)
  private readonly cellDeg: number;
  private readonly capKm: number;

  // segments は [x1, y1, x2, y2] の並び。cellDeg は格子の大きさ (度)、capKm はこれより遠い距離を capKm とみなす上限
  // (node のテストで型を取り除くだけで読めるよう、引数のプロパティ宣言は使わない)
  constructor(segments: [number, number, number, number][], cellDeg = 0.5, capKm = 600) {
    this.cellDeg = cellDeg;
    this.capKm = capKm;
    this.coords = new Float64Array(segments.length * 4);
    segments.forEach((segment, index) => {
      this.coords.set(segment, index * 4);
      const [x1, y1, x2, y2] = segment;
      const i0 = Math.floor(Math.min(x1, x2) / cellDeg);
      const i1 = Math.floor(Math.max(x1, x2) / cellDeg);
      const j0 = Math.floor(Math.min(y1, y2) / cellDeg);
      const j1 = Math.floor(Math.max(y1, y2) / cellDeg);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const key = cellKey(i, j);
          const list = this.cells.get(key);
          if (list) list.push(index);
          else this.cells.set(key, [index]);
        }
      }
    });
  }

  // 点 (lon, lat) から一番近い辺までの距離 (km)。経度は緯度に合わせて縮める。capKm より遠ければ capKm
  distance(lon: number, lat: number): number {
    const k = Math.max(Math.cos((lat * Math.PI) / 180), 0.02);
    const ci = Math.floor(lon / this.cellDeg);
    const cj = Math.floor(lat / this.cellDeg);
    const cellKm = this.cellDeg * KM_PER_DEG; // 格子 1 つ分の南北の長さ。東西は k 倍に縮む
    const maxRing = Math.ceil(this.capKm / cellKm) + 1;
    let best = Infinity;
    let previousRx = -1;
    let previousRy = -1;
    for (let r = 0; r <= maxRing; r++) {
      // 南北に r 格子、東西は同じ距離になるよう 1/k 倍の格子まで広げる
      const ry = r;
      const rx = Math.ceil(r / k);
      for (let i = ci - rx; i <= ci + rx; i++) {
        for (let j = cj - ry; j <= cj + ry; j++) {
          if (Math.abs(i - ci) <= previousRx && Math.abs(j - cj) <= previousRy) continue; // 前の輪で調べた
          const list = this.cells.get(cellKey(i, j));
          if (!list) continue;
          for (const index of list) {
            const d = this.segmentKm(index, lon, lat, k);
            if (d < best) best = d;
          }
        }
      }
      previousRx = rx;
      previousRy = ry;
      // まだ調べていない格子は、少なくとも r 格子分 (南北の長さで) 離れている
      if (best <= r * cellKm || best <= 0) break;
    }
    return Math.min(best, this.capKm);
  }

  private segmentKm(index: number, lon: number, lat: number, k: number): number {
    const c = this.coords;
    const ax = (c[index * 4] - lon) * k;
    const ay = c[index * 4 + 1] - lat;
    const bx = (c[index * 4 + 2] - lon) * k;
    const by = c[index * 4 + 3] - lat;
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1e-12)));
    return Math.hypot(ax + dx * t, ay + dy * t) * KM_PER_DEG;
  }
}
