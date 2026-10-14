import bpy, math, sys, os
from mathutils import Vector

argv = sys.argv
args = argv[argv.index("--") + 1:]
glb, outdir = args[0], args[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
mn = Vector((1e9,1e9,1e9)); mx = Vector((-1e9,-1e9,-1e9))
for o in meshes:
    mw = o.matrix_world
    for c in o.bound_box:
        wc = mw @ Vector(c)
        mn = Vector((min(mn.x,wc.x),min(mn.y,wc.y),min(mn.z,wc.z)))
        mx = Vector((max(mx.x,wc.x),max(mx.y,wc.y),max(mx.z,wc.z)))
print(f"[bbox] min={tuple(round(v,3) for v in mn)} max={tuple(round(v,3) for v in mx)}")

imgs_ok = sum(1 for i in bpy.data.images if i.has_data)
imgs_all = len(bpy.data.images)
print(f"[images] loaded={imgs_ok}/{imgs_all}")
for i in list(bpy.data.images)[:3]:
    print(f"[img] {i.name} size={tuple(i.size)} has_data={i.has_data}")

center = (mn + mx) / 2
size = mx - mn

scn = bpy.context.scene
scn.render.engine = 'CYCLES'
scn.cycles.device = 'CPU'
scn.cycles.samples = 32
scn.cycles.use_denoising = True
scn.render.resolution_x = 420
scn.render.resolution_y = 520
scn.render.film_transparent = False
scn.world = bpy.data.worlds.new("W")
scn.world.use_nodes = True
bg = scn.world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.75, 0.78, 0.82, 1)
bg.inputs[1].default_value = 1.0

cam_data = bpy.data.cameras.new("C"); cam_data.type = 'ORTHO'
cam_data.ortho_scale = max(size.x, size.y, size.z) * 1.15
cam = bpy.data.objects.new("C", cam_data)
scn.collection.objects.link(cam); scn.camera = cam

sun_data = bpy.data.lights.new("S", 'SUN'); sun_data.energy = 4.0
sun = bpy.data.objects.new("S", sun_data)
scn.collection.objects.link(sun)
sun.rotation_euler = (math.radians(55), 0, math.radians(-35))

fill_data = bpy.data.lights.new("F", 'SUN'); fill_data.energy = 1.5
fill = bpy.data.objects.new("F", fill_data)
scn.collection.objects.link(fill)
fill.rotation_euler = (math.radians(60), 0, math.radians(145))

d = max(size) * 4
views = [
    ("view_0_fromMinusY", (center.x, center.y - d, center.z), (math.radians(90), 0, 0)),
    ("view_90_fromPlusX", (center.x + d, center.y, center.z), (math.radians(90), 0, math.radians(90))),
    ("view_180_fromPlusY", (center.x, center.y + d, center.z), (math.radians(90), 0, math.radians(180))),
    ("view_270_fromMinusX", (center.x - d, center.y, center.z), (math.radians(90), 0, math.radians(-90))),
]
os.makedirs(outdir, exist_ok=True)
for name, loc, rot in views:
    cam.location = loc; cam.rotation_euler = rot
    scn.render.filepath = os.path.join(outdir, name + ".png")
    bpy.ops.render.render(write_still=True)
    print(f"[render] {name}")
