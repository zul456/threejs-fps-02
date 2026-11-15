// DUSTLINE boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. ?shot=start|play|buy|plant with &seed=N stages a
// deterministic frame for a capture, renders it twice, then freezes it and
// sets window.__shotReady.
import * as THREE from 'three';
import { TICK, WEAPONS, GRENADES, PLANT_TIME, DEFUSE_TIME } from './config.js';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createMap, SITES, SPAWNS } from './map.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createGrenades } from './grenades.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createEffects } from './effects.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const shotRandom = mulberry32(seed * 7919 + 13);
const liveRandom = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 78);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const audio = createAudio();
const effects = createEffects(scene);
const world = createMap(scene);
const hud = createHud();
const player = createPlayer(world.colliders, audio);
const weapons = createWeapons(camera, audio);
const input = createInput(renderer.domElement, onLockChange);
const combat = createCombat(scene, world.shootables, world.colliders, effects, audio, onCombatEvent);
const grenades = createGrenades(scene, world.colliders, combat, effects, audio, (d) => hud.flashBang(d));

let simTime = 0;
let shakeTime = 0;
let shakeMag = 0;
let buyOpen = false;
let bombCarrier = 'bot'; // 'player' | 'bot' | null
let spectateTarget = null;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();

// The player as a fighter, the shape combat.js and the bots both read.
const playerFighter = {
  id: 'You', name: 'You', team: 'vanguard', isPlayer: true,
  get alive() { return player.state.alive; },
  get health() { return player.state.health; },
  get armor() { return player.state.armor; },
  get position() { return player.state.position; },
  get velocity() { return player.state.velocity; },
  groundSpeed: () => player.groundSpeed(),
  headPos: () => new THREE.Vector3(player.state.position.x, player.state.position.y + 1.56, player.state.position.z),
  chestPos: () => new THREE.Vector3(player.state.position.x, player.state.position.y + 1.15, player.state.position.z),
  aimPoint: (rnd) => {
    const p = rnd() < 0.15 ? playerFighter.headPos() : playerFighter.chestPos();
    p.x += (rnd() - 0.5) * 0.2;
    p.y += (rnd() - 0.5) * 0.2;
    return p;
  },
  viewDir: () => new THREE.Vector3(-Math.sin(player.state.yaw), 0, -Math.cos(player.state.yaw)),
  damage: (amount, part, attacker) => {
    const dealt = player.damage(amount);
    hud.damageFlash();
    audio.hurt();
    if (!player.state.alive) {
      rounds.state.deaths += 1;
      spectateTarget = pickAliveTeammate();
      hud.setSpectate(spectateTarget ? spectateTarget.name : null);
      if (bombCarrier === 'player') {
        bombCarrier = null;
        rounds.bombDropped(player.state.position);
      }
    }
    return !player.state.alive;
  },
  blind: (duration) => hud.flashBang(duration),
};

const api = {
  now: () => simTime,
  noise: (pos, radius, team) => bots.hear(pos, radius, team),
  plantComplete: (siteId, position) => rounds.plantComplete(siteId, position),
  defuseComplete: () => rounds.defuseComplete(),
  bombDropped: (position) => {
    bombCarrier = null;
    rounds.bombDropped(position);
  },
  bombPickedUp: (bot) => {
    bombCarrier = 'bot';
    rounds.bombPickedUp(bot);
  },
};

const bots = createBots(scene, {
  colliders: world.colliders, combat, effects, audio,
  random: liveRandom, getPlayer: () => playerFighter, api,
});
for (const name of ['Kestrel', 'Bramble', 'Juno', 'Pike']) {
  bots.makeBot(name, 'vanguard', SPAWNS.vanguard[0]);
}
for (const name of ['Vex', 'Onyx', 'Sable', 'Rook', 'Flint']) {
  bots.makeBot(name, 'sentinel', SPAWNS.sentinel[0]);
}
combat.setBotHitMeshes(bots.hitMeshes());

