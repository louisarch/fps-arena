import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('./?test=1');
  await page.waitForFunction(() => window.__arena?.renderer);
}
async function begin(page) {
  await open(page);
  await page.getByRole('button', { name: 'Mulai operasi', exact: true }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.waitForTimeout(250);
}
async function aim(page, index = 1) {
  await page.evaluate(index => {
    const { game, renderer } = window.__arena;
    const b = game.bots[index], p = game.player;
    p.yaw = Math.atan2(b.x - p.x, p.z - b.z);
    p.pitch = Math.atan2(b.y - p.y, Math.hypot(b.x - p.x, b.z - p.z));
    renderer.sync(game, 0, 0);
  }, index);
}

test('desktop: start, pointer lock, mouse look, movement, hit, reload, pause, defeat, retry', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await begin(page);
  await expect(page.locator('#health')).toHaveText('100');
  await expect(page.locator('#ammo')).toHaveText('12');
  expect(await page.evaluate(() => window.__arena.game.bots.length)).toBe(3);
  expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe('arena');
  const beforeYaw = await page.evaluate(() => window.__arena.game.player.yaw);
  await page.mouse.move(100, 60);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 40, movementY: -10 })));
  await expect.poll(() => page.evaluate(() => window.__arena.game.player.yaw)).not.toBe(beforeYaw);
  expect(await page.evaluate(() => window.__arena.game.player.yaw)).not.toBe(beforeYaw);
  await page.evaluate(() => { window.__arena.game.player.yaw = 0; });
  const beforeZ = await page.evaluate(() => window.__arena.game.player.z);
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__arena.game.player.z)).toBeLessThan(beforeZ);
  await page.keyboard.up('w');
  expect(await page.evaluate(() => window.__arena.game.player.z)).toBeLessThan(beforeZ);
  // Native click proves the input path; aim/raycast is checked separately below.
  await page.mouse.down(); await page.mouse.up();
  await expect(page.locator('#ammo')).toHaveText('11');
  await page.waitForFunction(() => window.__arena.game._shotCooldown <= 0);
  await page.evaluate(() => {
    const {game,renderer,fire}=window.__arena; const b=game.bots[1],p=game.player;
    p.yaw=0; p.pitch=Math.atan2(b.y-p.y,p.z-b.z); renderer.sync(game,0,0); fire();
  });
  expect(await page.evaluate(() => window.__arena.game.bots[1].hp)).toBe(66);
  await expect(page.locator('#feedback')).toContainText('Kena');
  await page.keyboard.press('KeyR');
  expect(await page.evaluate(() => window.__arena.game.reloadRemaining)).toBeGreaterThan(0);
  // Use the visible UI pause action, not a direct simulation call.
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.locator('#overlay')).toBeVisible();
  expect(await page.evaluate(() => window.__arena.game.state)).toBe('PAUSED');
  const frozen = await page.evaluate(() => JSON.stringify(window.__arena.game));
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => JSON.stringify(window.__arena.game))).toBe(frozen);
  await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
  await expect(page.locator('#ammo')).toHaveText('12', { timeout: 15000 });
  await expect(page.locator('#reserve')).toHaveText('46');
  await page.evaluate(() => { window.__arena.game.damage(100); window.__arena.renderUI(); });
  await expect(page.locator('#title')).toContainText('COBA');
  await page.getByRole('button', { name: 'Main lagi', exact: true }).click();
  await expect(page.locator('#health')).toHaveText('100');
  await expect(page.locator('#ammo')).toHaveText('12');
  expect(errors).toEqual([]);
});

