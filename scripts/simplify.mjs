// 線と輪の点を間引く (ビルド用のスクリプトで共有する)。build-highlights.mjs の simplify と同じ式
// Douglas-Peucker 法。points は [lon, lat] の並び、tolerance は度
export function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let farthest = -1;
    let distance = tolerance;
    for (let i = first + 1; i < last; i++) {
      // 閉じた輪では始点と終点が同じで基準の線がないので、始点からの距離で測る
      const d =
        length < 1e-9
          ? Math.hypot(points[i][0] - ax, points[i][1] - ay)
          : Math.abs(dy * (points[i][0] - ax) - dx * (points[i][1] - ay)) / length;
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
