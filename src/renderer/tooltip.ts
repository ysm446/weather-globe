// OS 標準のツールチップの代わりに、アプリのデザインのツールチップを出す。
// title 属性と SVG の <title> は、書かれた時点で外して data-tip へ移すので、OS のツールチップは出ない。
// 各所のコードは今までどおり title を書けばよい (あとから書き換えられても、すぐ移し直す)
const SHOW_DELAY_MS = 450; // すぐ出ると、ボタンの上を通り過ぎるだけで次々に出て目障り
const GAP = 8;
const EDGE = 8;

type TipElement = HTMLElement | SVGElement;

function setTip(element: TipElement, text: string): void {
  if (text) element.dataset.tip = text;
  else delete element.dataset.tip;
}

function takeTitleAttribute(element: TipElement): void {
  const title = element.getAttribute('title');
  if (title === null) return;
  element.removeAttribute('title');
  setTip(element, title);
  // 読み上げでは、名前のない要素は title が名前になるので、外した分を補う
  if (title && !element.hasAttribute('aria-label') && !element.textContent?.trim()) {
    element.setAttribute('aria-label', title);
  }
}

// SVG の <title> は親の要素の説明になる
function takeSvgTitle(title: SVGTitleElement): void {
  const parent = title.parentElement;
  if (parent instanceof SVGElement) setTip(parent, title.textContent?.trim() ?? '');
  title.remove();
}

function takeAll(root: Element): void {
  if (root.hasAttribute('title')) takeTitleAttribute(root as TipElement);
  if (root instanceof SVGTitleElement) {
    takeSvgTitle(root);
    return;
  }
  for (const element of Array.from(root.querySelectorAll<TipElement>('[title]'))) takeTitleAttribute(element);
  for (const title of Array.from(root.querySelectorAll<SVGTitleElement>('svg title'))) takeSvgTitle(title);
}

function tipTarget(target: EventTarget | null): TipElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<TipElement>('[data-tip]');
}

export function initTooltips(): void {
  const tip = document.createElement('div');
  tip.className = 'app-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let timer = 0;
  let anchor: TipElement | null = null;
  let pointerX = 0;
  let pointerY = 0;

  function show(element: TipElement): void {
    const text = element.dataset.tip;
    if (!text || !element.isConnected) return;
    // 設定画面などのモーダルは最前面の層にあるので、その中に置かないと隠れる
    const layer = element.closest('dialog[open]') ?? document.body;
    if (tip.parentElement !== layer) layer.append(tip);
    tip.textContent = text;
    tip.hidden = false;
    // 要素の下に出し、はみ出すなら上に出す
    const box = element.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    const hasBox = box.width > 0 && box.height > 0;
    const centerX = hasBox ? box.left + box.width / 2 : pointerX;
    const left = Math.min(Math.max(centerX - size.width / 2, EDGE), window.innerWidth - size.width - EDGE);
    const below = (hasBox ? box.bottom : pointerY) + GAP;
    const above = (hasBox ? box.top : pointerY) - GAP - size.height;
    const top = below + size.height <= window.innerHeight - EDGE ? below : above;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(Math.max(top, EDGE))}px`;
  }

  function hide(): void {
    window.clearTimeout(timer);
    timer = 0;
    anchor = null;
    tip.hidden = true;
  }

  document.addEventListener(
    'mouseover',
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      const element = tipTarget(event.target);
      if (element === anchor) return;
      hide();
      if (!element) return;
      anchor = element;
      timer = window.setTimeout(() => show(element), SHOW_DELAY_MS);
    },
    true,
  );
  document.addEventListener(
    'mouseout',
    (event) => {
      if (anchor && !anchor.contains(event.relatedTarget as Node | null)) hide();
    },
    true,
  );
  // 押したり、地球を回したり、キーを押したりしたら消す。OS のツールチップと同じ振る舞い
  for (const type of ['mousedown', 'wheel', 'keydown', 'blur']) {
    window.addEventListener(type, hide, true);
  }
  document.addEventListener('scroll', hide, true);

  // 今ある説明と、あとから書かれた説明をすぐ移す。マウスが乗ったまま書き換えられても OS のものは出ない
  takeAll(document.body);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        takeTitleAttribute(record.target as TipElement);
      } else {
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof Element) takeAll(node);
          else if (node.parentElement instanceof SVGTitleElement) takeSvgTitle(node.parentElement);
        }
        // SVG の <title> の文字だけを書き換えた場合
        if (record.target instanceof SVGTitleElement && record.target.isConnected) takeSvgTitle(record.target);
      }
    }
    // 出している説明が書き換わったときだけ出し直す (時計などの更新では何もしない)
    if (anchor && !tip.hidden && anchor.dataset.tip !== tip.textContent) {
      if (anchor.dataset.tip) show(anchor);
      else hide();
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
}
