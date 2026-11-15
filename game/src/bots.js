// Bots: one AI per opponent and teammate. Each bot walks the map's waypoint
// graph (Dijkstra), sees with a field of view and a line-of-sight test, hears
// gunfire, fires in bursts with an aim error, and plays the objective: the
// carrier plants, defenders rotate and defuse, the last alive hunts.
import * as THREE from 'three';
import { BOT_SKILL, WEAPONS, PLANT_TIME, DEFUSE_TIME } from './config.js';
import { WAYPOINTS, EDGES, SITES } from './map.js';
import { moveBox, segmentBlocked } from './physics.js';
import { mulberry32, range, pick } from './rng.js';

const EYE = 1.55;
const CHEST = 1.15;
const RADIUS = 0.34;
const HEIGHT = 1.72;

// Dijkstra over the waypoint graph, from the node nearest `from` to `to`.
const ADJACENCY = {};
for (const [a, b] of EDGES) {
  (ADJACENCY[a] ??= []).push(b);
  (ADJACENCY[b] ??= []).push(a);
}
function nearestNode(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const [id, [nx, nz]] of Object.entries(WAYPOINTS)) {
    const d = (nx - x) ** 2 + (nz - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
function findPath(fromNode, toNode) {
  if (fromNode === toNode) return [toNode];
  const dist = { [fromNode]: 0 };
  const prev = {};
  const open = [fromNode];
  while (open.length) {
    let bestI = 0;
    for (let i = 1; i < open.length; i += 1) if (dist[open[i]] < dist[open[bestI]]) bestI = i;
    const node = open.splice(bestI, 1)[0];
    if (node === toNode) break;
    for (const next of ADJACENCY[node] ?? []) {
      const [ax, az] = WAYPOINTS[node];
      const [bx, bz] = WAYPOINTS[next];
      const cost = dist[node] + Math.hypot(bx - ax, bz - az);
      if (dist[next] === undefined || cost < dist[next]) {
        dist[next] = cost;
        prev[next] = node;
        if (!open.includes(next)) open.push(next);
      }
    }
  }
  if (dist[toNode] === undefined) return [toNode];
  const path = [toNode];
  let node = toNode;
  while (node !== fromNode) {
    node = prev[node];
    path.unshift(node);
  }
  return path;
}

function botMesh(team) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({
    color: team === 'vanguard' ? 0x3a4a44 : 0x4a3a3a, roughness: 0.75, metalness: 0.1,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: team === 'vanguard' ? 0xffb02e : 0xe0533d, roughness: 0.5, metalness: 0.3,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.8, metalness: 0.2 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), dark);
  legL.position.set(-0.11, 0.28, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.62, 0.32), suit);
  torso.position.y = 1.06;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.36), dark);
  vest.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), suit);
  head.position.y = 1.56;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.05), trim);
  visor.position.set(0, 1.58, -0.16);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.6), dark);
  gun.position.set(0.2, 1.22, -0.3);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.14), dark);
  pack.position.set(0, 1.1, 0.24);
  group.add(legL, legR, torso, vest, head, visor, gun, pack);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { group, torso, head, legL, legR };
}

