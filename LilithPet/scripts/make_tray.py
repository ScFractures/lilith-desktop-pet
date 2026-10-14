import bpy, numpy as np, sys
from collections import deque
args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
img = bpy.data.images.load(src)
w, h = img.size
arr = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
# head crop from the 625x625 front figure
x0, x1 = 75, 545
y0, y1 = 0, 470
sub = arr[y0:y1, x0:x1].copy()
sh, sw = sub.shape[:2]
lum = sub[..., :3].mean(axis=2)
bg = lum > 0.95
# flood fill background from border
visited = np.zeros((sh, sw), dtype=bool)
q = deque()
for x in range(sw):
    for y in (0, sh - 1):
        if bg[y, x] and not visited[y, x]:
            visited[y, x] = True; q.append((y, x))
for y in range(sh):
    for x in (0, sw - 1):
        if bg[y, x] and not visited[y, x]:
            visited[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for ny, nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
        if 0 <= ny < sh and 0 <= nx < sw and bg[ny, nx] and not visited[ny, nx]:
            visited[ny, nx] = True; q.append((ny, nx))
sub[..., 3] = np.where(visited, 0.0, 1.0)
print('transparent pixels:', int(visited.sum()), '/', sh * sw)
outimg = bpy.data.images.new('tray', sw, sh, alpha=True)
outimg.pixels = sub[::-1].flatten().tolist()
outimg.filepath_raw = out
outimg.file_format = 'PNG'
outimg.save()
print('saved', out)
