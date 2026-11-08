// 地域ビューの上部中央に出す方位テープ。向いている方角を中央の ▲ に合わせ、目盛りを横に流す。
// 太陽などの方角に印を付ける。テープの外の方角にある印は、端に寄せて矢印を付ける
import { el } from './dom';
import { wrapDegrees } from './math';

const SPAN_DEGREES = 120; // テープに見せる範囲 (左右 60° ずつ)
const TICK_DEGREES = 15;
const LABEL_DEGREES = 45;
const LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const EDGE_MARGIN_DEGREES = 6; // この分だけ端より内側を越えた方角の印は、端に寄せて矢印を付ける
const MARKER_PADDING = 6; // 印とテープの端の間 (px)。style.css の .edge-left と .edge-right と揃える
// 目盛りは -180° から 540° まで並べる。0〜360° のどの方角を中央にしても、左右 60° が並びの中に収まる
const STRIP_START = -180;
const STRIP_END = 540;

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
}

export interface TapeMarker {
  bearing: number; // 0 が北、90 が東
  icon: string; // SVG の文字列
  label?: string;
  className?: string;
  dim?: boolean;
}

// テープに出している印の要素と、最後に書いた中身 (変わったときだけ書き換える)
interface MarkerNode {
  element: HTMLDivElement;
  html: string;
  classes: string;
  left: string;
  width: number; // 要素の幅 (px)。中身が変わるまで測り直さない。0 は未計測
}

export class HeadingTape {
  private readonly root = el('heading-tape');
  private readonly strip = document.createElement('div');
  private readonly markerLayer = document.createElement('div');
  private readonly nodes: MarkerNode[] = [];
  private shown = false;
  private width = 0; // テープの幅 (px)。0 は未計測
  private degreePixels = 0;
  private stripTransform = '';

  constructor() {
    new ResizeObserver(() => {
      this.width = 0;
      for (const node of this.nodes) node.width = 0;
    }).observe(this.root);
    this.strip.className = 'tape-strip';
    for (let degrees = STRIP_START; degrees <= STRIP_END; degrees += TICK_DEGREES) {
      const tick = document.createElement('div');
      const major = degrees % LABEL_DEGREES === 0;
      tick.className = major ? 'tape-tick major' : 'tape-tick';
      tick.style.setProperty('--at', String(degrees - STRIP_START));
      if (major) tick.dataset.label = LABELS[(((degrees / LABEL_DEGREES) % 8) + 8) % 8];
      this.strip.append(tick);
    }
    this.markerLayer.className = 'tape-markers';
    // 目盛りは窓の中で動かし、窓の左右をぼかす (印はぼかさない)
    const frame = document.createElement('div');
    frame.className = 'tape-window';
    frame.append(this.strip);
    this.root.append(frame, this.markerLayer);
  }

  setVisible(visible: boolean): void {
    if (visible === this.shown) return;
    this.shown = visible;
    this.root.classList.toggle('visible', visible);
  }

  get visible(): boolean {
    return this.shown;
  }

  // 毎フレーム呼ぶ。印の要素は使い回し、中身や位置が変わったときだけ DOM に書く。
  // 以前は毎フレーム innerHTML を作り直してから幅を測っていたため、毎フレーム再レイアウトが走り、巡航中の CPU 時間の 2 割を占めていた
  update(heading: number, markers: TapeMarker[]): void {
    // 幅は大きさが変わったとき (ResizeObserver) だけ測り直す
    const width = this.width || (this.width = this.root.clientWidth);
    if (width === 0) return;
    const degreePixels = width / SPAN_DEGREES;
    if (degreePixels !== this.degreePixels) {
      this.degreePixels = degreePixels;
      this.root.style.setProperty('--deg', `${degreePixels}px`);
    }
    const center = ((heading % 360) + 360) % 360;
    const stripTransform = `translateX(${(width / 2 - (center - STRIP_START) * degreePixels).toFixed(2)}px)`;
    if (stripTransform !== this.stripTransform) {
      this.stripTransform = stripTransform;
      this.strip.style.transform = stripTransform;
    }

    const half = SPAN_DEGREES / 2 - EDGE_MARGIN_DEGREES;
    while (this.nodes.length > markers.length) this.nodes.pop()!.element.remove();
    markers.forEach(({ bearing, icon, label, className, dim }, index) => {
      let node = this.nodes[index];
      if (!node) {
        node = { element: document.createElement('div'), html: '', classes: '', left: '', width: 0 };
        this.markerLayer.append(node.element);
        this.nodes.push(node);
      }
      const offset = wrapDegrees(bearing - heading);
      const side = offset > half ? 'right' : offset < -half ? 'left' : null;
      const text = label ? `<span>${escapeHtml(label)}</span>` : '';
      const arrow = side ? `<span class="tape-arrow">${side === 'left' ? '◀' : '▶'}</span>` : '';
      const html = side === 'left' ? arrow + icon + text : icon + text + arrow;
      if (html !== node.html) {
        node.html = html;
        node.element.innerHTML = html;
        node.width = 0; // 中身が変わったので幅を測り直す
      }
      const classes = ['tape-marker', className, dim ? 'dim' : null, side ? `edge-${side}` : null].filter(Boolean).join(' ');
      if (classes !== node.classes) {
        node.classes = classes;
        node.element.className = classes;
      }
      // テープの外の方角にある印は、文字がはみ出さないよう端に揃えて置く (CSS の .edge-left と .edge-right)。
      // 端の近くにある長い印も、テープの中に収まるようにずらす
      let left = '';
      if (!side) {
        if (node.width === 0) node.width = node.element.offsetWidth;
        const halfWidth = node.width / 2 + MARKER_PADDING;
        const x = Math.min(Math.max(width / 2 + offset * degreePixels, halfWidth), width - halfWidth);
        left = `${x.toFixed(1)}px`;
      }
      if (left !== node.left) {
        node.left = left;
        node.element.style.left = left;
      }
    });
  }
}
