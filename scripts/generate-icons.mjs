// Renders public/favicon.svg into the PNG icons required by the web app
// manifest (Android needs 192px and 512px PNGs, plus a maskable variant).
// Usage: npm run icons   (requires `npx playwright install chromium` once)
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const out = (name) => new URL(`../public/${name}`, import.meta.url);

/** Maskable icons need the artwork inside the central 80% "safe zone". */
function page(size, { maskable = false, background = 'transparent' } = {}) {
  const inner = maskable ? Math.round(size * 0.72) : size;
  const bg = maskable ? '#00a884' : background;
  return `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${bg}">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`;
}

// PW_CHANNEL=chrome|msedge uses an installed browser instead of Playwright's download.
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const p = await ctx.newPage();
const targets = [
  ['pwa-192x192.png', 192, {}],
  ['pwa-512x512.png', 512, {}],
  ['maskable-512x512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { background: '#ffffff' }],
];
for (const [name, size, opts] of targets) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(page(size, opts));
  const buf = await p.screenshot({ omitBackground: !opts.maskable && !opts.background, clip: { x: 0, y: 0, width: size, height: size } });
  await writeFile(out(name), buf);
  console.log('wrote', name);
}
await browser.close();
