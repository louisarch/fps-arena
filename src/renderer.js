import * as THREE from 'three';
import { WALLS, ARENA_HALF } from './game.js';

/** Original procedural scene; gameplay never depends on render frame rate. */
export class ArenaRenderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x08131e);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x08131e, .022);
    this.camera = new THREE.PerspectiveCamera(72, 1, .05, 100);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xb6e5ff, 0x263b41, 2));
    const light = new THREE.DirectionalLight(0xd3f3ff, 2.8);
    light.position.set(8, 20, 10); this.scene.add(light);
    this.walls = []; this.botMeshes = new Map(); this.orbs = new Map();
    this.ray = new THREE.Raycaster(); this.ray.far = 30;
    this.recoil = 0; this.tracerTime = 0;
    this.buildArena(); this.buildWeapon(); this.resize();
  }
  material(color, glow = false) {
    return glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: .62, metalness: .35 });
  }
  box(w, h, d, color, x, y, z, group = this.scene, glow = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.material(color, glow));
    mesh.position.set(x, y, z); group.add(mesh); return mesh;
  }
  buildArena() {
    this.box(40, .3, 40, 0x172b38, 0, -.2, 0);
    const grid = new THREE.GridHelper(36, 36, 0x287281, 0x25414f); grid.position.y = -.035; this.scene.add(grid);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.9, 6, 96), this.material(0x6cb8be, true));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -.02; this.scene.add(ring);
    for (const wall of WALLS) {
      const mesh = this.box(wall.w, wall.h, wall.d, 0x263b4d, wall.x, wall.h / 2, wall.z);
      this.walls.push(mesh);
      this.box(wall.w + .02, .06, wall.d + .02, 0x7ce8d4, wall.x, wall.h - .18, wall.z, this.scene, true);
      this.box(wall.w + .08, .15, wall.d + .08, 0x101f2d, wall.x, .12, wall.z);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x517588 }));
      edges.position.copy(mesh.position); this.scene.add(edges);
    }
    for (let i = -16; i <= 16; i += 4) {
      for (const side of [-1, 1]) {
        this.box(.35, 6, .5, 0x2e4659, i, 3, side * 18);
        this.box(.08, 4, .06, 0x5edfd7, i, 2.8, side * 17.7, this.scene, true);
        this.box(.5, 6, .35, 0x2e4659, side * 18, 3, i);
      }
    }
    for (const z of [-18, 18]) this.box(36, 1.8, .5, 0x1a3042, 0, .9, z);
    for (const x of [-18, 18]) this.box(.5, 1.8, 36, 0x1a3042, x, .9, 0);
    for (const z of [-17.6, 17.6]) this.box(36, .07, .08, 0x94edbc, 0, 1.9, z, this.scene, true);
    // Roof beams and suspended luminaire bands establish an architectural silhouette.
    for (const x of [-12, 0, 12]) {
      this.box(.3, .3, 36, 0x2b4656, x, 7, 0);
      this.box(.12, .04, 28, 0x9ccbd4, x, 6.8, 0, this.scene, true);
    }
    this.scene.updateMatrixWorld(true);
  }
  buildWeapon() {
    this.weapon = new THREE.Group(); this.camera.add(this.weapon);
    this.box(.23, .26, .62, 0x344c60, .32, -.29, -.55, this.weapon);
    this.box(.16, .12, .5, 0x112336, .32, -.17, -.65, this.weapon);
    this.box(.07, .035, .4, 0xa9efb6, .32, -.105, -.64, this.weapon, true);
    this.box(.13, .3, .16, 0x162a3d, .32, -.46, -.4, this.weapon);
    this.box(.3, .06, .1, 0x78929e, .32, -.28, -.86, this.weapon);
    this.flash = new THREE.Mesh(new THREE.OctahedronGeometry(.12), this.material(0xd1ffb8, true));
    this.flash.position.set(.32, -.25, -.96); this.flash.visible = false; this.weapon.add(this.flash);
    this.tracer = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xbdffc2, transparent: true, opacity: .65 }));
    this.scene.add(this.tracer); this.tracer.visible = false;
  }
  createBot(bot) {
    const group = new THREE.Group(); group.position.set(bot.x, bot.y, bot.z);
    const shell = this.material(0xa6b9c3); const core = this.material(0xf3a56b, true);
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(.65, 0), shell); body.scale.set(1, 1.1, .7); group.add(body);
    this.box(.76, .22, .15, 0x172a37, 0, .22, .45, group);
    const eye = this.box(.5, .055, .04, 0xffbd7d, 0, .23, .54, group, true);
    for (const x of [-.78, .78]) {
      this.box(.22, .5, .4, 0x486378, x, -.1, 0, group);
      this.box(.24, .08, .43, 0x7fe9cf, x, -.37, 0, group, true);
    }
    const engine = new THREE.Mesh(new THREE.ConeGeometry(.22, .5, 6), this.material(0x5adcca, true));
    engine.rotation.z = Math.PI; engine.position.y = -.7; group.add(engine);
    const healthBack = this.box(1.1, .07, .03, 0x193340, 0, 1, 0, group);
    const health = this.box(1.06, .045, .04, 0xa5f2b9, 0, 1, .03, group, true);
    group.userData = { id: bot.id, body, eye, shell, core, health, healthBack };
    group.traverse(o => { if (o.isMesh && o !== health && o !== healthBack) o.userData.botId = bot.id; });
    this.scene.add(group); this.botMeshes.set(bot.id, group); return group;
  }
  sync(game, dt, time) {
    if (!['PLAYING', 'INTERMISSION'].includes(game.state)) dt = 0;
    const p = game.player;
    this.camera.position.set(p.x, p.y, p.z);
    this.camera.rotation.set(p.pitch, -p.yaw, 0, 'YXZ');
    this.weapon.visible = ['PLAYING', 'INTERMISSION', 'PAUSED'].includes(game.state);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.weapon.position.z = this.recoil * .13;
    this.weapon.rotation.x = this.recoil * .06;
    this.weapon.position.y = game.reloadRemaining > 0 ? -.2 : 0;
    this.flash.visible = this.recoil > .7;
    const bots = game.state === 'MENU' ? [{ id: 'preview-a', x: -7, y: 1.3, z: 1, hp: 100 }, { id: 'preview-b', x: 0, y: 1.3, z: -2, hp: 100 }, { id: 'preview-c', x: 7, y: 1.3, z: 1, hp: 100 }] : game.bots;
    const alive = new Set(bots.filter(b => b.hp > 0).map(b => b.id));
    for (const [id, group] of this.botMeshes) if (!alive.has(id)) { this.disposeGroup(group); this.botMeshes.delete(id); }
    for (const bot of bots) {
      if (bot.hp <= 0) continue;
      const group = this.botMeshes.get(bot.id) || this.createBot(bot);
      group.position.set(bot.x, bot.y, bot.z);
      group.rotation.y = Math.atan2(p.x - bot.x, p.z - bot.z);
      group.userData.health.scale.x = bot.hp / 100;
      group.userData.eye.material.color.setHex(bot.charge > 0 ? 0xff405b : 0xffbd7d);
      group.userData.body.material.color.setHex(bot.hitTimer > 0 ? 0xffffff : bot.charge > 0 ? 0xf6a26c : 0xa6b9c3);
    }
    const ids = new Set(game.projectiles.map(p => p.id));
    for (const [id, orb] of this.orbs) if (!ids.has(id)) { this.disposeGroup(orb); this.orbs.delete(id); }
    for (const shot of game.projectiles) {
      let orb = this.orbs.get(shot.id);
      if (!orb) { orb = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 8), this.material(0xff5272, true)); this.scene.add(orb); this.orbs.set(shot.id, orb); }
      orb.position.set(shot.x, shot.y, shot.z);
    }
    if (game.state === 'PLAYING') this.tracerTime = Math.max(0, this.tracerTime - dt);
    this.tracer.visible = this.tracerTime > 0;
    this.scene.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.camera);
  }
  target() {
    this.scene.updateMatrixWorld(true);
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const wallHit = this.ray.intersectObjects(this.walls, false)[0];
    let distance = wallHit?.distance ?? 30;
    let id = null;
    let point = wallHit?.point ?? this.ray.ray.at(30, new THREE.Vector3());
    // A body-sized box avoids numerical misses on shared low-poly triangle edges.
    // Wall distance still wins, so a robot behind cover cannot be hit.
    for (const [botId, mesh] of this.botMeshes) {
      const p = mesh.position;
      const box = new THREE.Box3(new THREE.Vector3(p.x - .64, p.y - .7, p.z - .48), new THREE.Vector3(p.x + .64, p.y + .7, p.z + .48));
      const hit = this.ray.ray.intersectBox(box, new THREE.Vector3());
      if (!hit) continue;
      const hitDistance = hit.distanceTo(this.ray.ray.origin);
      if (hitDistance < distance && hitDistance <= 30) { distance = hitDistance; point = hit; id = botId; }
    }
    return { id, point };
  }
  shot(point) {
    this.recoil = 1; this.tracerTime = .07;
    const start = this.camera.localToWorld(new THREE.Vector3(.32, -.25, -.95));
    this.tracer.geometry.dispose(); this.tracer.geometry = new THREE.BufferGeometry().setFromPoints([start, point]);
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
  }
  disposeGroup(group) {
    group.traverse(o => { o.geometry?.dispose(); if (o.material) o.material.dispose(); }); this.scene.remove(group);
  }
}
