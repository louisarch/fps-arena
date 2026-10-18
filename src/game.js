// Deterministic, renderer-independent gameplay rules for Pulse Arena.
// Coordinates use +Y as up; yaw=0 faces toward -Z. Distances are in meters.

export const ARENA_HALF = 18;

/** Axis-aligned arena and cover boxes. Each box is {x,z,w,d,h} (center, width, depth, height). */
export const WALLS = [
  { x: 0, z: -ARENA_HALF, w: 2 * ARENA_HALF, d: 0.6, h: 4 },
  { x: 0, z: ARENA_HALF, w: 2 * ARENA_HALF, d: 0.6, h: 4 },
  { x: -ARENA_HALF, z: 0, w: 0.6, d: 2 * ARENA_HALF, h: 4 },
  { x: ARENA_HALF, z: 0, w: 0.6, d: 2 * ARENA_HALF, h: 4 },
  // Interior cover is kept clear of the player's initial sightlines and all spawn points.
  { x: 0, z: -6, w: 3.2, d: 1.4, h: 3 },
  { x: -11, z: -5, w: 2.4, d: 3.2, h: 3 },
  { x: 11, z: -5, w: 2.4, d: 3.2, h: 3 },
];

/** Stable spawn sequence; each wave uses the first 3, 4, or 5 positions. */
export const BOT_SPAWNS = [
  { x: -7, z: 1 },
  { x: 0, z: -2 },
  { x: 7, z: 1 },
  { x: -5, z: -10 },
  { x: 5, z: -10 },
];

const WAVE_COUNTS = [3, 4, 5];
const MAGAZINE_SIZE = 12;
const BOT_MAX_HP = 100;
const PLAYER_SPEED = 5.5;
const PLAYER_RADIUS = 0.35;
const SHOT_RANGE = 30;
const SHOT_COOLDOWN = 0.18;
const RELOAD_TIME = 1.2;
const INTERMISSION_TIME = 1.5;
const BOT_TELEGRAPH = 0.7;
const BOT_PROJECTILE_SPEED = 12;
const BOT_PROJECTILE_RADIUS = 0.18;
const PLAYER_PROJECTILE_RADIUS = 0.5;
const EPSILON = 1e-9;

const finiteNonNegative = (value) => Number.isFinite(value) && value > 0 ? value : 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function distance3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function pointInsideWall(x, y, z, wall, padding = 0) {
  return y >= 0 && y <= wall.h &&
    x >= wall.x - wall.w / 2 - padding && x <= wall.x + wall.w / 2 + padding &&
    z >= wall.z - wall.d / 2 - padding && z <= wall.z + wall.d / 2 + padding;
}

// Slab intersection against the solid 3D wall box, returning the first segment t in [0,1].
function segmentWallHit(from, to, wall) {
  const mins = [wall.x - wall.w / 2, 0, wall.z - wall.d / 2];
  const maxs = [wall.x + wall.w / 2, wall.h, wall.z + wall.d / 2];
  const starts = [from.x, from.y, from.z];
  const deltas = [to.x - from.x, to.y - from.y, to.z - from.z];
  let near = 0;
  let far = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(deltas[axis]) < EPSILON) {
      if (starts[axis] < mins[axis] || starts[axis] > maxs[axis]) return null;
      continue;
    }
    let t1 = (mins[axis] - starts[axis]) / deltas[axis];
    let t2 = (maxs[axis] - starts[axis]) / deltas[axis];
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
    if (near > far) return null;
  }
  return far >= 0 && near <= 1 ? Math.max(0, near) : null;
}

function circleTouchesWall(x, z, radius, wall) {
  const nearestX = clamp(x, wall.x - wall.w / 2, wall.x + wall.w / 2);
  const nearestZ = clamp(z, wall.z - wall.d / 2, wall.z + wall.d / 2);
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < radius * radius - EPSILON;
}

/**
 * Game exposes mutable renderer-friendly state and deterministic simulation methods.
 * `fire(targetId)` trusts the renderer's center-screen target selection, but validates
 * range and wall occlusion before applying damage. `tick(dt)` is the sole game clock.
 */
