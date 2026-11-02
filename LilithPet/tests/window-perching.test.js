'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { candidates, chooseSite, isFullscreen, INTERVAL } = require('../window-perching');
const display = { bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 850 } };
const w = { id: 7, x: 200, y: 100, width: 800, height: 550 };
test('ten-minute interval; empty desktop is a no-op', () => {
  assert.equal(INTERVAL, 600000);
  assert.equal(chooseSite([], [display]), null);
});
test('fullscreen and maximized windows excluded', () => {
  for (const rect of [display.bounds, display.workArea]) {
    assert.ok(isFullscreen(rect, display));
    assert.equal(candidates([{ id: 1, ...rect }], [display]).length, 0);
  }
});
test('random window, both sitting styles, seat stays in safe span', () => {
  const front = chooseSite([w], [display], {}, () => 0.1);
  const curl = chooseSite([w], [display], {}, () => 0.9);
  assert.equal(front.style, 'front');
  assert.equal(curl.style, 'curl');
  assert.equal(front.id, 7);
  assert.ok(w.x + w.width * front.fraction >= front.left);
  assert.ok(w.x + w.width * front.fraction <= front.right);
});
test('front window occludes bottom edge; closed/minimized target vanishes', () => {
  const blocker = { ...w, id: 2 };
  assert.equal(candidates([blocker, w], [display]).some(s => s.id === 7), false);
  assert.equal(candidates([], [display]).some(s => s.id === 7), false);
});
test('no dangling feet below desktop; curled seat still allowed', () => {
  const low = { ...w, y: 310 };
  const site = chooseSite([low], [display]);
  assert.ok(site);
  assert.equal(site.style, 'curl');
});
test('secondary display with negative coordinates', () => {
  const d = { bounds: { x: -1440, y: 0, width: 1440, height: 900 }, workArea: { x: -1440, y: 25, width: 1440, height: 850 } };
  assert.equal(chooseSite([{ ...w, x: -1240 }], [display, d]).id, 7);
});
test('tiny windows and windows above screen rejected', () => {
  assert.equal(chooseSite([{ ...w, width: 130 }], [display]), null);
  assert.equal(chooseSite([{ ...w, y: -500 }], [display]), null);
});
