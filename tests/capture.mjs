import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4188/';
const out = process.env.CAPTURE_DIR || 'test-results/captures';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 720 }], ['mobile', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
    const page = await browser.newPage({ viewport, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.getByRole('button', { name: 'Mulai operasi', exact: true }).waitFor();
    await page.screenshot({ path: `${out}/${name}-menu.png` });
    await page.getByRole('button', { name: 'Mulai operasi', exact: true }).click();
    await page.locator('#hud').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${name}-gameplay.png` });
    console.log(JSON.stringify({ name, url: page.url(), errors, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), title: await page.title() }));
    await page.close();
  }
} finally { await browser.close(); }
