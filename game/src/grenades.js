// Grenades: a thrown sphere with gravity and bounces off the map's boxes,
// a fuse, then an explosion (HE) or a blinding flash. One pooled mesh per
// live grenade; the list is tiny, so a plain array is the whole system.
import * as THREE from 'three';
import { GRENADES } from './config.js';

const GRAVITY = 14;
const BOUNCE = 0.42;
const FUSE = 2.0;
const RADIUS = 0.14;

export function createGrenades(scene, colliders, combat, effects, audio, onFlash) {
  const live = [];
  const geometry = new THREE.SphereGeometry(RADIUS, 10, 8);
  const heMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.4, metalness: 0.7 });
  const flashMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.4, metalness: 0.3 });
  const probe = new THREE.Box3();

  function overlaps(x, y, z) {
    probe.min.set(x - RADIUS, y - RADIUS, z - RADIUS);
    probe.max.set(x + RADIUS, y + RADIUS, z + RADIUS);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return true;
    }
    return false;
  }

  function throwGrenade(kind, from, direction, owner) {
    const mesh = new THREE.Mesh(geometry, kind === 'he' ? heMaterial : flashMaterial);
    mesh.position.copy(from);
    mesh.castShadow = true;
    scene.add(mesh);
    const velocity = direction.clone().multiplyScalar(13);
    velocity.y += 3.2;
    live.push({ kind, mesh, position: mesh.position, velocity, fuse: FUSE, owner });
    audio.grenadePin();
  }

  function detonate(g, fighters, player) {
    const def = GRENADES[g.kind];
    const center = g.position.clone();
    scene.remove(g.mesh);
    if (g.kind === 'he') {
      effects.explosion(center);
      audio.explosion();
      combat.explosionDamage(center, def.radius, def.damage, g.owner, fighters);
    } else {
      // Flash: anyone with a line of sight who faces the blast is blinded.
      audio.plantBeep(true);
      const all = player ? fighters.concat([player]) : fighters;
      for (const fighter of all) {
        if (!fighter.alive) continue;
        const chest = fighter.chestPos();
        const d = chest.distanceTo(center);
        if (d > def.radius) continue;
        const dirToBlast = center.clone().sub(chest).normalize();
        const facing = fighter.viewDir ? fighter.viewDir().dot(dirToBlast) : 0;
        const strength = Math.max(0, 1 - d / def.radius) * (facing > -0.2 ? 1 : 0.35);
        if (strength > 0.15) {
          const duration = def.blind * strength;
          if (fighter.isPlayer) onFlash(duration);
          else fighter.blind(duration);
        }
      }
    }
  }

  function step(dt, fighters, player) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.fuse -= dt;
      g.velocity.y -= GRAVITY * dt;
      const p = g.position;
      const v = g.velocity;
      const nx = p.x + v.x * dt;
      if (!overlaps(nx, p.y, p.z)) p.x = nx;
      else v.x = -v.x * BOUNCE;
      const nz = p.z + v.z * dt;
      if (!overlaps(p.x, p.y, nz)) p.z = nz;
      else v.z = -v.z * BOUNCE;
      const ny = p.y + v.y * dt;
      if (!overlaps(p.x, ny, p.z)) p.y = ny;
      else {
        v.y = -v.y * BOUNCE;
        if (Math.abs(v.y) < 1.2) v.y = 0;
      }
      if (p.y < RADIUS) {
        p.y = RADIUS;
        v.y = Math.abs(v.y) * BOUNCE;
      }
      g.mesh.rotation.x += dt * 9;
      g.mesh.rotation.z += dt * 7;
      if (g.fuse <= 0) {
        detonate(g, fighters, player);
        live.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const g of live) scene.remove(g.mesh);
    live.length = 0;
  }

  return { throwGrenade, step, clear, live };
}