test('raycast: wall occludes a target, misses do not score, three hits eliminate', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = undefined; });
  await begin(page);
  await page.evaluate(() => {
    const { game, renderer, fire } = window.__arena;
    const b = game.bots[1]; b.x = 0; b.z = -10;
    game.player.yaw=0; game.player.pitch=Math.atan2(b.y-game.player.y,game.player.z-b.z);
    renderer.sync(game, 0, 0); fire();
  });
  expect(await page.evaluate(() => window.__arena.game.hits)).toBe(0);
  expect(await page.evaluate(() => window.__arena.game.score)).toBe(0);
  await page.evaluate(() => { window.__arena.game.bots[1].z = -2; });
  await aim(page);
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => window.__arena.game._shotCooldown <= 0);
    await page.evaluate(() => {
      const {game,renderer,fire}=window.__arena; const b=game.bots[1],p=game.player;
      p.yaw=Math.atan2(b.x-p.x,p.z-b.z);p.pitch=Math.atan2(b.y-p.y,Math.hypot(b.x-p.x,b.z-p.z));
      renderer.sync(game,0,0); fire();
    });
  }
  expect(await page.evaluate(() => window.__arena.game.score)).toBe(100);
  expect(await page.evaluate(() => window.__arena.game.hits)).toBe(3);
  expect(await page.evaluate(() => window.__arena.game.bots.length)).toBe(2);
});

test('deterministic integration: three waves to victory and terminal freeze', async ({ page }) => {
  await begin(page);
  const result = await page.evaluate(() => {
    const { game, renderUI } = window.__arena;
    // Controlled clock & aim bypass only: real damage/ammo/wave methods remain in use.
    for (let wave = 1; wave <= 3; wave++) {
      game.projectiles = []; game.bots.forEach(b => { b.cooldown = 1000; });
      for (const b of [...game.bots]) {
        // Move to an unobstructed firing position for each target.
        game.player.x = b.x; game.player.z = b.z + 3;
        for (let shot = 0; shot < 3; shot++) {
          if (!game.ammo) { game.reload(); game.tick(1.2); }
          game.tick(.2); game.fire(b.id);
        }
      }
      game.tick(1.5);
    }
    renderUI(); return { state: game.state, score: game.score, hits: game.hits, shots: game.shots };
  });
  expect(result).toEqual({ state: 'VICTORY', score: 1200, hits: 36, shots: 36 });
  await expect(page.locator('#title')).toContainText('BERSIH');
  const frozen = await page.evaluate(() => JSON.stringify(window.__arena.game));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => JSON.stringify(window.__arena.game))).toBe(frozen);
});

for (const size of [{ width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`responsive ${size.width}×${size.height}: touch move, look, fire, reload, pause`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await begin(page);
    await expect(page.locator('#touch-controls')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const before = await page.evaluate(() => ({...window.__arena.game.player}));
    const joystick = page.locator('#joystick'), bounds = await joystick.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 10);
    await page.waitForTimeout(150); await page.mouse.up();
    expect(await page.evaluate(() => window.__arena.game.player.z)).toBeLessThan(before.z);
    const look = await page.locator('#look-pad').boundingBox();
    await page.mouse.move(look.x + 20, look.y + 30); await page.mouse.down();
    await page.mouse.move(look.x + 70, look.y + 50); await page.mouse.up();
    expect(await page.evaluate(() => window.__arena.game.player.yaw)).not.toBe(before.yaw);
    await page.getByRole('button', { name: 'Tembak', exact: true }).tap();
    await expect(page.locator('#ammo')).toHaveText('11');
    await page.locator('#touch-reload').tap();
    expect(await page.evaluate(() => window.__arena.game.reloadRemaining)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Jeda permainan', exact: true }).tap();
    await expect(page.locator('#overlay')).toBeVisible();
    expect(errors).toEqual([]); await context.close();
  });
}

test('fallback: missing pointer lock provides touch controls', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = undefined; });
  await begin(page); await expect(page.locator('#touch-controls')).toBeVisible();
  await page.getByRole('button', { name: 'Tembak', exact: true }).click();
  await expect(page.locator('#ammo')).toHaveText('11');
});

test('fallback: unavailable WebGL shows useful message and disables start', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.goto('./');
  await expect(page.locator('#support')).toContainText('WebGL tidak tersedia');
  await expect(page.locator('#primary')).toBeDisabled();
});