export function createBots(scene, deps) {
  const { colliders, combat, effects, audio, random, getPlayer, api } = deps;
  const bots = [];
  const _eye = new THREE.Vector3();
  const _toEnemy = new THREE.Vector3();
  const _forward = new THREE.Vector3();
  const _aim = new THREE.Vector3();

  function makeBot(name, team, spawn) {
    const parts = botMesh(team);
    scene.add(parts.group);
    const bot = {
      id: name, name, team, isPlayer: false,
      position: new THREE.Vector3(spawn[0], 0, spawn[1]),
      velocity: new THREE.Vector3(),
      yaw: team === 'vanguard' ? 0 : Math.PI,
      health: 100, armor: 0, alive: true,
      weapon: 'rifle', mag: 30, reserve: 120, cooldown: 0, reloadLeft: 0,
      state: 'freeze', role: 'mid', path: [], pathIndex: 0,
      holdPos: null, holdYaw: 0, scanPhase: random() * 6,
      target: null, lastSeen: null, lastSeenAt: -99, reactionAt: 0,
      burstLeft: 0, burstPauseUntil: 0, perceiveAt: random() * 0.12,
      plantProgress: 0, defuseProgress: 0, investigateUntil: 0, investigatePos: null,
      blindUntil: 0, walkPhase: 0, fall: 0, hasBomb: false,
      reaction: range(random, BOT_SKILL.reactionMin, BOT_SKILL.reactionMax),
      errorScale: range(random, 0.85, 1.25),
      muzzle: new THREE.Vector3(),
      parts,
    };
    parts.torso.userData.fighter = bot;
    parts.torso.userData.part = 'body';
    parts.head.userData.fighter = bot;
    parts.head.userData.part = 'head';
    // Fighter interface combat.js calls: positions are fresh vectors, so a
    // shot never reads a stale aim point.
    bot.headPos = () => new THREE.Vector3(bot.position.x, bot.position.y + 1.56, bot.position.z);
    bot.chestPos = () => new THREE.Vector3(bot.position.x, bot.position.y + CHEST, bot.position.z);
    bot.aimPoint = (rnd) => {
      const p = rnd() < 0.15 ? bot.headPos() : bot.chestPos();
      p.x += (rnd() - 0.5) * 0.2;
      p.y += (rnd() - 0.5) * 0.2;
      return p;
    };
    bot.viewDir = () => new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    bot.damage = (amount, part, attacker) => {
      if (!bot.alive) return false;
      let rest = amount;
      if (bot.armor > 0) {
        const absorbed = Math.min(bot.armor, rest * 0.5);
        bot.armor -= absorbed;
        rest -= absorbed;
      }
      bot.health -= rest;
      if (bot.health <= 0) {
        bot.health = 0;
        bot.alive = false;
        bot.fall = 0.0001;
        bot.state = 'dead';
        if (bot.hasBomb) {
          bot.hasBomb = false;
          api.bombDropped(bot.position);
        }
        return true;
      }
      // Being shot interrupts a channel and draws attention.
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      if (bot.state === 'plant' || bot.state === 'defuse') bot.state = 'engage';
      return false;
    };
    bot.blind = (duration) => {
      bot.blindUntil = Math.max(bot.blindUntil, api.now() + duration);
    };
    bots.push(bot);
    return bot;
  }

  function setPath(bot, toNode) {
    const from = nearestNode(bot.position.x, bot.position.z);
    bot.path = findPath(from, toNode);
    bot.pathIndex = 0;
    bot.state = 'move';
  }

  function assignRoles(roundIndex) {
    const attackers = bots.filter((b) => b.team === 'vanguard');
    const defenders = bots.filter((b) => b.team === 'sentinel');
    const plans = [
      ['rushA', 'rushA', 'rushB', 'mid'],
      ['rushB', 'rushA', 'rushB', 'mid'],
      ['mid', 'rushB', 'rushA', 'rushA'],
    ];
    const plan = plans[roundIndex % plans.length];
    attackers.forEach((bot, i) => {
      bot.role = plan[i % plan.length];
      bot.hasBomb = i === 0;
      bot.weapon = roundIndex === 0 && i % 2 === 1 ? 'smg' : 'rifle';
      bot.mag = WEAPONS[bot.weapon].mag;
      bot.reserve = 999;
    });
    const defRoles = ['holdA', 'holdA', 'holdB', 'holdB', 'holdMid'];
    const defNodes = ['HA1', 'HA2', 'HB1', 'HB2', 'M5'];
    defenders.forEach((bot, i) => {
      bot.role = defRoles[i % defRoles.length];
      bot.holdNode = defNodes[i % defNodes.length];
      bot.hasBomb = false;
      bot.weapon = roundIndex === 0 && i % 2 === 0 ? 'smg' : 'rifle';
      bot.mag = WEAPONS[bot.weapon].mag;
      bot.reserve = 999;
    });
  }

  function resetRound(roundIndex, spawns) {
    const attackers = bots.filter((b) => b.team === 'vanguard');
    const defenders = bots.filter((b) => b.team === 'sentinel');
    attackers.forEach((bot, i) => {
      const s = spawns.vanguard[i % spawns.vanguard.length];
      bot.position.set(s[0], 0, s[1]);
      bot.yaw = 0; // facing north, toward the sites
    });
    defenders.forEach((bot, i) => {
      const s = spawns.sentinel[i % spawns.sentinel.length];
      bot.position.set(s[0], 0, s[1]);
      bot.yaw = Math.PI; // facing south, toward the attackers
    });
    for (const bot of bots) {
      bot.health = 100;
      bot.armor = 0;
      bot.alive = true;
      bot.fall = 0;
      bot.state = 'freeze';
      bot.path = [];
      bot.target = null;
      bot.lastSeen = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.investigateUntil = 0;
      bot.blindUntil = 0;
      bot.parts.group.rotation.set(0, bot.yaw, 0);
      bot.parts.group.position.copy(bot.position);
      bot.parts.torso.userData.fighter = bot;
      bot.parts.head.userData.fighter = bot;
    }
    assignRoles(roundIndex);
  }

  function startRound() {
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (bot.team === 'vanguard') {
        if (bot.role === 'rushA') setPath(bot, 'A6');
        else if (bot.role === 'rushB') setPath(bot, 'B6');
        else setPath(bot, 'M4');
      } else if (bot.role === 'holdA' || bot.role === 'holdB' || bot.role === 'holdMid') {
        setPath(bot, bot.holdNode);
      }
    }
  }

  function visibleEnemies(bot, now) {
    const player = getPlayer();
    const enemies = [];
    if (player.alive && player.team !== bot.team) enemies.push(player);
    for (const other of bots) {
      if (other.alive && other.team !== bot.team) enemies.push(other);
    }
    let best = null;
    let bestD = Infinity;
    _eye.set(bot.position.x, bot.position.y + EYE, bot.position.z);
    _forward.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    for (const enemy of enemies) {
      const chest = enemy.chestPos();
      _toEnemy.copy(chest).sub(_eye);
      const d = _toEnemy.length();
      if (d > BOT_SKILL.seeRange) continue;
      _toEnemy.normalize();
      if (_toEnemy.dot(_forward) < BOT_SKILL.fovCos && d > 3) continue;
      if (segmentBlocked(_eye, chest, colliders)) continue;
      if (d < bestD) {
        bestD = d;
        best = enemy;
      }
    }
    return best ? { enemy: best, distance: bestD } : null;
  }

  function aimAndFire(bot, dt, now) {
    const def = WEAPONS[bot.weapon];
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft -= dt;
      if (bot.reloadLeft <= 0) {
        bot.mag = def.mag;
      }
      return;
    }
    const target = bot.target;
    if (!target || !target.alive) return;
    if (now < bot.reactionAt) return;
    // Face the target, with an aim error that grows with distance, speed and
    // movement, and explodes while blinded.
    const aimAt = target.aimPoint(random);
    _aim.copy(aimAt).sub(bot.position);
    _aim.y = aimAt.y - (bot.position.y + EYE);
    const targetSpeed = target.groundSpeed ? target.groundSpeed() : Math.hypot(target.velocity.x, target.velocity.z);
    const moving = Math.hypot(bot.velocity.x, bot.velocity.z) > 1.5;
    const blind = now < bot.blindUntil;
    let error = (BOT_SKILL.errorBase + _aim.length() * BOT_SKILL.errorPerMetre
      + (moving ? BOT_SKILL.errorMove : 0) + targetSpeed * BOT_SKILL.errorTargetSpeed) * bot.errorScale;
    if (blind) error *= 6;
    const yawTo = Math.atan2(-_aim.x, -_aim.z);
    let dyaw = yawTo - bot.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.yaw += dyaw * Math.min(1, dt * 10);
    if (Math.abs(dyaw) > 0.25) return; // still turning onto the target
    if (bot.burstLeft <= 0) {
      if (now < bot.burstPauseUntil) return;
      bot.burstLeft = BOT_SKILL.burstMin + Math.floor(random() * (BOT_SKILL.burstMax - BOT_SKILL.burstMin));
      bot.burstPauseUntil = now + range(random, BOT_SKILL.burstPauseMin, BOT_SKILL.burstPauseMax);
    }
    if (bot.cooldown > 0) return;
    if (bot.mag <= 0) {
      bot.reloadLeft = def.reload;
      return;
    }
    // Muzzle at the gun tip; the shot's error is a random cone around aim.
    bot.muzzle.set(
      bot.position.x - Math.sin(bot.yaw) * 0.7,
      bot.position.y + 1.32,
      bot.position.z - Math.cos(bot.yaw) * 0.7,
    );
    _aim.normalize();
    const ex = (random() * 2 - 1) * error;
    const ey = (random() * 2 - 1) * error;
    _aim.x += ex;
    _aim.y += ey;
    _aim.normalize();
    bot.mag -= 1;
    bot.cooldown = def.rate;
    combat.botShoot(bot, target, def, random);
    if (bot.position.distanceTo(getPlayer().position) < 40) audio.distantShot();
    api.noise(bot.position, BOT_SKILL.hearRadius, bot.team);
    bot.burstLeft -= 1;
  }

  function followPath(bot, dt, speed) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = WAYPOINTS[bot.path[bot.pathIndex]];
    const dx = node[0] - bot.position.x;
    const dz = node[1] - bot.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.7) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const yawTo = Math.atan2(-dx, -dz);
    let dyaw = yawTo - bot.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.yaw += dyaw * Math.min(1, dt * 8);
    bot.velocity.x = (dx / d) * speed;
    bot.velocity.z = (dz / d) * speed;
    moveBox(bot.position, bot.velocity, dt, RADIUS, HEIGHT, colliders);
    bot.walkPhase += dt * speed * 1.6;
    return false;
  }

  function stepBot(bot, dt, now, phase, bomb) {
    if (!bot.alive) {
      if (bot.fall > 0 && bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.parts.group.rotation.x = -bot.fall * 1.45;
      }
      return;
    }
    bot.velocity.x = 0;
    bot.velocity.z = 0;
    const blind = now < bot.blindUntil;

    // Perception, staggered so nine bots never all ray-test in one tick.
    if (now >= bot.perceiveAt) {
      bot.perceiveAt = now + 0.12;
      const seen = blind ? null : visibleEnemies(bot, now);
      if (seen) {
        if (bot.target !== seen.enemy) {
          bot.target = seen.enemy;
          bot.reactionAt = now + bot.reaction;
        }
        bot.lastSeen = seen.enemy.chestPos().clone();
        bot.lastSeenAt = now;
      } else if (bot.target && now - bot.lastSeenAt > 2) {
        bot.target = null;
      }
    }

    if (phase === 'freeze') {
      bot.state = 'freeze';
    } else if (phase === 'live' || phase === 'planted') {
      // Bomb carrier plants when the site is reached and quiet.
      if (bot.hasBomb && bomb.state === 'carried' && !bot.target) {
        const site = bot.role === 'rushA' ? SITES.A : SITES.B;
        const d = Math.hypot(bot.position.x - site.x, bot.position.z - site.z);
        if (d < site.radius * 0.8) {
          bot.state = 'plant';
          bot.plantProgress += dt;
          if (bot.plantProgress >= PLANT_TIME) {
            bot.hasBomb = false;
            api.plantComplete(site.id, bot.position);
          }
        }
      }
      // A defender defuses when the bomb is armed and in reach.
      if (bot.team === 'sentinel' && bomb.state === 'planted' && !bot.target) {
        const d = Math.hypot(bot.position.x - bomb.position.x, bot.position.z - bomb.position.z);
        if (d < 2.2) {
          bot.state = 'defuse';
          bot.defuseProgress += dt;
          audio.defuseBeep();
          if (bot.defuseProgress >= DEFUSE_TIME) api.defuseComplete();
        }
      }
      // Rotate to the planted site.
      if (bot.team === 'sentinel' && bomb.state === 'planted' && bot.state !== 'defuse'
        && bot.state !== 'engage' && bot.state !== 'move') {
        setPath(bot, bomb.site === 'A' ? 'A6' : 'B6');
      }
      // Investigate a heard shot.
      if (bot.investigateUntil > now && !bot.target && bot.state !== 'plant' && bot.state !== 'defuse') {
        if (bot.state !== 'investigate') {
          const node = nearestNode(bot.investigatePos.x, bot.investigatePos.z);
          setPath(bot, node);
          bot.state = 'investigate';
        }
        if (followPath(bot, dt, BOT_SKILL.walkSpeed)) {
          bot.state = 'hold';
          bot.investigateUntil = 0;
        }
      } else if (bot.state === 'move') {
        if (followPath(bot, dt, BOT_SKILL.walkSpeed)) {
          if (bot.team === 'sentinel' && (bot.role === 'holdA' || bot.role === 'holdB' || bot.role === 'holdMid')) {
            bot.state = 'hold';
            bot.holdPos = bot.position.clone();
            bot.holdYaw = bot.yaw;
          } else if (bot.hasBomb) {
            bot.state = 'hold'; // at the site; the plant branch above takes over
          } else {
            bot.state = 'hold';
            bot.holdPos = bot.position.clone();
            bot.holdYaw = bot.yaw;
          }
        }
      } else if (bot.state === 'hold') {
        // Scan the sector slowly; strafe a little when a target is near.
        bot.scanPhase += dt * 0.5;
        bot.yaw = bot.holdYaw + Math.sin(bot.scanPhase) * 0.6;
      }
      if (bot.target) {
        bot.state = 'engage';
        aimAndFire(bot, dt, now);
        // Strafe while engaging, so a bot is not a static target.
        if (bot.burstLeft <= 0 && random() < BOT_SKILL.strafeChance) {
          const side = random() < 0.5 ? 1 : -1;
          bot.velocity.x = Math.cos(bot.yaw) * side * 1.6;
          bot.velocity.z = -Math.sin(bot.yaw) * side * 1.6;
          moveBox(bot.position, bot.velocity, dt, RADIUS, HEIGHT, colliders);
        }
      }
    }

    // Pick up a dropped bomb by walking over it.
    if (bot.team === 'vanguard' && bomb.state === 'dropped' && bomb.position) {
      const d = Math.hypot(bot.position.x - bomb.position.x, bot.position.z - bomb.position.z);
      if (d < 1.4) {
        bot.hasBomb = true;
        api.bombPickedUp(bot);
      }
    }

    // Sync the mesh: position, facing, walk cycle, fall.
    bot.parts.group.position.copy(bot.position);
    bot.parts.group.rotation.y = bot.yaw;
    if (bot.alive) {
      const swing = Math.sin(bot.walkPhase) * 0.35 * Math.min(1, Math.hypot(bot.velocity.x, bot.velocity.z) / 4);
      bot.parts.legL.rotation.x = swing;
      bot.parts.legR.rotation.x = -swing;
      bot.parts.group.position.y = Math.abs(Math.sin(bot.walkPhase)) * 0.03;
    }
  }

  function step(dt, now, phase, bomb) {
    for (const bot of bots) stepBot(bot, dt, now, phase, bomb);
  }

  function hear(pos, radius, fromTeam) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === fromTeam) continue;
      if (bot.position.distanceTo(pos) > radius) continue;
      if (bot.state === 'plant' || bot.state === 'defuse' || bot.state === 'engage') continue;
      bot.investigatePos = pos.clone();
      bot.investigateUntil = api.now() + 4;
    }
  }

  function fighters() {
    return bots.filter((b) => b.alive);
  }
  function aliveCount(team) {
    return bots.filter((b) => b.alive && b.team === team).length;
  }
  function hitMeshes() {
    const meshes = [];
    for (const bot of bots) {
      if (!bot.alive) continue;
      meshes.push(bot.parts.torso, bot.parts.head);
    }
    return meshes;
  }

  return {
    bots, makeBot, resetRound, startRound, step, hear, fighters, aliveCount,
    hitMeshes, setPath, assignRoles,
  };
}
