#!/usr/bin/env python3
"""Small puppet sheets for React Native screens (title parade, story): the Dog Better pup's body,
one walk stride of legs and one tail wag at a quarter of the sticker's size, so a plain <Image> inside a
clipped <View> can animate them without the atlas or Skia.

    python3 tools/pup_walker_sheets.py

Reads art/dogbetter-pup/{base,legs,tail}.png + pupFrames.json, writes assets/game/dogbetter/pup_walker_*.png
and src/components/pupWalker.json (sizes in the small sheets' pixels)."""
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'dogbetter-pup')
OUT = os.path.join(ROOT, 'assets', 'game', 'dogbetter')
META = json.load(open(os.path.join(SRC, 'pupFrames.json')))
CANVAS_W = 200  # the body's width in the small sheets
S = CANVAS_W / META['size'][0]


def cut(sheet, info, i):
    cols = info['cols']
    fw, fh = info['frame']
    c, r = i % cols, i // cols
    return sheet.crop((c * fw, r * fh, c * fw + fw, r * fh + fh))


def scaled(im):
    return im.resize((max(1, round(im.width * S)), max(1, round(im.height * S))), Image.LANCZOS)


def pack(frames, cols):
    fw, fh = frames[0].size
    rows = -(-len(frames) // cols)
    sheet = Image.new('RGBA', (fw * cols, fh * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * fw, (i // cols) * fh))
    return sheet, fw, fh, rows


base = scaled(Image.open(os.path.join(SRC, 'base.png')).convert('RGBA'))
legs_src = Image.open(os.path.join(SRC, 'legs.png')).convert('RGBA')
walk = META['walk'] - 1  # the last frame repeats the first
legs = [scaled(cut(legs_src, META['legsSheet'], i)) for i in range(walk)]
legs_sheet, lw, lh, lrows = pack(legs, 8)
tail_src = Image.open(os.path.join(SRC, 'tail.png')).convert('RGBA')
tails = [scaled(cut(tail_src, META['tailSheet'], i)) for i in range(META['tail'] - 1)]
tail_sheet, tw, th, trows = pack(tails, 5)

base.save(os.path.join(OUT, 'pup_walker_base.png'), optimize=True)
legs_sheet.save(os.path.join(OUT, 'pup_walker_legs.png'), optimize=True)
tail_sheet.save(os.path.join(OUT, 'pup_walker_tail.png'), optimize=True)

lb = META['legsBox']
tb = META['tailBox']
meta = {
    'canvas': [base.width, base.height],
    'legs': {'frames': walk, 'cols': 8, 'frame': [lw, lh], 'sheet': [legs_sheet.width, legs_sheet.height], 'box': [round(lb[0] * S), round(lb[1] * S)]},
    'tail': {'frames': len(tails), 'cols': 5, 'frame': [tw, th], 'sheet': [tail_sheet.width, tail_sheet.height], 'box': [round(tb[0] * S), round(tb[1] * S)]},
}
with open(os.path.join(ROOT, 'src', 'components', 'pupWalker.json'), 'w') as fh:
    json.dump(meta, fh, indent=2)
    fh.write('\n')
print(meta)
