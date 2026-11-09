// 録画の大きさとビットレートの検証。実行: node --test tests/screen-recorder.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evenSize, videoBitrate } from '../src/renderer/screen-recorder.ts';

test('H.264 で書けるよう、縦横を偶数に切り下げる', () => {
  assert.equal(evenSize(1920), 1920);
  assert.equal(evenSize(1097.5), 1096);
  assert.equal(evenSize(1621), 1620);
  assert.equal(evenSize(1), 2);
});

test('ビットレートは画素数とコマ数に比例し、上下で止める', () => {
  assert.equal(videoBitrate(1920, 1080, 30), 12_441_600);
  assert.equal(videoBitrate(2880, 1620, 30), 27_993_600);
  assert.equal(videoBitrate(640, 360, 30), 8_000_000);
  assert.equal(videoBitrate(3840, 2160, 60), 60_000_000);
});
