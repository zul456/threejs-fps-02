// Hitscan resolution, shared by the player and the bots. A shot is a ray:
// the player fires it through a Raycaster against walls and bot hit meshes,
// a bot fires it against the target's head and body spheres, and a wall in
// front of either stops the bullet. Head hits pay the weapon's head multiplier.
import * as THREE from 'three';
import { segmentBlocked } from './physics.js';

const HEAD_RADIUS = 0.17;
const BODY_RADIUS = 0.42;

export function createCombat(scene, shootables, colliders, effects, audio, onEvent) {
  const raycaster = new THREE.Raycaster();
  const _origin = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _toTarget = new THREE.Vector3();
  const _point = new THREE.Vector3();
  let botHitMeshes = [];

  function setBotHitMeshes(meshes) {
    botHitMeshes = meshes;
  }

  // Ray vs sphere, reusing temps: returns the distance along the ray, or -1.
  function raySphere(origin, dir, center, radius) {
    const ox = center.x - origin.x;
    const oy = center.y - origin.y;
    const oz = center.z - origin.z;
    const tca = ox * dir.x + oy * dir.y + oz * dir.z;
    if (tca < 0) return -1;
    const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
    const r2 = radius * radius;
    if (d2 > r2) return -1;
    return tca - Math.sqrt(r2 - d2);
  }

  // The first wall along the ray, for tracer endpoints on a miss.
  function wallDistance(origin, dir, maxDist) {
    raycaster.set(origin, dir);
    raycaster.far = maxDist;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return hit ? hit.distance : maxDist;
  }

  function falloff(def, distance) {
    if (distance <= def.range) return 1;
    return def.falloff;
  }

  function applyDamage(fighter, amount, part, attacker) {
    if (!fighter.alive) return false;
    const died = fighter.damage(amount, part, attacker);
    if (died) onEvent({ type: 'kill', victim: fighter, attacker, part });
    return died;
  }

  // The player's shot: exact raycast against walls and bot bodies.
  function playerShoot(origin, dir, def, shooter) {
    raycaster.set(origin, dir);
    raycaster.far = def.range * 1.6;
    const hits = raycaster.intersectObjects(botHitMeshes.concat(shootables), false);
    // The first live thing the ray meets: skip a downed bot's body and a
    // teammate (no friendly fire).
    let first = null;
    for (const hit of hits) {
      const fighter = hit.object.userData.fighter;
      if (fighter && !fighter.alive) continue;
      if (fighter && fighter.team === shooter.team) continue;
      first = hit;
      break;
    }
    if (!first) {
      _point.copy(origin).addScaledVector(dir, def.range);
      effects.tracer(origin, _point, def.tracer);
      return { hit: false };
    }
    effects.tracer(origin, first.point, def.tracer);
    if (first.object.userData.fighter) {
      const fighter = first.object.userData.fighter;
      const part = first.object.userData.part;
      const distance = first.distance;
      const amount = def.damage * falloff(def, distance) * (part === 'head' ? def.headMult : 1);
      const died = applyDamage(fighter, amount, part, shooter);
      audio.hit();
      if (died) audio.kill();
      return { hit: true, part, died, distance };
    }
    effects.impact(first.point);
    return { hit: false, wall: true, distance: first.distance };
  }

  // A bot's shot: aim with error, then a geometric check against the target's
  // head sphere and body sphere, with a wall check in front of the hit.
  function botShoot(bot, target, def, random) {
    _origin.copy(bot.muzzle);
    const targetPos = target.aimPoint(random);
    _toTarget.copy(targetPos).sub(_origin);
    const distance = _toTarget.length();
    _toTarget.normalize();
    const headDist = raySphere(_origin, _toTarget, target.headPos(), HEAD_RADIUS);
    const bodyDist = raySphere(_origin, _toTarget, target.chestPos(), BODY_RADIUS);
    let hitDist = -1;
    let part = null;
    if (headDist >= 0 && (bodyDist < 0 || headDist <= bodyDist)) {
      hitDist = headDist;
      part = 'head';
    } else if (bodyDist >= 0) {
      hitDist = bodyDist;
      part = 'body';
    }
    if (hitDist >= 0) {
      _point.copy(_origin).addScaledVector(_toTarget, hitDist);
      if (segmentBlocked(_origin, _point, colliders)) {
        const wall = wallDistance(_origin, _toTarget, hitDist);
        _point.copy(_origin).addScaledVector(_toTarget, wall);
        effects.tracer(_origin, _point, def.tracer);
        effects.impact(_point);
        return { hit: false, wall: true };
      }
      effects.tracer(_origin, _point, def.tracer);
      const amount = def.damage * falloff(def, distance) * (part === 'head' ? def.headMult : 1);
      const died = applyDamage(target, amount, part, bot);
      return { hit: true, part, died, distance };
    }
    // Miss: the tracer stops at the first wall, or at full range.
    const wall = wallDistance(_origin, _toTarget, def.range);
    _point.copy(_origin).addScaledVector(_toTarget, wall);
    effects.tracer(_origin, _point, def.tracer);
    if (wall < def.range) effects.impact(_point);
    return { hit: false };
  }

  // Area damage from a grenade: falloff with distance, blocked by walls.
  function explosionDamage(center, radius, maxDamage, attacker, fighters) {
    const results = [];
    for (const fighter of fighters) {
      if (!fighter.alive) continue;
      const chest = fighter.chestPos();
      const d = chest.distanceTo(center);
      if (d > radius) continue;
      if (segmentBlocked(center, chest, colliders)) continue;
      const amount = maxDamage * (1 - (d / radius) * 0.7);
      const died = applyDamage(fighter, amount, 'blast', attacker);
      results.push({ fighter, died });
    }
    return results;
  }

  return {
    setBotHitMeshes,
    playerShoot,
    botShoot,
    explosionDamage,
    wallDistance,
    raySphere,
  };
}
