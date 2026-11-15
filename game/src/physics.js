// Collision and line of sight against the world's axis-aligned boxes. The
// map is all boxes, so both are exact and cheap, and every system shares them.
// Colliders are THREE.Box3; a segment test returns the first blocking box.
import * as THREE from 'three';

// Move a standing box (radius r, height h, feet at y) one axis at a time.
// Returns the position reached; velocity components are zeroed on impact.
export function moveBox(position, velocity, dt, radius, height, colliders) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }
  const nextX = position.x + velocity.x * dt;
  if (!overlaps(nextX, position.y, position.z, 0.04)) position.x = nextX;
  else velocity.x = 0;
  const nextZ = position.z + velocity.z * dt;
  if (!overlaps(position.x, position.y, nextZ, 0.04)) position.z = nextZ;
  else velocity.z = 0;
  position.y += velocity.y * dt;
  const hit = overlaps(position.x, position.y, position.z, 0);
  if (hit) {
    if (velocity.y <= 0) {
      position.y = hit.max.y;
      velocity.y = 0;
      return true; // grounded
    }
    position.y = hit.min.y - height;
    velocity.y = 0;
  }
  if (position.y < 0) {
    position.y = 0;
    velocity.y = 0;
    return true;
  }
  return false;
}

// True when any collider blocks the segment from a to b. Reuses one ray so
// perception checks allocate nothing.
const _ray = new THREE.Ray();
const _hit = new THREE.Vector3();
export function segmentBlocked(a, b, colliders) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return false;
  _ray.origin.copy(a);
  _ray.direction.set(dx / length, dy / length, dz / length);
  for (let i = 0; i < colliders.length; i += 1) {
    if (_ray.intersectBox(colliders[i], _hit) !== null) {
      if (_hit.distanceToSquared(a) < length * length) return true;
    }
  }
  return false;
}

// Distance from a point to the segment a-b, squared; used for explosion falloff.
export function pointSegmentDistanceSq(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const cz = a.z + abz * t;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const dz = p.z - cz;
  return dx * dx + dy * dy + dz * dz;
}
