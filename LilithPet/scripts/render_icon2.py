import bpy, math, sys, os
from mathutils import Vector
argv = sys.argv
args = argv[argv.index("--") + 1:]
glb, outdir = args[0], args[1]
os.makedirs(outdir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
mn = Vector((1e9,1e9,1e9)); mx = Vector((-1e9,-1e9,-1e9))
for o in meshes:
    for c in o.bound_box:
        wc = o.matrix_world @ Vector(c)
        mn = Vector((min(mn.x,wc.x),min(mn.y,wc.y),min(mn.z,wc.z)))
        mx = Vector((max(mx.x,wc.x),max(mx.y,wc.y),max(mx.z,wc.z)))
center = (mn + mx) / 2
size = mx - mn
scn = bpy.context.scene
scn.render.engine = 'CYCLES'; scn.cycles.device = 'CPU'
scn.cycles.samples = 96; scn.cycles.use_denoising = True
scn.render.resolution_x = 256; scn.render.resolution_y = 256
scn.render.film_transparent = True
scn.view_settings.view_transform = 'Standard'
scn.world = bpy.data.worlds.new("W"); scn.world.use_nodes = True
bg = scn.world.node_tree.nodes['Background']
bg.inputs[0].default_value = (1,1,1,1); bg.inputs[1].default_value = 2.2
cam_data = bpy.data.cameras.new("C"); cam_data.type = 'ORTHO'
cam = bpy.data.objects.new("C", cam_data)
scn.collection.objects.link(cam); scn.camera = cam
# face light: straight from front (+X)
face = bpy.data.lights.new("Face",'SUN'); face.energy = 2.2
fo = bpy.data.objects.new("Face", face); scn.collection.objects.link(fo)
fo.rotation_euler = (math.radians(20), math.radians(90), 0)
top = bpy.data.lights.new("Top",'SUN'); top.energy = 1.6
to = bpy.data.objects.new("Top", top); scn.collection.objects.link(to)
to.rotation_euler = (math.radians(35), 0, math.radians(60))
d = 5
for tag, zc, osc in [("a", 0.72, 0.52), ("b", 0.78, 0.46), ("c", 0.75, 0.60)]:
    cam_data.ortho_scale = osc
    cam.location = (center.x + d, center.y, mn.z + size.z * zc)
    cam.rotation_euler = (math.radians(90), 0, math.radians(90))
    scn.render.filepath = os.path.join(outdir, f"icon_{tag}.png")
    bpy.ops.render.render(write_still=True)
    print("[icon]", tag, "zc", zc, "scale", osc)
