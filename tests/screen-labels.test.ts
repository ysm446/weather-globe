// 地球の上の名前に共通の処理の検証。実行: node --test tests/screen-labels.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelAt, rankAtAltitude } from '../src/renderer/screen-labels.ts';

test('rankAtAltitude は高さがその下限以上の最初の段の重要度を返し、どの段にも届かなければ最後の段', () => {
  const table = [
    [1.4, 1],
    [0.7, 2],
    [0, 6],
  ] as const;
  assert.equal(rankAtAltitude(table, 2), 1);
  assert.equal(rankAtAltitude(table, 1.4), 1);
  assert.equal(rankAtAltitude(table, 1), 2);
  assert.equal(rankAtAltitude(table, 0.1), 6);
  assert.equal(rankAtAltitude(table, -1), 6);
});

test('labelAt は出ている名前のうち、点を含む (4px の余白込み) 最初のものを返す', () => {
  const make = (x: number, shown: boolean) => ({ element: {} as HTMLElement, box: { x, y: 10, width: 50, height: 20 }, transform: '', shown, far: false, farSince: 0, width: 50, height: 20 });
  const hidden = make(0, false);
  const first = make(0, true);
  const second = make(30, true);
  const labels = [hidden, first, second];
  assert.equal(labelAt(labels, 40, 20), first); // 重なる所は先に置いたもの
  assert.equal(labelAt(labels, 70, 20), second);
  assert.equal(labelAt(labels, -3, 20), first); // 余白
  assert.equal(labelAt(labels, 100, 20), null);
  assert.equal(labelAt([make(0, true) && { ...first, box: null }], 10, 20), null);
});