export class Game {
  constructor() {
    this._shotCooldown = 0;
    this._previousState = 'PLAYING';
    this._projectileSequence = 0;
    this._resetSession();
    this.state = 'MENU';
  }

  _resetSession() {
    this.player = { x: 0, y: 1.65, z: 12, yaw: 0, pitch: 0, hp: 100 };
    this.bots = [];
    this.projectiles = [];
    this.ammo = MAGAZINE_SIZE;
    this.reserve = 48;
    this.score = 0;
    this.wave = 1;
    this.shots = 0;
    this.hits = 0;
    this.reloadRemaining = 0;
    this.hitTimer = 0;
    this.damageTimer = 0;
    this.message = '';
    this.intermissionRemaining = 0;
    this._messageRemaining = 0;
    this._shotCooldown = 0;
    this._projectileSequence = 0;
  }

  _spawnWave() {
    this.bots = BOT_SPAWNS.slice(0, WAVE_COUNTS[this.wave - 1]).map((spawn, index) => {
      const id = `w${this.wave}-b${index + 1}`;
      return {
        id,
        x: spawn.x,
        y: 1.3,
        z: spawn.z,
        hp: BOT_MAX_HP,
        charge: 0,
        cooldown: index === 0 ? 0 : index * 0.55,
      };
    });
  }

  start() {
    this._resetSession();
    this.state = 'PLAYING';
    this._spawnWave();
    return this;
  }

  pause() {
    if (this.state !== 'PLAYING' && this.state !== 'INTERMISSION') return false;
    this._previousState = this.state;
    this.state = 'PAUSED';
    return true;
  }

  resume() {
    if (this.state !== 'PAUSED') return false;
    this.state = this._previousState;
    return true;
  }

  _finish(state) {
    this.state = state;
    this.bots = [];
    this.projectiles = [];
    this.reloadRemaining = 0;
    this.intermissionRemaining = 0;
    this.message = state === 'VICTORY' ? 'Arena ditaklukkan!' : 'Kamu tumbang!';
  }

  tick(dt) {
    let remaining = finiteNonNegative(dt);
    if (!remaining || (this.state !== 'PLAYING' && this.state !== 'INTERMISSION')) return;

    // Consume the interval in phases so a coarse frame cannot skip a wave transition.
    while (remaining > EPSILON && (this.state === 'PLAYING' || this.state === 'INTERMISSION')) {
      if (this.state === 'INTERMISSION') {
        const elapsed = Math.min(remaining, this.intermissionRemaining);
        this.intermissionRemaining = Math.max(0, this.intermissionRemaining - elapsed);
        remaining -= elapsed;
        if (this.intermissionRemaining <= EPSILON) {
          if (this.wave >= WAVE_COUNTS.length) {
            this._finish('VICTORY');
            break;
          }
          this.wave += 1;
          this.ammo = MAGAZINE_SIZE;
          this.reloadRemaining = 0;
          this._shotCooldown = 0;
          this.message = `Wave ${this.wave}`;
          this._spawnWave();
          this.state = 'PLAYING';
          if (remaining <= EPSILON) break;
        }
        continue;
      }

      const step = remaining;
      remaining = 0;
      this.hitTimer = Math.max(0, this.hitTimer - step);
      this.damageTimer = Math.max(0, this.damageTimer - step);
      this._shotCooldown = Math.max(0, this._shotCooldown - step);
      if (this.message && this.message !== 'Isi ulang' && this.message !== 'Amunisi habis') {
        // Keep hit and wave feedback transient; persistent reload message is cleared on completion.
        this._messageRemaining = Math.max(0, (this._messageRemaining ?? 1.2) - step);
        if (this._messageRemaining === 0) this.message = '';
      }

      if (this.reloadRemaining > 0) {
        this.reloadRemaining = Math.max(0, this.reloadRemaining - step);
        if (this.reloadRemaining <= EPSILON) {
          this.reloadRemaining = 0;
          const transfer = Math.min(MAGAZINE_SIZE - this.ammo, this.reserve);
          this.ammo += transfer;
          this.reserve -= transfer;
          this.message = 'Isi ulang selesai';
          this._messageRemaining = 1.2;
        }
      }

      this._tickBots(step);
      if (this.state !== 'PLAYING') break;
      this._tickProjectiles(step);
      if (this.state !== 'PLAYING') break;

      if (this.bots.length === 0) {
        this.state = 'INTERMISSION';
        this.intermissionRemaining = INTERMISSION_TIME;
        this.message = this.wave === WAVE_COUNTS.length ? 'Wave selesai' : `Wave ${this.wave} selesai`;
        this._messageRemaining = 0;
      }
    }
  }

