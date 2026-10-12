#!/usr/bin/env node
// Rasterizes every art/svg/*.svg to assets/game/sprites/<name>.png with headless Chromium,
// then writes assets/game/sprites/manifest.json.
//
// Pixel size comes from the SVG width/height attributes (3 px per world unit).
// World size and walkable top come from data-world-w / data-world-h / data-top on the root <svg>.
// Text uses the Bagel Fat One font from node_modules, embedded into the render page.
//
// Usage: node tools/render_sprites.js [name ...]      (no names = render all)
// Needs Playwright: set NODE_PATH or PLAYWRIGHT_DIR if `require('playwright')` does not resolve.
const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_DIR, '/tmp/claude-0/node_modules/playwright', 'playwright'].filter(Boolean);
  for (const t of tries) {
    try {
      return require(t);
    } catch (e) {
      /* try next */
    }
  }
  throw new Error('playwright not found; set PLAYWRIGHT_DIR to its install path');
}

const ROOT = path.resolve(__dirname, '..');
const SVG_DIR = path.join(ROOT, 'art', 'svg');
const OUT_DIR = path.join(ROOT, 'assets', 'game', 'sprites');
const FONT = path.join(ROOT, 'node_modules/@expo-google-fonts/bagel-fat-one/400Regular/BagelFatOne_400Regular.ttf');

function attr(svg, name) {
  const m = svg.match(new RegExp(`<svg[^>]*\\s${name}="([^"]+)"`));
  return m ? m[1] : undefined;
}

(async () => {
  const { chromium } = loadPlaywright();
  const only = process.argv.slice(2);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs
    .readdirSync(SVG_DIR)
    .filter((f) => f.endsWith('.svg'))
    .filter((f) => !only.length || only.includes(f.replace(/\.svg$/, '')))
    .sort();
  const fontCss = fs.existsSync(FONT)
    ? `@font-face{font-family:'Bagel Fat One';src:url(data:font/ttf;base64,${fs.readFileSync(FONT).toString('base64')}) format('truetype');}`
    : '';
  const browser = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') && fs.statSync('/opt/pw-browsers/chromium').isFile()
      ? '/opt/pw-browsers/chromium'
      : undefined,
  });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) && only.length ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  for (const f of files) {
    const name = f.replace(/\.svg$/, '');
    const svg = fs.readFileSync(path.join(SVG_DIR, f), 'utf8');
    const pw = Math.round(parseFloat(attr(svg, 'width')));
    const ph = Math.round(parseFloat(attr(svg, 'height')));
    await page.setViewportSize({ width: pw, height: ph });
    await page.setContent(
      `<!doctype html><html><head><style>${fontCss}html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(OUT_DIR, `${name}.png`),
      omitBackground: true,
      clip: { x: 0, y: 0, width: pw, height: ph },
    });
    const entry = { w: Number(attr(svg, 'data-world-w')), h: Number(attr(svg, 'data-world-h')), px: [pw, ph] };
    const top = attr(svg, 'data-top');
    if (top !== undefined) entry.top = Number(top);
    manifest[name] = entry;
  }
  await browser.close();
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  fs.writeFileSync(manifestPath, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`rendered ${files.length} sprites -> ${path.relative(ROOT, OUT_DIR)}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
