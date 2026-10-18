import './style.css';
import { Game } from './game.js';
import { ArenaRenderer } from './renderer.js';

const $ = id => document.getElementById(id);
const game = new Game();
const canvas = $('arena');
let renderer;
let touch = matchMedia('(pointer: coarse)').matches || !canvas.requestPointerLock;
let muted = false, audio, lastState = '', lastTime = performance.now(), sprintTouch = false;
const keys = new Set();
const stick = { x: 0, y: 0 };
function setTouch() { document.body.classList.toggle('touch', touch); }
setTouch();
function tone(frequency, duration = .07, type = 'sine', volume = .045) {
  if (muted) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
  } catch { /* Audio is optional; gameplay remains available. */ }
}
function fallback() {
  touch = true; setTouch();
  $('support').textContent = 'Pointer Lock tidak tersedia. Gunakan joystick, geser kanan untuk melihat, dan tombol Tembak.';
}
function lock() {
  if (touch) return;
  try { const result = canvas.requestPointerLock(); result?.catch(fallback); } catch { fallback(); }
}
function unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
function pause() {
  game.pause(); keys.clear(); stick.x = stick.y = 0; sprintTouch = false; unlock(); renderUI();
}
function startOrResume() {
  if (!renderer) return;
  if (game.state === 'PAUSED') game.resume(); else game.start();
  stick.x = stick.y = 0; joystickPointer = null; lookPointer = null; sprintTouch = false;
  $('stick').style.transform = '';
  keys.clear(); lastTime = performance.now(); lock(); tone(500, .12); renderUI();
}
function fire() {
  if (game.state !== 'PLAYING') return;
  // Camera and meshes match current simulation even before the next animation frame.
  renderer.sync(game, 0, 0);
  const target = renderer.target();
  const result = game.fire(target.id);
  if (result.fired) { renderer.shot(target.point); tone(result.hit ? 680 : 180, .065, 'triangle'); }
  else if (game.ammo === 0) tone(100, .06, 'square', .02);
  renderUI();
}
$('primary').addEventListener('click', startOrResume);
$('secondary').addEventListener('click', () => { game.state = 'MENU'; unlock(); renderUI(); });
$('pause-button').addEventListener('click', pause);
for (const id of ['reload-button', 'touch-reload']) $(id).addEventListener('click', () => { game.reload(); renderUI(); });
$('fire-button').addEventListener('pointerdown', e => { e.preventDefault(); fire(); });
$('mute-button').addEventListener('click', () => {
  muted = !muted;
  $('mute-button').setAttribute('aria-label', muted ? 'Aktifkan suara' : 'Matikan suara');
  $('mute-button').setAttribute('title', muted ? 'Suara mati' : 'Suara aktif');
  $('mute-button').setAttribute('aria-pressed', String(muted));
});
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || touch || game.state !== 'PLAYING') return;
  if (document.pointerLockElement === canvas) fire(); else lock();
});
document.addEventListener('pointerlockerror', fallback);
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && !touch && ['PLAYING', 'INTERMISSION'].includes(game.state)) pause();
});
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas && game.state === 'PLAYING') game.look(e.movementX, e.movementY);
});
document.addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    e.preventDefault();
    if (game.state === 'PAUSED') startOrResume();
    else if (['PLAYING', 'INTERMISSION'].includes(game.state)) pause();
    return;
  }
  if (e.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(e.code)) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyR'].includes(e.code)) {
    e.preventDefault(); keys.add(e.code);
    if (e.code === 'KeyR' && !e.repeat) game.reload();
  }
});
document.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { if (['PLAYING', 'INTERMISSION'].includes(game.state)) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && ['PLAYING', 'INTERMISSION'].includes(game.state)) pause(); });

const joystick = $('joystick'); let joystickPointer = null;
function moveStick(e) {
  if (e.pointerId !== joystickPointer || game.state !== 'PLAYING') return;
  const bounds = joystick.getBoundingClientRect(), radius = bounds.width * .35;
  let x = (e.clientX - bounds.left - bounds.width / 2) / radius;
  let y = (e.clientY - bounds.top - bounds.height / 2) / radius;
  const magnitude = Math.max(1, Math.hypot(x, y)); x /= magnitude; y /= magnitude;
  stick.x = x; stick.y = y; $('stick').style.transform = `translate(${x * radius}px, ${y * radius}px)`;
}
joystick.addEventListener('pointerdown', e => { e.preventDefault(); joystickPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); moveStick(e); });
joystick.addEventListener('pointermove', moveStick);
function resetStick(e) { if (e.pointerId !== joystickPointer) return; joystickPointer = null; stick.x = stick.y = 0; $('stick').style.transform = ''; }
joystick.addEventListener('pointerup', resetStick); joystick.addEventListener('pointercancel', resetStick);
const lookPad = $('look-pad'); let lookPointer = null, lookX = 0, lookY = 0;
lookPad.addEventListener('pointerdown', e => { e.preventDefault(); lookPointer = e.pointerId; lookX = e.clientX; lookY = e.clientY; lookPad.setPointerCapture(e.pointerId); });
lookPad.addEventListener('pointermove', e => {
  if (e.pointerId !== lookPointer || game.state !== 'PLAYING') return;
  game.look((e.clientX - lookX) * 1.7, (e.clientY - lookY) * 1.7); lookX = e.clientX; lookY = e.clientY;
});
for (const event of ['pointerup', 'pointercancel']) lookPad.addEventListener(event, () => { lookPointer = null; });
$('sprint-button').addEventListener('pointerdown', e => { e.preventDefault(); sprintTouch = true; e.currentTarget.setPointerCapture(e.pointerId); });
for (const event of ['pointerup', 'pointercancel']) $('sprint-button').addEventListener(event, () => { sprintTouch = false; });

