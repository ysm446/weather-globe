// 操作の一覧。右上の「?」のボタンか ? のキーで開く。
// キーを足したり変えたりしたときは、ここの一覧も直す (ほかの場所に一覧は持たない)
import { el } from './dom';

// keys は押すキーの組み合わせの並び。組み合わせの中のキーは + でつなぎ、並びは「/」で区切って出す
export type HelpRow = { keys: string[][]; action: string };
export type HelpSection = { title: string; rows: HelpRow[] };

const DRAG_LEFT = '左ドラッグ';
const DRAG_RIGHT = '右ドラッグ';
const WHEEL = 'ホイール';

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: '地球ビュー',
    rows: [
      { keys: [[DRAG_LEFT], [DRAG_RIGHT]], action: '地球を回す' },
      { keys: [[WHEEL]], action: '寄る・離れる' },
      { keys: [['W', 'A', 'S', 'D']], action: '押している間、北・西・南・東へ動く' },
      { keys: [['Q'], ['E']], action: '地球の回転 (1 回ごとに 1 段。E で東へ、Q で西へ)' },
      { keys: [['← ↑ ↓ →']], action: 'その向きの次の都市へ' },
    ],
  },
  {
    title: '地域ビュー (旋回モード)',
    rows: [
      { keys: [[DRAG_LEFT]], action: '中心を軸に回す・傾ける' },
      { keys: [[DRAG_RIGHT]], action: '中心を動かす' },
      { keys: [[WHEEL]], action: '中心へ寄る・離れる' },
      { keys: [['A'], ['D']], action: '押している間、方角を回す' },
      { keys: [['W'], ['S']], action: '押している間、傾きを変える' },
      { keys: [['Q'], ['E']], action: '中心のまわりの旋回 (1 回ごとに 1 段。E で右回り)' },
      { keys: [['← ↑ ↓ →']], action: 'その向きの次の都市へ' },
      { keys: [['V']], action: '巡航モードへ' },
    ],
  },
  {
    title: '地域ビュー (巡航モード)',
    rows: [
      { keys: [['W'], ['S']], action: '速く・遅く' },
      { keys: [['A'], ['D']], action: '押している間、向きを変える' },
      { keys: [['R'], ['F']], action: '押している間、上昇・下降' },
      { keys: [[DRAG_LEFT]], action: '見回す' },
      { keys: [[DRAG_RIGHT]], action: '動かす' },
      { keys: [['V']], action: '旋回モードへ' },
    ],
  },
  {
    title: '名前と地点',
    rows: [
      { keys: [['名前にカーソルを乗せる']], action: '都市、国、川、湖などの詳しい情報' },
      { keys: [['都市の名前をクリック']], action: 'その都市の天気を出して寄る' },
      { keys: [['国、川、湖、山脈などの名前をクリック']], action: '形を描く (地域ビューでは全体が見えるよう寄る)' },
      { keys: [['Esc']], action: '描いた形を消す・ツアーを終える' },
      { keys: [['左上の地点をクリック']], action: '設定した地点へ戻る' },
    ],
  },
  {
    title: '視点の保存',
    rows: [
      { keys: [['Ctrl', '1〜0']], action: '今の視点を保存する' },
      { keys: [['1〜0']], action: '保存した視点へ飛ぶ' },
    ],
  },
  {
    title: '撮影・録画',
    rows: [
      { keys: [['F12']], action: 'スクリーンショット (画面の画素のまま)' },
      { keys: [['Shift', 'F12']], action: 'スクリーンショット (表示倍率 100% の大きさ)' },
      { keys: [['Ctrl', 'F12']], action: '録画を始める・止める (音楽も入る)' },
      { keys: [['F11']], action: '動画用サイズ (1920×1080) にする・戻す。録画の前に使う' },
    ],
  },
  {
    title: 'そのほか',
    rows: [
      { keys: [['?']], action: 'この一覧を開く・閉じる' },
      { keys: [['Ctrl', 'R']], action: '画面を読み直す' },
    ],
  },
];

// 日本語の入ったもの (左ドラッグ、名前をクリックなど) はマウスの操作として、キーの枠を付けずに出す
const isMouse = (key: string): boolean => /[ぁ-んァ-ヶ一-龠]/.test(key);

function renderKeys(combos: string[][]): HTMLElement {
  const cell = document.createElement('dt');
  combos.forEach((combo, i) => {
    if (i > 0) cell.append(' / ');
    combo.forEach((key, j) => {
      if (j > 0) cell.append(key.length === 1 && combo[j - 1].length === 1 ? ' ' : ' + ');
      const item = document.createElement(isMouse(key) ? 'span' : 'kbd');
      item.textContent = key;
      cell.append(item);
    });
  });
  return cell;
}

function render(body: HTMLElement): void {
  for (const section of HELP_SECTIONS) {
    const block = document.createElement('section');
    const title = document.createElement('h3');
    title.className = 'settings-subhead';
    title.textContent = section.title;
    const list = document.createElement('dl');
    for (const row of section.rows) {
      const action = document.createElement('dd');
      action.textContent = row.action;
      list.append(renderKeys(row.keys), action);
    }
    block.append(title, list);
    body.append(block);
  }
}

export function initKeyHelp(): void {
  const dialog = el<HTMLDialogElement>('key-help');
  const button = el<HTMLButtonElement>('open-help');
  render(el('key-help-body'));

  function toggle(): void {
    if (dialog.open) dialog.close();
    else dialog.showModal();
  }
  button.addEventListener('click', () => {
    button.blur(); // フォーカスが残ると W/A/S/D などが効かないことがある
    toggle();
  });
  // 枠の外 (後ろの画面) を押したら閉じる
  dialog.addEventListener('click', (event) => {
    const box = dialog.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) dialog.close();
  });
  // 開いている間の Esc は閉じるだけにし、描いた形を消す・ツアーを終えるなどの操作に渡さない。
  // window の捕捉で先に受ける (閉じるのは dialog の標準の動き)
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && dialog.open) event.stopImmediatePropagation();
    },
    true,
  );
  // ? のキー。入力欄の操作中と、ほかの画面 (設定) を開いている間は受け付けない
  window.addEventListener('keydown', (event) => {
    if (event.key !== '?' || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, select, textarea, [contenteditable="true"]')) return;
    const other = document.querySelector('dialog[open]');
    if (other && other !== dialog) return;
    event.preventDefault();
    toggle();
  });
}
