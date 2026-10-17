# MESHplay — PSP-style wave ocean, rendered as a seamless video loop.
# Six flowing light-ribbons over a deep-space floor, dust, mist, bloom.
#
#   blender.exe -b --python scripts/blender/waves_loop.py -- <out.mp4> [frames]
#
# Loop math: wave phase advances an integer number of wavelengths per loop,
# so frame 241 is identical to frame 1 — perfect HTML5 video loop.

import bpy
import math
import sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = argv[0] if argv else 'waves.mp4'
FRAMES = int(argv[1]) if len(argv) > 1 else 240
FPS = 24
LOOP_CYCLES = 3  # wave cycles per loop — must be an integer for a seamless loop


def wave_modifier(obj, name, direction, height, wavelength, cycles_per_loop, offset, damping=0.0):
    mod = obj.modifiers.new(name, 'WAVE')
    mod.use_x = direction in ('x', 'both')
    mod.use_y = direction in ('y', 'both')
    mod.height = height
    mod.width = wavelength
    mod.speed = wavelength * cycles_per_loop / FRAMES  # phase wrap: seamless
    mod.start_position_x = offset * 1.7
    mod.start_position_y = offset * 0.9
    mod.time_offset = offset
    mod.damping_time = damping
    return mod


def ribbon_material(crest, mid, deep):
    mat = bpy.data.materials.new('Ribbon')
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    em = nodes.new('ShaderNodeEmission')
    tex = nodes.new('ShaderNodeTexCoord')
    sep = nodes.new('ShaderNodeSeparateXYZ')
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    ramp.color_ramp.elements[0].color = deep
    ramp.color_ramp.elements[1].color = crest
    mid_el = ramp.color_ramp.elements.new(0.5)
    mid_el.color = mid
    links.new(tex.outputs['Object'], sep.inputs[0])
    # gradient along the wave height (Z in object space after displacement)
    links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    # stretch the ramp along travel direction so crests shimmer
    mapr = nodes.new('ShaderNodeMapRange')
    mapr.inputs['From Min'].default_value = -0.6
    mapr.inputs['From Max'].default_value = 0.9
    links.new(sep.outputs['Z'], mapr.inputs['Value'])
    links.new(mapr.outputs['Result'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], em.inputs['Color'])
    em.inputs['Strength'].default_value = 2.2
    links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mat


# ---------- clean slate ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        continue

# ---------- six ribbons ----------
DEEP = (0.05, 0.01, 0.14, 1.0)
MID = (0.36, 0.12, 0.78, 1.0)
CREST = (0.92, 0.78, 1.0, 1.0)
mat_a = ribbon_material(CREST, MID, DEEP)
mat_b = ribbon_material((0.75, 0.55, 1.0, 1.0), (0.2, 0.06, 0.5, 1.0), (0.03, 0.008, 0.09, 1.0))

specs = [
    (0.0, 1.0, 8.0, 'x', 0.55, 7.0, 0.0),
    (1.0, -0.6, 6.0, 'x', 0.4, 5.5, 9.0),
    (-1.0, 0.8, 9.0, 'both', 0.32, 9.0, 17.0),
    (0.5, -1.0, 7.5, 'x', 0.48, 6.2, 26.0),
    (-0.5, 0.5, 5.0, 'y', 0.36, 8.0, 33.0),
    (0.2, 1.2, 10.0, 'x', 0.28, 7.5, 41.0),
]
for i, (y, z, size, direction, height, wavelength, offset) in enumerate(specs):
    mesh = bpy.data.meshes.new(f'Ribbon{i}')
    grid = bpy.ops.mesh.primitive_grid_add(
        x_subdivisions=160, y_subdivisions=24,
        size=size, location=(0, y * 3.4, -0.4 - i * 0.85),
    )
    obj = bpy.context.active_object
    obj.name = f'Ribbon{i}'
    obj.rotation_euler = (0, 0, math.radians((i % 3 - 1) * 4))
    obj.data.materials.append(mat_a if i % 2 == 0 else mat_b)
    wave_modifier(obj, 'Flow', direction, height, wavelength, LOOP_CYCLES, offset)
    wave_modifier(obj, 'Swell', 'y', height * 0.35, wavelength * 1.6, LOOP_CYCLES, offset * 0.5)

# ---------- static dust (seamless by definition) ----------
dust_mat = bpy.data.materials.new('Dust')
dust_mat.use_nodes = True
nt = dust_mat.node_tree
nt.nodes.clear()
dout = nt.nodes.new('ShaderNodeOutputMaterial')
em = nt.nodes.new('ShaderNodeEmission')
em.inputs['Color'].default_value = (0.85, 0.7, 1.0, 1.0)
em.inputs['Strength'].default_value = 3.0
nt.links.new(em.outputs['Emission'], dout.inputs['Surface'])

import random
random.seed(7)
for i in range(140):
    r = random.uniform(0.006, 0.022)
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=1, radius=r,
        location=(random.uniform(-16, 16), random.uniform(-8, 6), random.uniform(-1.5, 5.5)),
    )
    d = bpy.context.active_object
    d.data.materials.append(dust_mat)

# ---------- camera: low, looking across the ocean ----------
cam_data = bpy.data.cameras.new('Camera')
cam_data.lens = 42
cam = bpy.data.objects.new('Camera', cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (0, -15.5, 1.6)
cam.rotation_euler = (math.radians(83), 0, 0)
scene.camera = cam

# ---------- deep world ----------
world = bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
wbg = world.node_tree.nodes['Background']
wbg.inputs[0].default_value = (0.014, 0.006, 0.034, 1.0)
wbg.inputs[1].default_value = 1.0

# ---------- compositor: mist fade + bloom ----------
scene.view_layers[0].use_pass_mist = True
scene.world.mist_settings.start = 10
scene.world.mist_settings.depth = 38
scene.use_nodes = True
cnt = scene.node_tree
cnt.nodes.clear()
rl = cnt.nodes.new('CompositorNodeRLayers')
glare = cnt.nodes.new('CompositorNodeGlare')
glare.glare_type = 'FOG_GLOW'
glare.quality = 'MEDIUM'
glare.threshold = 0.9
glare.size = 8
mix = cnt.nodes.new('CompositorNodeMixRGB')
mix.blend_type = 'MIX'
mix.inputs['Fac'].default_value = 0.85
composite = cnt.nodes.new('CompositorNodeComposite')
cnt.links.new(rl.outputs['Image'], mix.inputs[1])
# mist pass darkens distance into the world color
mix2 = cnt.nodes.new('CompositorNodeMixRGB')
mix2.blend_type = 'MULTIPLY'
mix2.inputs['Fac'].default_value = 0.55
if 'Mist' in rl.outputs:
    cnt.links.new(rl.outputs['Image'], mix.inputs[1])
    cnt.links.new(rl.outputs['Mist'], mix2.inputs[1])
    cnt.links.new(mix2.outputs['Image'], mix.inputs[2])
else:
    cnt.links.new(rl.outputs['Image'], mix.inputs[1])
cnt.links.new(mix.outputs['Image'], glare.inputs['Image'])
cnt.links.new(glare.outputs['Image'], composite.inputs['Image'])

# ---------- output: H.264 video ----------
scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
scene.render.ffmpeg.constant_rate_factor = 'HIGH'
scene.render.ffmpeg.gopsize = 24
scene.render.fps = FPS
scene.frame_start = 1
scene.frame_end = FRAMES
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.filepath = out

bpy.ops.render.render(animation=True)
print('WAVES_OK ->', out)
