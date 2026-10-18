import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_HALF, BOT_SPAWNS, Game, WALLS } from '../src/game.js';

const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} not near ${expected}`);
const waitForNextShot = (game) => game.tick(0.18);

function killWave(game) {
  while (game.bots.length) {
    const bot = game.bots[0];
    // The individual 3-hit elimination rule is covered separately; shorten this
    // helper so these state-machine tests do not needlessly wait through attacks.
    bot.hp = 34;
    const result = game.fire(bot.id);
    assert.deepEqual(result, { fired: true, hit: true, killed: true });
    if (game.bots.length) waitForNextShot(game);
  }
}

test('exports deterministic arena geometry and spawn locations', () => {
  assert.equal(ARENA_HALF, 18);
  assert.ok(WALLS.length >= 4);
  assert.equal(BOT_SPAWNS.length, 5);
  assert.ok(WALLS.every(({ x, z, w, d, h }) => [x, z, w, d, h].every(Number.isFinite)));
});

test('constructor begins in a clean menu state', () => {
  const game = new Game();
  assert.equal(game.state, 'MENU');
  assert.deepEqual(game.player, { x: 0, y: 1.65, z: 12, yaw: 0, pitch: 0, hp: 100 });
  assert.deepEqual(game.bots, []);
  assert.deepEqual(game.projectiles, []);
});

test('start initializes wave one, ammo, health, score, and deterministic bots', () => {
  const game = new Game().start();
  assert.equal(game.state, 'PLAYING');
  assert.equal(game.player.hp, 100);
  assert.equal(game.wave, 1);
  assert.equal(game.score, 0);
  assert.equal(game.ammo, 12);
  assert.equal(game.reserve, 48);
  assert.equal(game.bots.length, 3);
  assert.deepEqual(game.bots.map(({ x, z }) => ({ x, z })), BOT_SPAWNS.slice(0, 3));
});

test('start from a completed session resets all session statistics', () => {
  const game = new Game().start();
  game.score = 900;
  game.damage(40);
  game.start();
  assert.equal(game.player.hp, 100);
  assert.equal(game.score, 0);
  assert.equal(game.shots, 0);
  assert.equal(game.hits, 0);
  assert.equal(game.state, 'PLAYING');
});

test('firing without a target consumes one round and counts a miss', () => {
  const game = new Game().start();
  assert.deepEqual(game.fire(), { fired: true, hit: false, killed: false });
  assert.equal(game.ammo, 11);
  assert.equal(game.shots, 1);
  assert.equal(game.hits, 0);
  assert.equal(game.score, 0);
});

test('valid target hit deals 34 damage and updates hit feedback', () => {
  const game = new Game().start();
  const bot = game.bots[0];
  assert.deepEqual(game.fire(bot.id), { fired: true, hit: true, killed: false });
  assert.equal(bot.hp, 66);
  assert.equal(game.hits, 1);
  assert.equal(game.hitTimer, 0.35);
  assert.equal(game.message, 'Kena');
});

test('three successful hits eliminate a bot and award 100 points', () => {
  const game = new Game().start();
  const id = game.bots[0].id;
  game.fire(id);
  waitForNextShot(game);
  game.fire(id);
  waitForNextShot(game);
  const result = game.fire(id);
  assert.deepEqual(result, { fired: true, hit: true, killed: true });
  assert.equal(game.bots.some((bot) => bot.id === id), false);
  assert.equal(game.score, 100);
  assert.equal(game.shots, 3);
  assert.equal(game.hits, 3);
});

test('unknown targets and targets beyond 30 meters are misses', () => {
  const game = new Game().start();
  assert.equal(game.fire('missing').hit, false);
  waitForNextShot(game);
  const bot = game.bots[0];
  bot.x = 0;
  bot.z = -20;
  assert.equal(game.fire(bot.id).hit, false);
  assert.equal(bot.hp, 100);
  assert.equal(game.shots, 2);
});

test('arena wall blocks a shot to an otherwise in-range target', () => {
  const game = new Game().start();
  const bot = game.bots[0];
  bot.x = 0;
  bot.z = -10;
  assert.ok(WALLS.some((wall) => wall.x === 0 && wall.z === -6));
  const result = game.fire(bot.id);
  assert.equal(result.fired, true);
  assert.equal(result.hit, false);
  assert.equal(bot.hp, 100);
  assert.equal(game.score, 0);
});

test('shot cooldown rejects rapid fire without consuming ammo or shot count', () => {
  const game = new Game().start();
  game.fire();
  const result = game.fire();
  assert.deepEqual(result, { fired: false, hit: false, killed: false });
  assert.equal(game.ammo, 11);
  assert.equal(game.shots, 1);
  game.tick(0.18);
  assert.equal(game.fire().fired, true);
});

test('reload fills a partial magazine after exactly 1.2 seconds', () => {
  const game = new Game().start();
  game.fire();
  assert.equal(game.reload(), true);
  assert.equal(game.reloadRemaining, 1.2);
  game.tick(1.19);
  assert.equal(game.ammo, 11);
  game.tick(0.01);
  assert.equal(game.ammo, 12);
  assert.equal(game.reserve, 47);
  assert.equal(game.reloadRemaining, 0);
});

test('reload does not transfer ammo early; firing during reload is rejected', () => {
  const game = new Game().start();
  game.fire();
  game.reload();
  assert.equal(game.fire().fired, false);
  assert.equal(game.ammo, 11);
  assert.equal(game.reserve, 48);
});

test('reload refuses full magazine, empty reserve, and non-playing states', () => {
  const game = new Game().start();
  assert.equal(game.reload(), false);
  game.ammo = 0;
  game.reserve = 0;
  assert.equal(game.reload(), false);
  game.reserve = 48;
  game.pause();
  assert.equal(game.reload(), false);
});

test('reload transfers only available reserve and never exceeds magazine size', () => {
  const game = new Game().start();
  game.ammo = 2;
  game.reserve = 3;
  game.reload();
  game.tick(1.2);
  assert.equal(game.ammo, 5);
  assert.equal(game.reserve, 0);
});

test('movement follows forward direction, and sprint is 50 percent faster', () => {
  const game = new Game().start();
  game.move(1, 0, false, 1);
  near(game.player.z, 12 - 5.5);
  const walkingDistance = 12 - game.player.z;
  game.start();
  game.move(1, 0, true, 1);
  near(12 - game.player.z, walkingDistance * 1.5);
});

test('movement strafes relative to yaw and is clamped at arena boundaries', () => {
  const game = new Game().start();
  game.look( Math.PI * 250, 0); // yaw += pi/2
  game.move(1, 0, false, 0.2);
  near(game.player.x, 1.1);
  game.player.x = ARENA_HALF - 1;
  game.move(0, 1, true, 3);
  assert.ok(game.player.x < ARENA_HALF - 0.6);
});

test('movement collides with interior cover using player radius', () => {
  const game = new Game().start();
  game.player.x = 0;
  game.player.z = -4.2;
  game.move(1, 0, false, 1);
  assert.ok(game.player.z > -4.95);
  assert.equal(game.player.x, 0);
});

test('diagonal movement is normalized to the same speed as straight movement', () => {
  const game = new Game().start();
  game.move(1, 1, false, 1);
  near(Math.hypot(game.player.x, game.player.z - 12), 5.5);
});

test('look sensitivity is 0.002 radians per pixel and pitch clamps to 85 degrees', () => {
  const game = new Game().start();
  game.look(10, 10);
  near(game.player.yaw, 0.02);
  near(game.player.pitch, -0.02);
  game.look(0, -1e6);
  near(game.player.pitch, 85 * Math.PI / 180);
  game.look(0, 1e6);
  near(game.player.pitch, -85 * Math.PI / 180);
});

test('damage clamps HP at zero and defeat clears enemies and projectiles', () => {
  const game = new Game().start();
  game.projectiles.push({ id: 'test', x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0 });
  assert.equal(game.damage(101), true);
  assert.equal(game.player.hp, 0);
  assert.equal(game.state, 'DEFEAT');
  assert.equal(game.bots.length, 0);
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.damage(1), false);
});

test('bot telegraph takes at least 0.7 seconds before launching a projectile', () => {
  const game = new Game().start();
  game.tick(0.69);
  assert.equal(game.projectiles.length, 0);
  game.tick(0.01);
  assert.ok(game.projectiles.length >= 1);
});

test('projectile crossing arena cover is removed without damaging the player', () => {
  const game = new Game().start();
  game.player.x = 3;
  game.player.y = 1.3;
  game.player.z = -6;
  game.projectiles = [{ id: 'wall-test', x: -3, y: 1.3, z: -6, vx: 12, vy: 0, vz: 0 }];
  game.tick(0.5);
  assert.equal(game.player.hp, 100);
  assert.equal(game.projectiles.length, 0);
});

test('projectile that reaches the player damages once and is consumed', () => {
  const game = new Game().start();
  game.projectiles = [{ id: 'hit-test', x: 0, y: 1.65, z: 14, vx: 0, vy: 0, vz: -12 }];
  game.tick(0.25);
  assert.equal(game.player.hp, 90);
  assert.equal(game.projectiles.length, 0);
  assert.ok(game.damageTimer > 0);
});

test('defeat during projectile processing cannot restore earlier survivors', () => {
  const game = new Game().start();
  game.player.hp = 10;
  game.projectiles = [
    { id: 'survivor-before-death', x: 2, y: 1.65, z: 12, vx: 0, vy: 0, vz: 0 },
    { id: 'lethal', x: 0, y: 1.65, z: 12, vx: 0, vy: 0, vz: 0 },
  ];
  game.tick(0.01);
  assert.equal(game.state, 'DEFEAT');
  assert.deepEqual(game.projectiles, []);
});

test('pause/resume freezes simulation, timers, reload, bots, and projectiles', () => {
  const game = new Game().start();
  game.fire();
  game.reload();
  game.tick(0.2);
  const ammo = game.ammo;
  const reload = game.reloadRemaining;
  const charge = game.bots[0].charge;
  game.pause();
  game.tick(2);
  assert.equal(game.state, 'PAUSED');
  assert.equal(game.reloadRemaining, reload);
  assert.equal(game.ammo, ammo);
  assert.equal(game.bots[0].charge, charge);
  assert.equal(game.resume(), true);
  game.tick(0.1);
  assert.ok(game.reloadRemaining < reload);
});

test('pause can preserve and resume intermission state and timer', () => {
  const game = new Game().start();
  killWave(game);
  assert.equal(game.state, 'INTERMISSION');
  game.tick(0.4);
  const remaining = game.intermissionRemaining;
  assert.equal(game.pause(), true);
  game.tick(10);
  assert.equal(game.intermissionRemaining, remaining);
  game.resume();
  assert.equal(game.state, 'INTERMISSION');
  game.tick(remaining);
  assert.equal(game.state, 'PLAYING');
  assert.equal(game.wave, 2);
  assert.equal(game.bots.length, 4);
  assert.equal(game.ammo, 12);
});

test('wave transition waits 1.5 seconds and refills magazine but preserves HP', () => {
  const game = new Game().start();
  game.player.hp = 70;
  killWave(game);
  game.ammo = 2;
  assert.equal(game.intermissionRemaining, 1.5);
  game.tick(1.49);
  assert.equal(game.state, 'INTERMISSION');
  game.tick(0.01);
  assert.equal(game.state, 'PLAYING');
  assert.equal(game.wave, 2);
  assert.equal(game.bots.length, 4);
  assert.equal(game.player.hp, 70);
  assert.equal(game.ammo, 12);
  assert.equal(game.reserve, 48);
});

test('victory occurs after wave three intermission and results halt simulation', () => {
  const game = new Game().start();
  for (let wave = 1; wave <= 3; wave += 1) {
    if (wave > 1) game.tick(1.5);
    killWave(game);
  }
  assert.equal(game.state, 'INTERMISSION');
  game.tick(1.49);
  assert.equal(game.state, 'INTERMISSION');
  game.tick(0.01);
  assert.equal(game.state, 'VICTORY');
  assert.equal(game.bots.length, 0);
  const hp = game.player.hp;
  game.tick(100);
  assert.equal(game.player.hp, hp);
  assert.equal(game.pause(), false);
});

test('invalid and non-positive time steps do not advance simulation', () => {
  const game = new Game().start();
  const charge = game.bots[0].charge;
  game.tick(-3);
  game.tick(Number.NaN);
  assert.equal(game.bots[0].charge, charge);
});
