// 取得中の知らせ (下の中央)。すぐ終わる取得でちらつかないよう、少し待ってから出す
import { el } from './dom.ts';

export const LOADING_SHOW_DELAY_MS = 400;

type Timers = {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
};

// 出している知らせの一覧を持つ。表示は render に任せるので、DOM なしで試せる
export class LoadingTracker {
  private nextId = 0;
  private readonly visible = new Map<number, string>();
  private readonly render: (texts: string[]) => void;
  private readonly timers: Timers;
  private readonly delayMs: number;

  constructor(
    render: (texts: string[]) => void,
    timers: Timers = {
      set: (fn, ms) => window.setTimeout(fn, ms),
      clear: (id) => window.clearTimeout(id),
    },
    delayMs = LOADING_SHOW_DELAY_MS,
  ) {
    this.render = render;
    this.timers = timers;
    this.delayMs = delayMs;
  }

  // 取得を始めたときに呼び、返した関数を終わったときに呼ぶ (何度呼んでもよい)
  start(text: string): () => void {
    const id = this.nextId++;
    let ended = false;
    const timer = this.timers.set(() => {
      if (ended) return;
      this.visible.set(id, text);
      this.update();
    }, this.delayMs);
    return () => {
      if (ended) return;
      ended = true;
      this.timers.clear(timer);
      if (this.visible.delete(id)) this.update();
    };
  }

  // 終わるまで知らせを出す
  async track<T>(text: string, work: Promise<T>): Promise<T> {
    const done = this.start(text);
    try {
      return await work;
    } finally {
      done();
    }
  }

  private update(): void {
    this.render([...this.visible.values()]);
  }
}

function renderLoading(texts: string[]): void {
  const box = el('loading-status');
  box.replaceChildren(...texts.map((text) => {
    const item = document.createElement('div');
    item.className = 'loading-item';
    item.textContent = text;
    return item;
  }));
  box.hidden = texts.length === 0;
}

let shared: LoadingTracker | null = null;

export function loadingStatus(): LoadingTracker {
  shared ??= new LoadingTracker(renderLoading);
  return shared;
}
