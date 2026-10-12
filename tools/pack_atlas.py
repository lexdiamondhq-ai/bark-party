#!/usr/bin/env python3
"""Packs every game sprite into a few big atlas pages so the game draws from one or two images.

Inputs:
  assets/game/sprites/*.png      drawn sprites (3 px per world unit, from tools/render_sprites.js)
  assets/game/dogbetter/*.webp   Dog Better art: the pup's poses and the breed dogs
Outputs:
  assets/game/atlas/atlas_<n>.png
  src/game/render/atlas.json     frames[name] = [page, x, y, w, h]
  src/game/render/atlasImages.ts require() for each page

Usage: python3 tools/pack_atlas.py
"""
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITE_DIR = os.path.join(ROOT, 'assets/game/sprites')
DB_DIR = os.path.join(ROOT, 'assets/game/dogbetter')
OUT_DIR = os.path.join(ROOT, 'assets/game/atlas')
PX = 3  # pixels per world unit
PAGE = 2048
PAD = 2

# Dog Better pictures used as sprites, by sprite name.
DOGBETTER = {
    'pup_walk': 'mascot-walking.webp',
    'pup_bark': 'mascot-bark.webp',
    'pup_down': 'mascot-down.webp',
    'pup_sit': 'mascot.webp',
}
for breed in ['beagle', 'collie', 'dachshund', 'frenchie', 'golden', 'husky', 'lab', 'poodle', 'rottweiler', 'shepherd']:
    DOGBETTER[f'dog_{breed}'] = f'dog_{breed}.webp'


PUP_DIR = os.path.join(ROOT, 'art/dogbetter-pup')


def pup_parts():
    """Cuts the Dog Better puppet sheets (art/dogbetter-pup) into named full-res frames."""
    if not os.path.exists(os.path.join(PUP_DIR, 'pupFrames.json')):
        return {}
    meta = json.load(open(os.path.join(PUP_DIR, 'pupFrames.json')))
    parts = {'pup_base': Image.open(os.path.join(PUP_DIR, 'base.png')).convert('RGBA')}

    def cut(sheet, info, i):
        cols = info['cols']
        fw, fh = info['frame']
        c, r = i % cols, i // cols
        return sheet.crop((c * fw, r * fh, c * fw + fw, r * fh + fh))

    # The sheets' last frame repeats their first, so the loops are walk - 1 and tail - 1 frames.
    legs = Image.open(os.path.join(PUP_DIR, 'legs.png')).convert('RGBA')
    for i in range(meta['walk'] - 1):
        parts[f'pup_leg_{i}'] = cut(legs, meta['legsSheet'], i)
    parts['pup_leg_rest'] = cut(legs, meta['legsSheet'], meta['rest'])
    tail = Image.open(os.path.join(PUP_DIR, 'tail.png')).convert('RGBA')
    for i in range(meta['tail'] - 1):
        parts[f'pup_tail_{i}'] = cut(tail, meta['tailSheet'], i)
    return parts


def sprite_sizes():
    """Reads world sizes from src/game/sprites.ts so the two never drift apart."""
    src = open(os.path.join(ROOT, 'src/game/sprites.ts')).read()
    sizes = {}
    for m in re.finditer(r'^\s+(\w+): \{ w: ([\d.]+), h: ([\d.]+)', src, re.M):
        sizes[m.group(1)] = (float(m.group(2)), float(m.group(3)))
    # Numbered runs: ...strip('pup_leg', 48, { w: 68.42, h: 27.86 })
    for m in re.finditer(r"^\s+\.\.\.strip\('(\w+)', (\d+), \{ w: ([\d.]+), h: ([\d.]+)", src, re.M):
        for i in range(int(m.group(2))):
            sizes[f'{m.group(1)}_{i}'] = (float(m.group(3)), float(m.group(4)))
    return sizes


def trim(im):
    """Crops fully transparent margins but keeps the bottom edge (feet stay anchored)."""
    box = im.getchannel('A').getbbox()
    if not box:
        return im
    return im.crop((box[0], box[1], box[2], im.height))


def load_all(sizes):
    images = {}
    missing = []
    parts = pup_parts()
    for name, (w, h) in sizes.items():
        target = (max(1, round(w * PX)), max(1, round(h * PX)))
        if name in parts:
            # Puppet pieces keep their exact boxes (no trim) so they line up on the body.
            images[name] = parts[name].resize(target, Image.LANCZOS)
            continue
        if name in DOGBETTER:
            path = os.path.join(DB_DIR, DOGBETTER[name])
            im = trim(Image.open(path).convert('RGBA'))
            # Fit inside the world box, feet on the bottom edge, centred.
            scale = min(target[0] / im.width, target[1] / im.height)
            im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
            canvas = Image.new('RGBA', target, (0, 0, 0, 0))
            canvas.paste(im, ((target[0] - im.width) // 2, target[1] - im.height), im)
            images[name] = canvas
            continue
        path = os.path.join(SPRITE_DIR, name + '.png')
        if not os.path.exists(path):
            missing.append(name)
            continue
        im = Image.open(path).convert('RGBA')
        if im.size != target:
            im = im.resize(target, Image.LANCZOS)
        images[name] = im
    return images, missing


def pack(images):
    """Shelf packer, tallest first. Returns frames and page images."""
    order = sorted(images, key=lambda n: (-images[n].height, -images[n].width))
    pages = []
    frames = {}
    page = None
    x = y = shelf_h = 0
    for name in order:
        im = images[name]
        w, h = im.width + PAD * 2, im.height + PAD * 2
        if page is None or x + w > PAGE:
            x = 0
            y += shelf_h
            shelf_h = 0
        if page is None or y + h > PAGE:
            page = Image.new('RGBA', (PAGE, PAGE), (0, 0, 0, 0))
            pages.append(page)
            x = y = shelf_h = 0
        page.paste(im, (x + PAD, y + PAD))
        frames[name] = [len(pages) - 1, x + PAD, y + PAD, im.width, im.height]
        x += w
        shelf_h = max(shelf_h, h)
    return frames, pages


def main():
    sizes = sprite_sizes()
    images, missing = load_all(sizes)
    if missing:
        print('warning: no art yet for', ', '.join(missing), file=sys.stderr)
    frames, pages = pack(images)
    os.makedirs(OUT_DIR, exist_ok=True)
    for f in os.listdir(OUT_DIR):
        if f.startswith('atlas_') and f.endswith('.png'):
            os.remove(os.path.join(OUT_DIR, f))
    names = []
    for i, page in enumerate(pages):
        # Trim the unused bottom of the page.
        box = page.getbbox() or (0, 0, 1, 1)
        page = page.crop((0, 0, PAGE, min(PAGE, box[3] + PAD)))
        name = f'atlas_{i}.png'
        page.save(os.path.join(OUT_DIR, name), optimize=True)
        names.append(name)
    data = {'pages': names, 'frames': {k: frames[k] for k in sorted(frames)}}
    with open(os.path.join(ROOT, 'src/game/render/atlas.json'), 'w') as fh:
        json.dump(data, fh, separators=(',', ':'))
        fh.write('\n')
    lines = ['// Generated by tools/pack_atlas.py. Do not edit.', 'export const ATLAS_PAGES = [']
    lines += [f"  require('../../../assets/game/atlas/{n}')," for n in names]
    lines += ['];', '']
    with open(os.path.join(ROOT, 'src/game/render/atlasImages.ts'), 'w') as fh:
        fh.write('\n'.join(lines))
    print(f'{len(frames)} sprites on {len(pages)} page(s); {len(missing)} missing')


if __name__ == '__main__':
    main()
