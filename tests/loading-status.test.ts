// 取得中の知らせの出し方の検証。実行: node --test tests/loading-status.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LoadingTracker } from '../src/renderer/loading-status.ts';

// 手で進める時計
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    set: (fn: () => void, ms: number) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (id: number) => void pending.delete(id),
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...pending]) {
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
      }
    },
  };
}

function setup() {
  const timers = fakeTimers();
  const renders: string[][] = [];
  const tracker = new LoadingTracker((texts) => renders.push(texts), timers, 400);
  return { timers, renders, tracker };
}

test('すぐ終わる取得は出さない', () => {
  const { timers, renders, tracker } = setup();
  const done = tracker.start('雲の情報を取得しています…');
  timers.advance(300);
  done();
  timers.advance(500);
  assert.deepEqual(renders, []);
});

test('待ってから出し、終わると消す', () => {
  const { timers, renders, tracker } = setup();
  const done = tracker.start('雲の情報を取得しています…');
  timers.advance(400);
  assert.deepEqual(renders.at(-1), ['雲の情報を取得しています…']);
  done();
  assert.deepEqual(renders.at(-1), []);
});

test('複数の取得を並べ、終わったものだけ消す', () => {
  const { timers, renders, tracker } = setup();
  const clouds = tracker.start('雲');
  const city = tracker.start('東京');
  timers.advance(400);
  assert.deepEqual(renders.at(-1), ['雲', '東京']);
  clouds();
  clouds(); // 二度呼んでも変わらない
  assert.deepEqual(renders.at(-1), ['東京']);
  assert.equal(renders.length, 3);
  city();
  assert.deepEqual(renders.at(-1), []);
});

test('track は失敗しても知らせを消す', async () => {
  const { timers, renders, tracker } = setup();
  let reject!: (err: Error) => void;
  const work = tracker.track('風', new Promise<void>((_, r) => { reject = r; }));
  timers.advance(400);
  assert.deepEqual(renders.at(-1), ['風']);
  reject(new Error('failed'));
  await assert.rejects(work);
  assert.deepEqual(renders.at(-1), []);
});
