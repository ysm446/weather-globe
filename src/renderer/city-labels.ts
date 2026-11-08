// 地球儀の上に出す都市のラベル。クリックするとその都市の天気に切り替わる
import * as THREE from 'three';
import { tierAtAltitude, type MapCity } from './cities';
import type { DemoPlace } from './demo';
import { lonLatToVector3 } from './globe';
import { placeLabels, type LabelBox } from './label-layout';
import { applyLayout, ensureMeasured, shownBoxes, type ScreenLabel, type WorldToScreen } from './screen-labels';

interface CityLabel extends ScreenLabel {
  place: MapCity;
  element: HTMLButtonElement;
  world: THREE.Vector3;
  dotX: number; // ラベルの左上から点の中心まで。点は文字のベースラインに合わせて置くので、箱の中央とは限らない
  dotY: number;
}

export class CityLabels {
  private readonly labels: CityLabel[];
  private excluded: string | null = null;
  private hoveredLabel: CityLabel | null = null; // マウスを乗せているラベル (詳しい情報の札を出す)

  constructor(
    private readonly container: HTMLElement,
    places: MapCity[],
    radius: number,
    onSelect: (place: DemoPlace) => void,
  ) {
    this.labels = places.map((place) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'city-label off';
      const dot = document.createElement('span');
      dot.className = 'city-dot';
      element.append(dot, place.name);
      // 説明は詳しい情報の札 (info-card.ts) に出すので、ツールチップ (title) は付けない
      element.setAttribute('aria-label', `${place.name}の天気を表示`);
      element.addEventListener('click', () => onSelect(place));
      container.append(element);
      const label: CityLabel = {
        place,
        element,
        world: lonLatToVector3(place.lon, place.lat, radius),
        width: 0,
        height: 0,
        dotX: 0,
        dotY: 0,
        transform: '',
        shown: false,
        far: false,
        farSince: 0,
        box: null,
      };
      element.addEventListener('mouseenter', () => (this.hoveredLabel = label));
      element.addEventListener('mouseleave', () => {
        if (this.hoveredLabel === label) this.hoveredLabel = null;
      });
      return label;
    });
  }

  // マウスを乗せている都市と、そのラベルの画面上の範囲。隠れているときは null。
  // 範囲は最後に置いた位置 (getBoundingClientRect は毎フレーム呼ぶとレイアウトを強制して遅かった)
  hovered(): { place: MapCity; box: LabelBox } | null {
    const label = this.hoveredLabel;
    if (!label || this.container.hidden || !label.shown || !label.box) return null;
    return { place: label.place, box: label.box };
  }

  setVisible(visible: boolean): void {
    this.container.hidden = !visible;
  }

  // 地点のマーカーが同じ名前を出している間は、ラベルを出さない
  setExcluded(name: string | null): void {
    this.excluded = name;
  }

  // 今画面に出ている都市。ラベルを隠している間は空
  shownPlaces(): MapCity[] {
    if (this.container.hidden) return [];
    return this.labels.filter((label) => label.shown).map((label) => label.place);
  }

  // 今画面に出ているラベルの範囲。国名をこれに重ねないために使う
  shownBoxes(): LabelBox[] {
    return this.container.hidden ? [] : shownBoxes(this.labels);
  }

  // 毎フレーム呼ぶ。blocked はラベルを重ねない範囲、altitude はレンズの分を換算したカメラの高さ
  update(toScreen: WorldToScreen, blocked: LabelBox[], altitude: number): void {
    if (this.container.hidden) return;
    const tier = tierAtAltitude(altitude);
    const boxes = this.labels.map((label): LabelBox | null => {
      if (label.place.tier > tier || label.place.name === this.excluded) return null;
      const point = toScreen(label.world);
      if (!point) return null;
      if (label.width === 0) {
        ensureMeasured(label);
        const dot = label.element.firstElementChild as HTMLElement;
        label.dotX = dot.offsetLeft + dot.offsetWidth / 2;
        label.dotY = dot.offsetTop + dot.offsetHeight / 2;
      }
      return { x: point.x - label.dotX, y: point.y - label.dotY, width: label.width, height: label.height };
    });
    applyLayout(this.labels, boxes, placeLabels(boxes, blocked), performance.now());
  }
}
