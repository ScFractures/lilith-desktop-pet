import bpy, math, sys, os
from mathutils import Vector
argv = sys.argv
args = argv[argv.index("--") + 1:]
glb, out = args[0], args[1]
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
scn.render.engine = 'CYCLES'
scn.cycles.device = 'CPU'
scn.cycles.samples = 128
scn.cycles.use_denoising = True
scn.render.resolution_x = 256
scn.render.resolution_y = 256
scn.render.film_transparent = True
scn.view_settings.view_transform = 'Standard'
scn.world = bpy.data.worlds.new("W"); scn.world.use_nodes = True
bg = scn.world.node_tree.nodes['Background']
bg.inputs[0].default_value = (1,1,1,1); bg.inputs[1].default_value = 1.4
head_z = mn.z + size.z * 0.82
cam_data = bpy.data.cameras.new("C"); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 0.42
cam = bpy.data.objects.new("C", cam_data)
scn.collection.objects.link(cam); scn.camera = cam
d = 5
cam.location = (center.x + d, center.y, head_z)
cam.rotation_euler = (math.radians(90), 0, math.radians(90))
sun_data = bpy.data.lights.new("S",'SUN'); sun_data.energy = 3.0
sun = bpy.data.objects.new("S", sun_data); scn.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(60))
fill_data = bpy.data.lights.new("F",'SUN'); fill_data.energy = 1.6
fill = bpy.data.objects.new("F", fill_data); scn.collection.objects.link(fill)
fill.rotation_euler = (math.radians(70), 0, math.radians(-120))
scn.render.filepath = out
bpy.ops.render.render(write_still=True)
print("[icon] done", out)