  _tickBots(dt) {
    for (const bot of this.bots) {
      let chargeTime = dt;
      if (bot.cooldown > 0) {
        const cooldownBefore = bot.cooldown;
        bot.cooldown = Math.max(0, bot.cooldown - dt);
        if (bot.cooldown > 0) continue;
        chargeTime = Math.max(0, dt - cooldownBefore);
      }
      bot.charge += chargeTime;
      if (bot.charge + EPSILON >= BOT_TELEGRAPH) {
        this._launchProjectile(bot);
        bot.charge = 0;
        bot.cooldown = 3;
      }
    }
  }

  _launchProjectile(bot) {
    const origin = { x: bot.x, y: bot.y, z: bot.z };
    const target = { x: this.player.x, y: this.player.y, z: this.player.z };
    let dx = target.x - origin.x;
    let dy = target.y - origin.y;
    let dz = target.z - origin.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    dx /= length;
    dy /= length;
    dz /= length;
    this.projectiles.push({
      id: `p${++this._projectileSequence}`,
      x: origin.x,
      y: origin.y,
      z: origin.z,
      vx: dx * BOT_PROJECTILE_SPEED,
      vy: dy * BOT_PROJECTILE_SPEED,
      vz: dz * BOT_PROJECTILE_SPEED,
    });
  }

  _tickProjectiles(dt) {
    const survivors = [];
    for (const projectile of this.projectiles) {
      const from = { x: projectile.x, y: projectile.y, z: projectile.z };
      const to = {
        x: projectile.x + projectile.vx * dt,
        y: projectile.y + projectile.vy * dt,
        z: projectile.z + projectile.vz * dt,
      };
      const wallTime = WALLS.reduce((earliest, wall) => {
        const hit = segmentWallHit(from, to, wall);
        return hit !== null && (earliest === null || hit < earliest) ? hit : earliest;
      }, null);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = to.z - from.z;
      const lengthSquared = dx * dx + dy * dy + dz * dz;
      const playerTime = lengthSquared <= EPSILON ? 0 : clamp(
        ((this.player.x - from.x) * dx + (this.player.y - from.y) * dy + (this.player.z - from.z) * dz) / lengthSquared,
        0,
        1,
      );
      const closestPoint = {
        x: from.x + dx * playerTime,
        y: from.y + dy * playerTime,
        z: from.z + dz * playerTime,
      };
      const hitsPlayer = distance3(closestPoint, this.player) <= PLAYER_PROJECTILE_RADIUS;
      if (hitsPlayer && (wallTime === null || playerTime <= wallTime)) {
        this.damage(10);
        if (this.state === 'DEFEAT') {
          this.projectiles = [];
          return;
        }
        continue;
      }
      if (wallTime !== null) continue;
      projectile.x = to.x;
      projectile.y = to.y;
      projectile.z = to.z;
      // Projectiles are not allowed to persist indefinitely after missing.
      if (distance3(projectile, this.player) <= SHOT_RANGE + 5) survivors.push(projectile);
    }
    this.projectiles = survivors;
  }

