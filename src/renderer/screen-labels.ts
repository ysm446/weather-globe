// 地球儀の上に出す名前 (都市名、国名、地形の名前) に共通の処理。画面上の位置の計算は label-layout.ts、
// ここは DOM の要素への書き込みと、カメラの高さによる絞り込み、マウスの下の名前の検出
import type * as THREE from 'three';
import type { LabelBox } from './label-layout';

// 地球の上の点を画面の位置 (CSS ピクセル) にする。地球の裏側やカメラの後ろにあるときは null
export type WorldToScreen = (world: THREE.Vector3) => { x: number; y: number } | null;

export interface ScreenLabel {
  element: HTMLElement;
  box: LabelBox | null; // 最後に置いた位置 (画面に出ないときは null)
  transform: string; // 最後に書いた transform (同じなら書かない)
  shown: boolean;
  far: boolean; // 画面に出る見込みがない (遠すぎる、地球の裏側) ので、レイアウトからも外している (.far = display: none)
  farSince: number; // 画面に出る見込みがなくなった時刻 (ms)。消える動き (CSS の transition) が終わってから far にする。0 は見込みがある
  width: number; // 文字の幅は変わらないので、最初に測って使い回す。0 は未計測
  height: number;
}

const FAR_DELAY_MS = 250; // 消える動き (opacity の transition は 150〜200ms) が終わるまで、レイアウトから外すのを待つ

// 名前の大きさを初めて使うときに測る。レイアウトから外している (.far) 間は測れないので、先に戻す
export function ensureMeasured(label: ScreenLabel): void {
  if (label.width !== 0) return;
  if (label.far) {
    label.far = false;
    label.element.classList.remove('far');
  }
  label.width = label.element.offsetWidth;
  label.height = label.element.offsetHeight;
}

// カメラの高さ (レンズの分を換算、地球の半径が 1) ごとの、出す名前の重要度の上限の表。
// [高さの下限, 重要度の上限] を高い順に並べ、高さがその下限以上なら、その重要度までを出す
export type RankTable = readonly (readonly [number, number])[];

export function rankAtAltitude(table: RankTable, altitude: number): number {
  return (table.find(([min]) => altitude >= min) ?? table[table.length - 1])[1];
}

// 配置の結果を要素に書く。transform と表示の切り替えは、変わったときだけ DOM に書く。
// 画面に出る見込みのない名前 (box が null。遠すぎるか地球の裏側) は display: none (.far) にしてレイアウトから外す。
// 2,000 近い名前を visibility: hidden のまま置いておくと、毎フレームの描画の準備 (PrePaint) とスタイル計算が重かった。
// 置けなかっただけの名前 (ほかの名前と重なった) は、次のフレームで出るかもしれないので visibility: hidden (.off) に留める。
// now は performance.now() (消える動きを待つのに使う)
export function applyLayout(labels: readonly ScreenLabel[], boxes: ReadonlyArray<LabelBox | null>, shown: readonly boolean[], now: number): void {
  for (let index = 0; index < labels.length; index++) {
    const label = labels[index];
    const box = boxes[index];
    label.box = box;
    // 位置は出している名前にだけ書く (インラインスタイルを書くたびにその要素のスタイル計算が走り、1 要素 8µs ほどかかる)。
    // 隠れている名前は、出すときに最後の位置と違えば書かれる
    if (box && shown[index]) {
      const transform = `translate(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px)`;
      if (transform !== label.transform) {
        label.transform = transform;
        label.element.style.transform = transform;
      }
    }
    if (shown[index] !== label.shown) {
      label.shown = shown[index];
      label.element.classList.toggle('off', !label.shown);
    }
    if (box) label.farSince = 0;
    else if (label.farSince === 0) label.farSince = now;
    const far = box === null && now - label.farSince >= FAR_DELAY_MS;
    if (far !== label.far) {
      label.far = far;
      label.element.classList.toggle('far', far);
    }
  }
}

// 今画面に出ている名前の範囲。あとから置く名前をこれに重ねないために使う
export function shownBoxes(labels: readonly ScreenLabel[]): LabelBox[] {
  const boxes: LabelBox[] = [];
  for (const label of labels) if (label.shown && label.box) boxes.push(label.box);
  return boxes;
}

const PICK_PAD = 4; // 名前の少し外側まで反応させる (px)

// 画面の点 (x, y) にある、出ている名前。重なっているときは先に置いた (重要な) 名前を選ぶ
export function labelAt<T extends ScreenLabel>(labels: readonly T[], x: number, y: number): T | null {
  for (const label of labels) {
    const box = label.box;
    if (
      label.shown && box !== null &&
      x >= box.x - PICK_PAD && x <= box.x + box.width + PICK_PAD && y >= box.y - PICK_PAD && y <= box.y + box.height + PICK_PAD
    ) {
      return label;
    }
  }
  return null;
}

// マウスを乗せている名前の .hover を付け替える。変わったときだけ DOM に触り、次の呼び出しに渡す値を返す
export function updateHover<T extends ScreenLabel>(previous: T | null, next: T | null): T | null {
  if (previous === next) return next;
  previous?.element.classList.remove('hover');
  next?.element.classList.add('hover');
  return next;
}
