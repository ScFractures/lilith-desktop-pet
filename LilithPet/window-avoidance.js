'use strict';

// Pure geometry for bottom-edge window avoidance. All x values refer to the pet
// window's left edge; obstacles only matter when they reach the pet's body band.

function mergeIntervals(intervals) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function blockedIntervals(obstacles, bounds, body, margin = 10) {
  const bodyTop = bounds.y + body.top;
  const bodyBottom = bounds.y + body.bottom;
  const out = [];
  for (const obs of obstacles || []) {
    if (!obs || !(obs.width > 0) || !(obs.height > 0)) continue;
    const overlap = Math.min(bodyBottom, obs.y + obs.height) - Math.max(bodyTop, obs.y);
    if (overlap <= 2) continue;
    const start = obs.x - margin - body.right;
    const end = obs.x + obs.width + margin - body.left;
    if (end > start) out.push([start, end]);
  }
  return mergeIntervals(out);
}

function freeIntervals(blocked, minX, maxX) {
  if (maxX < minX) return [];
  let cursor = minX;
  const out = [];
  for (const [rawStart, rawEnd] of blocked) {
    const start = Math.max(minX, rawStart);
    const end = Math.min(maxX, rawEnd);
    if (end <= cursor) continue;
    if (start > cursor) out.push([cursor, start]);
    cursor = end;
    if (cursor >= maxX) break;
  }
  if (cursor < maxX) out.push([cursor, maxX]);
  return out;
}

function layout({ obstacles, bounds, body, workArea, margin }) {
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - bounds.width;
  const blocked = blockedIntervals(obstacles, bounds, body, margin);
  return { minX, maxX, blocked, free: freeIntervals(blocked, minX, maxX) };
}

function spanContaining(free, x, tolerance = 1) {
  for (const span of free) {
    if (x >= span[0] - tolerance && x <= span[1] + tolerance) return span;
  }
  return null;
}

function clampToSpan(x, span) {
  return Math.min(Math.max(x, span[0]), span[1]);
}

function nearestFreeX(free, x) {
  let best = null;
  let bestDistance = Infinity;
  for (const span of free) {
    const point = x < span[0] ? span[0] : x > span[1] ? span[1] : x;
    const distance = Math.abs(point - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best;
}

// A walk may not cross a blocked gap, so an unreachable target is clamped to the
// free span the pet currently stands in rather than to the globally nearest gap.
function reachableTarget(free, currentX, requestedX) {
  const span = spanContaining(free, currentX);
  if (span) return clampToSpan(requestedX, span);
  return nearestFreeX(free, requestedX);
}

module.exports = {
  mergeIntervals,
  blockedIntervals,
  freeIntervals,
  layout,
  spanContaining,
  clampToSpan,
  nearestFreeX,
  reachableTarget,
};