  fire(targetId = null) {
    const result = { fired: false, hit: false, killed: false };
    if (this.state !== 'PLAYING' || this.reloadRemaining > 0 || this.ammo <= 0 || this._shotCooldown > 0) {
      if (this.state === 'PLAYING' && this.ammo <= 0) this.message = 'Amunisi habis';
      return result;
    }
    this.ammo -= 1;
    this.shots += 1;
    this._shotCooldown = SHOT_COOLDOWN;
    result.fired = true;
    this.message = '';
    this._messageRemaining = 0;

    const target = targetId == null ? null : this.bots.find((bot) => bot.id === targetId);
    if (!target || target.hp <= 0) return result;
    const eye = { x: this.player.x, y: this.player.y, z: this.player.z };
    const center = { x: target.x, y: target.y, z: target.z };
    const distance = distance3(eye, center);
    if (distance > SHOT_RANGE) return result;
    const wallTime = WALLS.reduce((earliest, wall) => {
      const hit = segmentWallHit(eye, center, wall);
      return hit !== null && (earliest === null || hit < earliest) ? hit : earliest;
    }, null);
    // A wall at the target endpoint does not count as cover, but anything earlier does.
    if (wallTime !== null && wallTime < 1 - EPSILON) return result;

    target.hp = Math.max(0, target.hp - 34);
    this.hits += 1;
    this.hitTimer = 0.35;
    this.message = 'Kena';
    this._messageRemaining = 0.8;
    result.hit = true;
    if (target.hp === 0) {
      this.bots = this.bots.filter((bot) => bot.id !== target.id);
      this.score += 100;
      result.killed = true;
      if (this.bots.length === 0) {
        this.state = 'INTERMISSION';
        this.intermissionRemaining = INTERMISSION_TIME;
        this.message = this.wave === WAVE_COUNTS.length ? 'Wave selesai' : `Wave ${this.wave} selesai`;
        this._messageRemaining = 0;
      }
    }
    return result;
  }

  reload() {
    if (this.state !== 'PLAYING' || this.reloadRemaining > 0 || this.ammo >= MAGAZINE_SIZE || this.reserve <= 0) return false;
    this.reloadRemaining = RELOAD_TIME;
    this.message = 'Isi ulang';
    this._messageRemaining = 0;
    return true;
  }

  damage(amount) {
    if (this.state !== 'PLAYING') return false;
    const damageAmount = finiteNonNegative(amount);
    if (!damageAmount) return false;
    this.player.hp = Math.max(0, this.player.hp - damageAmount);
    this.damageTimer = 0.45;
    this.message = 'Terkena serangan';
    this._messageRemaining = 0.8;
    if (this.player.hp <= 0) this._finish('DEFEAT');
    return true;
  }

  move(forward, right, sprint, dt) {
    if (this.state !== 'PLAYING') return false;
    const time = finiteNonNegative(dt);
    if (!time) return false;
    let f = Number.isFinite(forward) ? clamp(forward, -1, 1) : 0;
    let r = Number.isFinite(right) ? clamp(right, -1, 1) : 0;
    const inputLength = Math.hypot(f, r);
    if (inputLength > 1) {
      f /= inputLength;
      r /= inputLength;
    }
    const scale = PLAYER_SPEED * (sprint ? 1.5 : 1) * time;
    const dx = (Math.sin(this.player.yaw) * f + Math.cos(this.player.yaw) * r) * scale;
    const dz = (-Math.cos(this.player.yaw) * f + Math.sin(this.player.yaw) * r) * scale;
    // Substeps prevent a long frame or fast sprint from tunneling through thin walls.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (PLAYER_RADIUS * 0.5)));
    const stepX = dx / steps;
    const stepZ = dz / steps;
    for (let step = 0; step < steps; step += 1) {
      const tryX = this.player.x + stepX;
      if (!WALLS.some((wall) => wall.h >= 1.8 && circleTouchesWall(tryX, this.player.z, PLAYER_RADIUS, wall))) {
        this.player.x = tryX;
      }
      const tryZ = this.player.z + stepZ;
      if (!WALLS.some((wall) => wall.h >= 1.8 && circleTouchesWall(this.player.x, tryZ, PLAYER_RADIUS, wall))) {
        this.player.z = tryZ;
      }
    }
    return true;
  }

  look(dx, dy) {
    if (this.state !== 'PLAYING') return false;
    const horizontal = Number.isFinite(dx) ? dx : 0;
    const vertical = Number.isFinite(dy) ? dy : 0;
    this.player.yaw += horizontal * 0.002;
    this.player.pitch = clamp(this.player.pitch - vertical * 0.002, -85 * Math.PI / 180, 85 * Math.PI / 180);
    return true;
  }
}
