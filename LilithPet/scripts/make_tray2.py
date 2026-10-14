import bpy, numpy as np, sys
from collections import deque
args = sys.argv[sys.argv.index('--') + 1:]
src, out, X0, X1, Y0, Y1 = args[0], args[1], int(args[2]), int(args[3]), int(args[4]), int(args[5])
img = bpy.data.images.load(src)
w, h = img.size
arr = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
sub = arr[Y0:Y1, X0:X1].copy()
sh, sw = sub.shape[:2]
lum = sub[..., :3].mean(axis=2)
bg = lum > 0.95
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
outimg = bpy.data.images.new('tray', sw, sh, alpha=True)
outimg.pixels = sub[::-1].flatten().tolist()
outimg.filepath_raw = out
outimg.file_format = 'PNG'
outimg.save()
print('saved', out, sw, sh)
