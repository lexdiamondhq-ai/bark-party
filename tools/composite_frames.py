"""Composites hero frames dumped by src/game/render/__tests__/dumpFrames.test.ts (DUMP_FRAMES=out.json npx jest dumpFrames) into a contact sheet.
Usage: python3 tools/composite_frames.py frames.json sheet.png"""
import json
import math
import sys

from PIL import Image, ImageDraw

ROOT = '/Users/alexmedina/bark-party-game'
STRIDE = 18
RECT = -1
FLOOR_SCREEN_Y = 310

data = json.load(open(sys.argv[1]))
out_path = sys.argv[2]
k = data['k']
pages = [Image.open(f'{ROOT}/assets/game/atlas/{p}').convert('RGBA') for p in json.load(open(f'{ROOT}/src/game/render/atlas.json'))['pages']]

GIF = out_path.endswith('.gif')
MP4 = out_path.endswith('.mp4')
# A video shows what the phone shows: two display frames per simulation step, the first blended halfway
# toward the previous step (what the 120 Hz canvas draws), the second exactly on the step.
BLENDS = (0.5, 1.0) if MP4 else (1.0,)
CROP = 320  # px around the hero
tiles = []
for fr in data['frames']:
  for blend in BLENDS:
    W, H = int(640 * k), int(360 * k)
    canvas = Image.new('RGBA', (W, H), (240, 230, 220, 255))
    d = fr['ops']
    for i in range(0, len(d), STRIDE):
        img, sx, sy, sw, sh, cx, cy, dw, dh, rot, alpha, color, pcx, pcy, pdw, pdh, prot, palpha = d[i:i + STRIDE]
        b = 1 - blend
        cx, cy, dw, dh, rot, alpha = pcx * b + cx * blend, pcy * b + cy * blend, pdw * b + dw * blend, pdh * b + dh * blend, prot * b + rot * blend, palpha * b + alpha * blend
        if alpha <= 0.01:
            continue
        if img == RECT:
            c = int(color)
            layer = Image.new('RGBA', (max(1, int(abs(dw))), max(1, int(dh))), ((c >> 16) & 255, (c >> 8) & 255, c & 255, int(255 * alpha)))
        else:
            src = pages[int(img)].crop((int(sx), int(sy), int(sx + sw), int(sy + sh)))
            layer = src.resize((max(1, int(round(abs(dw)))), max(1, int(round(dh)))), Image.LANCZOS)
            if dw < 0:
                layer = layer.transpose(Image.FLIP_LEFT_RIGHT)
            if alpha < 1:
                a = layer.getchannel('A').point(lambda v: int(v * alpha))
                layer.putalpha(a)
        if rot:
            layer = layer.rotate(-rot * 180 / math.pi, resample=Image.BICUBIC, expand=True)
        canvas.alpha_composite(layer, (int(round(cx - layer.width / 2)), int(round(cy - layer.height / 2))))
    if GIF or MP4:
        # The whole view, as the phone shows it, with the camera's own framing.
        tiles.append(canvas.convert('RGB'))
        continue
    # Crop around the hero (screen x of the hero = (heroX - camX) * k).
    hx = (fr['heroX'] - fr['camX']) * k
    hy = (FLOOR_SCREEN_Y - fr['heroY']) * k
    box = (int(hx - CROP / 2), int(hy - CROP * 0.75), int(hx + CROP / 2), int(hy + CROP * 0.25))
    tile = canvas.crop(box)
    ImageDraw.Draw(tile).text((6, 6), fr['label'], fill=(20, 10, 10, 255))
    tiles.append(tile)

if MP4:
    import os, subprocess, tempfile
    fps = int(sys.argv[3]) if len(sys.argv) > 3 else 120
    tmp = tempfile.mkdtemp()
    for n, t in enumerate(tiles):
        t.save(f'{tmp}/f{n:05d}.png')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', f'{tmp}/f%05d.png', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', out_path], check=True)
    print('wrote', out_path, tiles[0].size, len(tiles), 'frames at', fps, 'fps')
    sys.exit(0)

if GIF:
    fps = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    tiles[0].save(out_path, save_all=True, append_images=tiles[1:], duration=int(1000 / fps), loop=0, optimize=False)
    print('wrote', out_path, tiles[0].size, len(tiles), 'frames at', fps, 'fps')
    sys.exit(0)

cols = 8
rows = math.ceil(len(tiles) / cols)
sheet = Image.new('RGBA', (cols * CROP, rows * CROP), (255, 255, 255, 255))
for n, t in enumerate(tiles):
    sheet.alpha_composite(t, ((n % cols) * CROP, (n // cols) * CROP))
sheet.save(out_path)
print('wrote', out_path, sheet.size, len(tiles), 'frames')
