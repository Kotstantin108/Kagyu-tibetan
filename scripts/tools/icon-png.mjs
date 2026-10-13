// Renders site/icons/icon.svg to icon-192.png, icon-512.png and icon-maskable-512.png
// (the maskable one keeps the glyph inside the 80% safe zone on a solid background).
// Usage: node scripts/tools/icon-png.mjs   (needs playwright + chromium, like the smoke test)

import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const svg = await readFile(new URL('../../site/icons/icon.svg', import.meta.url), 'utf8');
const bg = (svg.match(/<rect[^>]*fill="(#[0-9a-fA-F]{6})"/) || [])[1] || '#6e1a28';
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(size, { maskable = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const inner = maskable ? Math.round(size * 0.8) : size;
  const off = Math.round((size - inner) / 2);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${maskable ? bg : 'transparent'}">` +
    `<div style="position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  return page.screenshot({ type: 'png', omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
}

const out = new URL('../../site/icons/', import.meta.url);
await writeFile(new URL('icon-192.png', out), await render(192));
await writeFile(new URL('icon-512.png', out), await render(512));
await writeFile(new URL('icon-maskable-512.png', out), await render(512, { maskable: true }));
await browser.close();
console.log('written icon-192.png, icon-512.png, icon-maskable-512.png');
