'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterWindowObstacles } = require('../window-obstacles');
const { blockedIntervals } = require('../window-avoidance');
const { chooseSite } = require('../window-perching');
const pet = { pid: 123, id: 1, x: 900, y: 500, width: 250, height: 350 };
const chat = { pid: 123, id: 2, x: 100, y: 100, width: 800, height: 600 };
const other = { pid: 456, id: 3, x: 1000, y: 100, width: 400, height: 500 };
test('exclude only pet window, keeping chat in same Electron process', () => {
  const windows = filterWindowObstacles([pet, chat, other], { excludeWindowIds: [1] });
  assert.deepEqual(windows.map(w => w.id), [2, 3]);
  const display = { bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 850 } };
  assert.equal(chooseSite(windows, [display], {}, () => 0).id, chat.id);
  assert.ok(blockedIntervals(windows, { y: 500 }, { top: 0, bottom: 200, left: 0, right: 150 }).length > 0);
});
test('normalizes IDs and geometry; preserves front-to-back order', () => {
  assert.deepEqual(filterWindowObstacles([other, { ...pet, id: '1' }, chat], { excludeWindowIds: ['1'] }).map(w => w.id), [3, 2]);
  assert.deepEqual(filterWindowObstacles([chat], { excludePids: [123] }), []);
  assert.deepEqual(filterWindowObstacles([null, { ...chat, width: 39 }, { ...chat, x: NaN }]), []);
});