const rounds = createRounds(scene, {
  bots, player, audio, weapons,
  onEvent: onRoundEvent,
  spawn: () => SPAWNS.vanguard[1],
  spawns: () => SPAWNS,
  bombCarrier: () => bombCarrier,
  detonate: () => detonateBomb(),
});

function pickAliveTeammate() {
  const alive = bots.bots.filter((b) => b.alive && b.team === 'vanguard');
  return alive.length ? alive[Math.floor(liveRandom() * alive.length)] : null;
}

function detonateBomb() {
  const bomb = rounds.state.bomb;
  if (!bomb.position) return;
  effects.explosion(bomb.position);
  audio.explosion();
  shakeTime = 0.6;
  shakeMag = 0.5;
  const fighters = bots.fighters().concat([playerFighter]);
  combat.explosionDamage(bomb.position, 12, 300, null, fighters);
}

function onCombatEvent(event) {
  if (event.type !== 'kill') return;
  const killer = event.attacker;
  const victim = event.victim;
  hud.killfeed(killer ? killer.name : '—', victim.name, event.part === 'head', killer ? killer.team : null);
  if (killer === playerFighter) {
    rounds.addKillMoney();
    hud.setMoney(rounds.state.money);
  }
}

function onRoundEvent(event) {
  if (event.type === 'roundStart') {
    bombCarrier = 'bot';
    spectateTarget = null;
    hud.setSpectate(null);
    hud.setScore(rounds.state.score.vanguard, rounds.state.score.sentinel, rounds.state.round);
    hud.setMoney(rounds.state.money);
    combat.setBotHitMeshes(bots.hitMeshes());
  } else if (event.type === 'live') {
    hud.showPrompt('Round live — plant the device at A or B');
    setTimeout(() => hud.showPrompt(null), 3000);
  } else if (event.type === 'roundEnd') {
    buyOpen = false;
    hud.showBuy(false, 0, {});
    hud.showOverlay('round', {
      title: `${event.winner === 'vanguard' ? 'VANGUARD' : 'SENTINEL'} TAKES ROUND ${rounds.state.round}`,
      copy: `${event.reason}. Score ${event.score.vanguard} — ${event.score.sentinel}.`,
    });
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(() => hud.hideOverlay(), 4800);
  } else if (event.type === 'matchEnd') {
    hud.showOverlay('match', {
      title: `${event.winner === 'vanguard' ? 'VANGUARD' : 'SENTINEL'} WINS THE MATCH`,
      copy: `Final score ${event.score.vanguard} — ${event.score.sentinel}. Thanks for playing Yard 9.`,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (event.type === 'planted') {
    hud.setMoney(event.money);
  } else if (event.type === 'bombDropped') {
    hud.showPrompt('Device dropped — walk over it to pick it up');
    setTimeout(() => hud.showPrompt(null), 3000);
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    audio.unlock();
  } else if (rounds.state.phase !== 'matchover' && !buyOpen) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (rounds.state.phase === 'menu') {
    rounds.startMatch();
    input.requestLock();
  } else if (rounds.state.phase === 'matchover') {
    rounds.startMatch();
    input.requestLock();
  } else {
    input.requestLock();
  }
});

hud.onBuy((id) => {
  const result = rounds.buy(id);
  if (result.ok) {
    hud.setBuyHint('');
    hud.setMoney(rounds.state.money);
    hud.showBuy(true, rounds.state.money, ownedItems());
    refreshAmmoHud();
  } else {
    hud.setBuyHint(result.reason);
    audio.denied();
  }
});

function ownedItems() {
  const owned = {};
  for (const id of Object.keys(WEAPONS)) owned[id] = id === 'pistol' || weapons.state.weapons[id].mag > 0;
  owned.he = weapons.state.grenades.he > 0;
  owned.flash = weapons.state.grenades.flash > 0;
  owned.armor = player.state.armor > 0;
  return owned;
}

function refreshAmmoHud() {
  const def = weapons.currentDef();
  const w = weapons.currentState();
  const grenadeText = ` · HE ${weapons.state.grenades.he} · FLASH ${weapons.state.grenades.flash}`;
  hud.setAmmo(w.mag, w.reserve, `${def.name.toUpperCase()}${grenadeText}`);
}

const _dir = new THREE.Vector3();
function playerShoot() {
  const def = weapons.currentDef();
  if (!weapons.pullTrigger()) return;
  camera.getWorldDirection(_dir);
  const speed = player.groundSpeed();
  const spread = weapons.spread(speed, player.sprinting(input.state.keys));
  const pellets = def.pellets || 1;
  let hitAny = false;
  let killedAny = false;
  for (let i = 0; i < pellets; i += 1) {
    const ox = (liveRandom() * 2 - 1) * spread;
    const oy = (liveRandom() * 2 - 1) * spread;
    const oz = (liveRandom() * 2 - 1) * spread;
    _dir.x += ox;
    _dir.y += oy;
    _dir.z += oz;
    _dir.normalize();
    const result = combat.playerShoot(camera.position, _dir, def, playerFighter);
    if (result.hit) {
      hitAny = true;
      if (result.died) killedAny = true;
    }
    camera.getWorldDirection(_dir);
  }
  if (hitAny) hud.hitMarker(killedAny);
  player.recoil(def.kick, (liveRandom() * 2 - 1) * def.kick * 0.4);
  api.noise(player.state.position, 30, 'vanguard');
  refreshAmmoHud();
}

function throwGrenade(kind) {
  if (weapons.state.grenades[kind] <= 0) {
    audio.denied();
    return;
  }
  weapons.state.grenades[kind] -= 1;
  camera.getWorldDirection(_dir);
  const from = camera.position.clone().addScaledVector(_dir, 0.5);
  from.y -= 0.1;
  grenades.throwGrenade(kind, from, _dir.clone(), playerFighter);
  refreshAmmoHud();
}

function syncCamera() {
  const body = player.state;
  if (!body.alive && spectateTarget) {
    camera.position.set(
      spectateTarget.position.x,
      spectateTarget.position.y + 1.56,
      spectateTarget.position.z,
    );
    camera.rotation.set(0, spectateTarget.yaw, 0, 'YXZ');
    return;
  }
  let bob = 0;
  const speed = player.groundSpeed();
  if (body.onGround && speed > 2) bob = Math.sin(body.stepPhase * 2.4) * 0.025 * Math.min(1, speed / 5);
  let shakeX = 0;
  let shakeY = 0;
  if (shakeTime > 0) {
    shakeX = (liveRandom() * 2 - 1) * shakeMag * shakeTime;
    shakeY = (liveRandom() * 2 - 1) * shakeMag * shakeTime;
  }
  camera.position.set(body.position.x, body.position.y + body.eye + bob, body.position.z);
  camera.rotation.set(body.pitch + shakeX, body.yaw + shakeY, 0, 'YXZ');
  const targetFov = weapons.state.scoped ? 30 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

function botPhase() {
  const phase = rounds.state.phase;
  if (phase === 'live' || phase === 'planted') return phase;
  return 'freeze';
}

function step(dt) {
  simTime += dt;
  if (shakeTime > 0) shakeTime -= dt;
  const phase = rounds.state.phase;
  const playable = phase === 'freeze' || phase === 'live' || phase === 'planted';
  rounds.tick(dt, simTime);
  if (playable && player.state.alive) {
    player.step(dt, input.state.keys);
    // Grenade throw, weapon switch, reload, buy, mute.
    if (input.takePressed('KeyG')) {
      if (weapons.state.grenades.he > 0) throwGrenade('he');
      else if (weapons.state.grenades.flash > 0) throwGrenade('flash');
      else audio.denied();
    }
    // Digit keys: with the buy menu open they buy (1-7); otherwise 1 takes
    // the primary and 2 the pistol.
    for (let i = 1; i <= 7; i += 1) {
      if (!input.takePressed(`Digit${i}`)) continue;
      if (buyOpen && phase === 'freeze') {
        const ids = ['smg', 'rifle', 'shotgun', 'sniper', 'he', 'flash', 'armor'];
        const result = rounds.buy(ids[i - 1]);
        if (result.ok) {
          hud.setBuyHint('');
          hud.setMoney(rounds.state.money);
          hud.showBuy(true, rounds.state.money, ownedItems());
          refreshAmmoHud();
        } else {
          hud.setBuyHint(result.reason);
          audio.denied();
        }
      } else if (i === 1) {
        const primaries = ['rifle', 'smg', 'shotgun', 'sniper']
          .filter((id) => weapons.state.weapons[id].mag > 0 || weapons.state.weapons[id].reserve > 0);
        if (primaries.length) weapons.equip(primaries[primaries.length - 1]);
        refreshAmmoHud();
      } else if (i === 2) {
        weapons.equip('pistol');
        refreshAmmoHud();
      }
    }
    if (input.takePressed('KeyR')) {
      weapons.reload();
      refreshAmmoHud();
    }
    if (input.takePressed('KeyB') && phase === 'freeze') {
      buyOpen = !buyOpen;
      hud.showBuy(buyOpen, rounds.state.money, ownedItems());
      hud.setBuyHint(buyOpen ? 'Buy with keys 1–7 or a click.' : '');
      audio.click();
    }
    if (input.takePressed('KeyM')) audio.toggleMute();
    if (input.state.firing && playable && weapons.ready()) playerShoot();
    weapons.setScoped(input.state.scoping && player.state.alive);
  }
  weapons.step(dt);
  bots.step(dt, simTime, botPhase(), rounds.state.bomb);
  const fighters = bots.fighters().concat([playerFighter]);
  grenades.step(dt, fighters, playerFighter);
  effects.step(dt);
  // Bomb channel: hold E on a site to plant, by the device to defuse.
  if (playable && player.state.alive) {
    rounds.updateChannel(dt, input.state.keys.has('KeyE'));
    // Pick up a dropped device by walking over it.
    const bomb = rounds.state.bomb;
    if (bomb.state === 'dropped' && bomb.position) {
      const d = Math.hypot(player.state.position.x - bomb.position.x, player.state.position.z - bomb.position.z);
      if (d < 1.4) {
        bombCarrier = 'player';
        rounds.bombPickedUp(playerFighter);
      }
    }
  }
  input.endTick();
  refreshHud();
}

function refreshHud() {
  const body = player.state;
  hud.setHealth(body.health, body.armor);
  refreshAmmoHud();
  const timerValue = rounds.state.phase === 'over' ? rounds.state.overTimer
    : rounds.state.phase === 'planted' ? rounds.state.bomb.fuseLeft : rounds.state.timer;
  hud.setTimer(timerValue, rounds.state.phase);
  hud.setScore(rounds.state.score.vanguard, rounds.state.score.sentinel, Math.max(1, rounds.state.round));
  hud.setAlive(rounds.aliveCount('vanguard'), rounds.aliveCount('sentinel'));
  hud.setMoney(rounds.state.money);
  const spreadPx = 5 + weapons.spread(player.groundSpeed(), false) * 900;
  hud.setCrosshairSpread(spreadPx);
  const bomb = rounds.state.bomb;
  hud.setBombStatus(bomb.state === 'planted' ? bomb.fuseLeft : null, bomb.site);
  hud.setChannel(rounds.state.channel.kind, rounds.state.channel.progress / (rounds.state.channel.kind === 'plant' ? PLANT_TIME : DEFUSE_TIME));
  const phase = rounds.state.phase;
  if (phase === 'live' && player.state.alive) {
    if (bomb.state === 'carried' && bombCarrier === 'player' && rounds.playerInSite()) {
      hud.showPrompt('Hold <kbd>E</kbd> to plant the device');
    } else if (bomb.state === 'dropped') {
      hud.showPrompt('Device dropped — walk over it to pick it up');
    } else {
      hud.showPrompt(null);
    }
  } else if (phase === 'planted') {
    hud.showPrompt(null);
  } else if (phase === 'freeze' && player.state.alive) {
    hud.showPrompt('Press <kbd>B</kbd> to open the buy menu');
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    const sensitivity = weapons.state.scoped ? 0.0009 : 0.0022;
    player.look(look.x, look.y, sensitivity);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= TICK && steps < 5) {
      step(TICK);
      accumulator -= TICK;
      steps += 1;
    }
    if (accumulator > TICK * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(TICK);
}

function aimAtPoint(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false, 0, {});
  const body = player.state;
  if (name === 'start') {
    rounds.startMatch();
    body.position.set(0, 0, 15.5);
    body.yaw = 0;
    body.pitch = 0.02;
    settle(30);
    hud.showOverlay('start');
  } else if (name === 'buy') {
    rounds.startMatch();
    rounds.state.money = 4350;
    body.position.set(0, 0, 15.5);
    body.yaw = 0;
    settle(30);
    buyOpen = true;
    hud.showBuy(true, rounds.state.money, ownedItems());
    hud.setBuyHint('Round 1 buy — rifle or SMG, grenades, kevlar.');
  } else if (name === 'play') {
    rounds.startMatch();
    rounds.state.score = { vanguard: 3, sentinel: 2 };
    rounds.state.round = 6;
    rounds.state.money = 3200;
    rounds.state.phase = 'live';
    rounds.state.timer = 62;
    bots.startRound();
    // Stage the fight: two Sentinels ahead in mid, one teammate at the flank.
    const enemies = bots.bots.filter((b) => b.team === 'sentinel');
    const mates = bots.bots.filter((b) => b.team === 'vanguard');
    enemies[0].position.set(0.5, 0, -1.5);
    enemies[0].yaw = Math.PI;
    enemies[1].position.set(3.2, 0, -4);
    enemies[1].yaw = Math.PI;
    mates[0].position.set(-2.4, 0, 5.5);
    mates[0].yaw = 0;
    body.position.set(0, 0, 6);
    body.yaw = 0;
    settle(12);
    aimAtPoint(new THREE.Vector3(0.5, 1.15, -1.5));
    settle(2);
    weapons.equip('rifle');
    playerShoot();
    settle(1);
  } else if (name === 'plant') {
    rounds.startMatch();
    rounds.state.score = { vanguard: 5, sentinel: 4 };
    rounds.state.round = 10;
    rounds.state.money = 2900;
    rounds.state.phase = 'live';
    rounds.state.timer = 41;
    bots.startRound();
    bombCarrier = 'player';
    const mates = bots.bots.filter((b) => b.team === 'vanguard');
    mates[0].position.set(-13.5, 0, -8.5);
    mates[0].yaw = 0.4;
    mates[1].position.set(-17.5, 0, -8);
    mates[1].yaw = -0.5;
    const enemies = bots.bots.filter((b) => b.team === 'sentinel');
    enemies[0].position.set(-12, 0, -14.5);
    enemies[0].yaw = Math.PI;
    body.position.set(-15.5, 0, -10.5);
    body.yaw = 2.9;
    settle(12);
    settle(2);
    // Set the channel after the last settle: a settle step resets it when E
    // is not held, so this must be the final state before the HUD refresh.
    rounds.state.channel = { kind: 'plant', progress: 1.8 };
    hud.showPrompt('Hold <kbd>E</kbd> to plant the device');
  } else {
    rounds.startMatch();
  }
  refreshAmmoHud();
  refreshHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Test hooks: a small, labelled handle for automated play-testing. The game
// itself never reads it.
window.__dustline = {
  state: rounds.state,
  player, bots, rounds, weapons, input, grenades, playerFighter,
  look(dx, dy) { player.look(dx, dy); },
  fire() { if (weapons.ready()) playerShoot(); },
  key(code, down) {
    if (down) input.state.keys.add(code);
    else input.state.keys.delete(code);
  },
  // Advance the fixed-step simulation directly, without waiting on frames.
  step(n) { for (let i = 0; i < n; i += 1) step(TICK); },
};

syncCamera();
refreshAmmoHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
