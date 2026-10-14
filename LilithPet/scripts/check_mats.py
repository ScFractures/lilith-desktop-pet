import bpy
count = 0
for mat in bpy.data.materials:
    if not mat.use_nodes or not mat.node_tree:
        continue
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            bc = n.inputs['Base Color']
            met = n.inputs['Metallic'].default_value
            rough = n.inputs['Roughness'].default_value
            alpha = n.inputs['Alpha'].default_value
            linked = bc.is_linked
            print(f"[mat] {mat.name} blend={mat.blend_method} metallic={met:.2f} rough={rough:.2f} alpha={alpha:.2f} basecolor_linked={linked} color={tuple(round(c,3) for c in bc.default_value)}")
            count += 1
            break
    if count >= 12:
        break
