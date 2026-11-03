'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual interaction functions, without WebGL or live-pet IPC.
const source = fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8');
const interactions = source.slice(source.indexOf('function doPat()'), source.indexOf('function scheduleIdle()'));
function setup(mode) {
  const calls = [];
  const state = { mode, patLeft: 0, targetYaw: Math.PI };
  const context = vm.createContext({
    state, calls,
    phrases: { sleepyPat: ['sleepy response'], pat: ['awake pat'], touch: ['touch'], chest: ['chest'], lower: ['lower'] },
    pick: lines => lines[0], say: text => calls.push(text),
    wakeUp: () => { calls.push('wake'); state.mode = 'idle'; },
    window: { pet: { walkStop: () => calls.push('stop walking') } },
    scheduleIdle: () => calls.push('schedule'),
    petScreenRect: () => ({ l: 0, r: 100, t: 0, b: 200 }),
    spawnHeart: () => calls.push('heart'),
    hop: () => calls.push('hop'), squashKick: () => calls.push('squash'),
    setTimeout: fn => fn(), Math,
  });
  vm.runInContext(interactions, context);
  return { state, calls, touch: zone => context.doTouch(zone), pat: () => context.doPat() };
}
test('sleeping head touch keeps sleep and uses sleepyPat, not awake pat', () => {
  const s = setup('sleeping');
  s.touch('head');
  assert.equal(s.state.mode, 'sleeping');
  assert.equal(s.state.targetYaw, Math.PI);
  assert.equal(s.state.patLeft, 0);
  assert.deepEqual(s.calls, ['sleepy response']);
});
test('sleeping menu pat retains sleep-specific response', () => {
  const s = setup('sleeping'); s.pat();
  assert.deepEqual(s.calls, ['sleepy response']);
  assert.equal(s.state.mode, 'sleeping');
});
for (const zone of ['normal', 'chest', 'lower']) {
  test(`sleeping ${zone} touch still wakes and runs its own reaction`, () => {
    const s = setup('sleeping'); s.touch(zone);
    assert.equal(s.state.mode, 'idle');
    assert.equal(s.calls[0], 'wake');
    assert.ok(s.calls.includes(zone === 'normal' ? 'touch' : zone));
    assert.ok(!s.calls.includes('sleepy response'));
  });
}
test('awake head touch retains pat animation and hearts', () => {
  const s = setup('idle'); s.touch('head');
  assert.equal(s.state.patLeft, 1.6);
  assert.deepEqual(s.calls, ['awake pat', 'heart', 'heart']);
});
test('walking head touch stops walking before pat', () => {
  const s = setup('walking'); s.touch('head');
  assert.equal(s.state.mode, 'idle');
  assert.deepEqual(s.calls, ['stop walking', 'schedule', 'awake pat', 'heart', 'heart']);
});