function renderUI() {
  const state = game.state;
  const inGame = ['PLAYING', 'INTERMISSION', 'PAUSED'].includes(state);
  document.body.classList.toggle('playing', inGame);
  $('hud').hidden = !inGame; $('touch-controls').hidden = !inGame || state === 'PAUSED';
  $('crosshair').hidden = !inGame || state === 'PAUSED';
  $('pause-button').hidden = !inGame || state === 'PAUSED';
  $('reload-button').hidden = !inGame || state === 'PAUSED' || touch;
  $('mute-button').hidden = !inGame;
  $('overlay').hidden = ['PLAYING', 'INTERMISSION'].includes(state);
  $('health').textContent = game.player.hp; $('health-bar').style.width = `${game.player.hp}%`;
  $('ammo').textContent = String(game.ammo).padStart(2, '0'); $('reserve').textContent = game.reserve;
  $('score').textContent = String(game.score).padStart(4, '0'); $('wave').textContent = `${game.wave || 1} / 3`;
  const accuracy = game.shots ? Math.round(game.hits / game.shots * 100) : 0;
  $('accuracy').textContent = `${accuracy}%`; $('enemies').textContent = game.bots.filter(b => b.hp > 0).length;
  for (const id of ['reload-button', 'touch-reload']) $(id).disabled = state !== 'PLAYING' || game.ammo >= 12 || game.reserve <= 0 || game.reloadRemaining > 0;
  const reloading = game.reloadRemaining > 0;
  $('reload-button').textContent = reloading ? `Memuat ${game.reloadRemaining.toFixed(1)} dtk` : 'Muat ulang · R';
  let feedback = reloading ? 'Memuat ulang…' : game.hitTimer > 0 ? 'Kena' : game.ammo === 0 ? 'Amunisi habis · Muat ulang' : '';
  if (state === 'INTERMISSION') feedback = `Gelombang ${game.wave} bersih · Bersiap!`;
  else if (state === 'PLAYING' && !feedback && game.bots.some(b => b.charge > 0)) feedback = 'Bahaya · Bergerak untuk menghindar';
  if ($('feedback').textContent !== feedback) $('feedback').textContent = feedback;
  $('crosshair').classList.toggle('hit', game.hitTimer > 0);
  $('damage-overlay').style.opacity = game.damageTimer > 0 ? '.65' : '0';
  $('damage-overlay').classList.toggle('active', game.damageTimer > 0);
  if (state !== lastState) {
    if (!['PLAYING', 'INTERMISSION'].includes(state)) {
      unlock();
      const content = {
        MENU: ['SIMULASI TEMPUR / 01', 'PULSE<br><span>ARENA</span>', 'Bidik dengan tenang. Bergerak tanpa henti. Taklukkan tiga gelombang robot di arena latihan.', 'Mulai operasi'],
        PAUSED: ['OPERASI DITAHAN', 'AMBIL<br><span>NAPAS.</span>', 'Arena berhenti. Semua amunisi, posisi, dan waktu tetap tersimpan.', 'Lanjutkan'],
        VICTORY: ['OPERASI SELESAI', 'ARENA<br><span>BERSIH.</span>', 'Tiga gelombang ditaklukkan. Presisi dan pergerakanmu berhasil.', 'Main lagi'],
        DEFEAT: ['SINYAL TERPUTUS', 'COBA<br><span>LAGI.</span>', 'Robot menguasai arena. Hindari cahaya merah, manfaatkan pelindung, dan jaga amunisi.', 'Main lagi'],
      }[state];
      if (content) {
        $('eyebrow').textContent = content[0]; $('title').innerHTML = content[1]; $('description').textContent = content[2]; $('primary').textContent = content[3];
        $('title').querySelector('span')?.classList.add('hero-title-second');
        $('primary').setAttribute('aria-label', content[3]);
        $('secondary').hidden = state === 'MENU'; $('controls-help').hidden = state !== 'MENU';
        $('stats').hidden = !['VICTORY', 'DEFEAT'].includes(state);
        $('stats').textContent = `Skor ${game.score} · Akurasi ${accuracy}% · Gelombang ${game.wave}/3`;
        $('primary').focus({ preventScroll: true });
      }
    }
    lastState = state;
  }
}
try {
  renderer = new ArenaRenderer(canvas);
  $('support').textContent = `WebGL siap · ${canvas.requestPointerLock ? 'Pointer Lock tersedia' : 'Mode sentuh / geser tersedia'}`;
  const loop = time => {
    const dt = Math.min(.05, Math.max(0, (time - lastTime) / 1000)); lastTime = time;
    game.move(Number(keys.has('KeyW')) - Number(keys.has('KeyS')) - stick.y, Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + stick.x, keys.has('ShiftLeft') || keys.has('ShiftRight') || sprintTouch, dt);
    game.tick(dt); renderer.sync(game, dt, time / 1000); renderUI(); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop); window.addEventListener('resize', () => renderer.resize());
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); $('support').textContent = 'Koneksi WebGL terputus. Muat ulang halaman untuk mencoba kembali.'; $('primary').disabled = true; });
} catch (error) {
  $('support').textContent = 'WebGL tidak tersedia. Aktifkan akselerasi perangkat keras atau coba browser modern lain. Arena tidak dapat dimulai.';
  $('webgl-status').textContent = 'TIDAK TERSEDIA';
  $('primary').disabled = true;
  console.warn('WebGL tidak tersedia:', error.message);
}
renderUI();
// Explicit opt-in harness for reproducible QA, never enabled in a normal session.
if (new URLSearchParams(location.search).get('test') === '1') {
  window.__arena = { game, renderer, renderUI, fire, setTouch: () => { touch = true; setTouch(); }, snapshot: () => JSON.parse(JSON.stringify(game)) };
}
