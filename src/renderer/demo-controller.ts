// デモの進行と、始める、終わるの操作。都市と着いたときのカメラは demo.ts、次の都市と移り方は demo-leg.ts で決める
import {
  DEMO_GLOBE_HOLD_SECONDS,
  DEMO_GLOBE_SECONDS,
  DEMO_HOME_SECONDS,
  DEMO_LEGS_PER_LOOP,
  DEMO_MODE,
  DEMO_STAY_SECONDS,
  demoArrival,
  type DemoPlace,
} from './demo';
import { pickDemoLeg, type DemoWay } from './demo-leg';
import { el } from './dom';
import type { GlobeController } from './globe-view';

const DEMO_HINT_MS = 4000;

// 地球の全景と設定地点を見せたあと、都市から都市へ、弧、低い高さの巡航、全景まで引く、のどれかで移っては旋回する。
// 操作すると終わり、元のモードと視点へ戻す
export function initDemo(
  globe: GlobeController,
  modes: { get(): MapMode; apply(mode: MapMode): void },
  views: { get(): GlobeView; show(view: GlobeView): void },
  weather: { hasHome(): boolean; showHome(): void; showCity(news: NewsReport): void; backToNow(): void },
): void {
  const start = el<HTMLButtonElement>('start-demo');
  const caption = el('demo-caption');
  const hint = el('demo-hint');
  let restore: { mode: MapMode; view: GlobeView } | null = null;
  let timer = 0;
  let hintTimer = 0;
  // 次に行う動き。それぞれ、次の動きまで待つ秒数を返す。空になったら次の区間 (か始めの全景) を足す
  let steps: (() => number)[] = [];
  let legs = 0; // 始めてから足した区間の数 (始めの全景も 1 つと数える)
  let lastWay: DemoWay | null = null;
  let stoppedByStartButton = false;
  let cityRequest = 0;
  const recent: string[] = [];

  function showCaption(text: string): void {
    caption.textContent = text;
    caption.hidden = !text;
  }

  // 天気が届くまでと取得できないときは、どの都市を見ているかを字幕で示す
  function showCity(place: DemoPlace): void {
    const request = ++cityRequest;
    showCaption(place.name);
    window.weatherApi
      .getPlaceNews(place.name, place.lat, place.lon)
      .then((news) => {
        if (request !== cityRequest) return;
        weather.showCity(news);
        showCaption('');
      })
      .catch((err) => {
        console.error('city weather failed', place.name, err);
        if (request === cityRequest) showCaption(`${place.name}(天気を取得できませんでした)`);
      });
  }

  function showHomeWeather(): void {
    cityRequest++;
    weather.showHome();
    globe.setMarker();
    showCaption('');
  }

  function show(view: GlobeView): void {
    modes.apply(DEMO_MODE);
    views.show(view);
  }

  // 始めの全景 (昼側) と設定地点。設定地点がなければ全景だけで、続く区間で都市へ降りる
  function opening(): (() => number)[] {
    const globeScene = (): number => {
      show('globe');
      showHomeWeather();
      globe.demoGlobe('dayside');
      return DEMO_GLOBE_SECONDS;
    };
    const homeScene = (): number => {
      show('region');
      showHomeWeather();
      globe.demoRegion();
      return DEMO_HOME_SECONDS;
    };
    return weather.hasHome() ? [globeScene, homeScene] : [globeScene];
  }

  // 次の都市へ移って旋回する。左上のパネルは、移り始めたときから行き先の都市の天気にする
  function leg(): (() => number)[] {
    const from = globe.demoCenter();
    const { place, way } = pickDemoLeg(from, globe.sunLonLat(), recent, lastWay);
    lastWay = way;
    const head = (): void => {
      globe.setMarker(place);
      showCity(place);
    };
    if (way === 'globe') {
      return [
        () => {
          show('globe');
          head();
          return globe.demoGlobe(place, DEMO_GLOBE_HOLD_SECONDS) + DEMO_GLOBE_HOLD_SECONDS;
        },
        () => {
          show('region');
          return globe.demoRegion(place, demoArrival(null, place)) + DEMO_STAY_SECONDS;
        },
      ];
    }
    return [
      () => {
        show('region');
        head();
        const seconds = way === 'cruise' ? globe.demoCruise(place) : globe.demoRegion(place, demoArrival(from, place));
        return seconds + DEMO_STAY_SECONDS;
      },
    ];
  }

  function runStep(): void {
    if (steps.length === 0) {
      if (legs % (DEMO_LEGS_PER_LOOP + 1) === 0) steps = opening();
      else steps = leg();
      legs++;
    }
    const seconds = steps.shift()!();
    timer = window.setTimeout(runStep, seconds * 1000 * window.__weatherGlobeDebug.demoTimeScale);
  }

  function wake(): void {
    document.body.classList.remove('demo-idle');
    hint.hidden = false;
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      document.body.classList.add('demo-idle');
      hint.hidden = true;
    }, DEMO_HINT_MS);
  }

  function stop(): void {
    if (!restore) return;
    const { mode, view } = restore;
    restore = null;
    window.clearTimeout(timer);
    window.clearTimeout(hintTimer);
    window.removeEventListener('pointerdown', onInput, true);
    window.removeEventListener('wheel', onInput, true);
    window.removeEventListener('keydown', onInput, true);
    window.removeEventListener('mousemove', wake);
    document.body.classList.remove('demo', 'demo-idle');
    start.setAttribute('aria-pressed', 'false');
    start.setAttribute('aria-label', 'デモを再生');
    start.title = 'デモを再生';
    showHomeWeather();
    hint.hidden = true;
    globe.setDemoMotion(false);
    modes.apply(mode);
    views.show(view);
    if (view === 'solar') {
      globe.setView('solar');
      return;
    }
    if (view === 'region') globe.setView('region');
    else globe.demoGlobe();
    globe.returnToLocation();
  }

  // 地球の操作やキー操作で終わる。スクリーンショットと録画 (F12)、動画用サイズ (F11)、操作の一覧 (?)、
  // パネルの開閉やスクロール、音楽の操作では終わらない
  function onInput(event: Event): void {
    if (event instanceof KeyboardEvent && ['F12', 'F11', '?'].includes(event.key)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#panels, #detail-panel, #screenshot-toast, #music-toggle, #music-popup, #open-help, #key-help')) return;
    if (target?.closest('#start-demo')) stoppedByStartButton = true; // 続く click で再開しない
    // 右上や右下のボタンはそのまま働かせる。地球は触った操作をドラッグとして始めない
    if (!(event instanceof KeyboardEvent) && target?.closest('button')) {
      stop();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    stop();
  }

  start.addEventListener('click', () => {
    if (stoppedByStartButton) {
      stoppedByStartButton = false;
      return;
    }
    if (restore) return;
    weather.backToNow();
    restore = { mode: modes.get(), view: views.get() };
    steps = [];
    legs = 0;
    lastWay = null;
    start.blur();
    start.setAttribute('aria-pressed', 'true');
    start.setAttribute('aria-label', 'デモを停止');
    start.title = 'デモを停止';
    document.body.classList.add('demo');
    globe.setDemoMotion(true);
    window.addEventListener('pointerdown', onInput, true);
    window.addEventListener('wheel', onInput, { capture: true, passive: false });
    window.addEventListener('keydown', onInput, true);
    window.addEventListener('mousemove', wake);
    wake();
    runStep();
  });
}
