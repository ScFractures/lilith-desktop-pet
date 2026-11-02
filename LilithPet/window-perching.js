'use strict';

// CGWindowList is front-to-back. Only offer visible pieces of a bottom edge;
// never perch through another window or on a fullscreen/maximized window.
const INTERVAL = 10 * 60 * 1000;
function isFullscreen(w, display) {
  const covers = (r) => w.x <= r.x + 3 && w.y <= r.y + 3
    && w.x + w.width >= r.x + r.width - 3
    && w.y + w.height >= r.y + r.height - 3;
  return covers(display.bounds) || covers(display.workArea);
}
function candidates(windows, displays, { width = 150, height = 220, footDrop = 90 } = {}) {
  const sites = [];
  windows.forEach((w, index) => {
    if (w.id == null || w.width < width + 32 || w.height < height + 30) return;
    const edge = w.y + w.height - 8;
    for (const d of displays) {
      const a = d.workArea;
      if (isFullscreen(w, d) || edge - height < a.y || edge > a.y + a.height) continue;
      let spans = [[Math.max(w.x + 16, a.x), Math.min(w.x + w.width - 16, a.x + a.width)]];
      for (const front of windows.slice(0, index)) {
        if (front.y >= edge + footDrop || front.y + front.height <= edge - height) continue;
        spans = spans.flatMap(([l, r]) => {
          if (front.x >= r || front.x + front.width <= l) return [[l, r]];
          return [[l, Math.min(r, front.x)], [Math.max(l, front.x + front.width), r]];
        });
      }
      for (const [l, r] of spans) {
        if (r - l < width) continue;
        sites.push({ id: w.id, window: w, left: l + width / 2, right: r - width / 2,
          edge, front: edge + footDrop <= a.y + a.height });
      }
    }
  });
  return sites;
}
function chooseSite(windows, displays, dimensions, random = Math.random) {
  const sites = candidates(windows, displays, dimensions);
  // Pick a window first, not an edge segment (otherwise fragmented windows
  // would be more likely to be selected).
  const ids = [...new Set(sites.map(s => s.id))];
  if (!ids.length) return null;
  const id = ids[Math.floor(random() * ids.length)];
  const choices = sites.filter(s => s.id === id);
  const site = choices[Math.floor(random() * choices.length)];
  const x = site.left + random() * (site.right - site.left);
  return { ...site, fraction: (x - site.window.x) / site.window.width,
    style: site.front && random() < 0.5 ? 'front' : 'curl', side: random() < 0.5 ? -1 : 1 };
}
module.exports = { INTERVAL, isFullscreen, candidates, chooseSite };
