// Transient visuals, all pooled: tracers, muzzle light is in weapons.js,
// impact sparks and explosion flashes. Nothing is allocated per shot after
// the pool is built; a fired tracer is reused once it fades out.
import * as THREE from 'three';

const TRACER_COUNT = 18;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const sparkGeometry = new THREE.BufferGeometry();
  const sparkPositions = new Float32Array(24 * 3);
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({
    color: 0xffd27a, size: 0.09, transparent: true, opacity: 0, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkLife = 0;
  const sparkOrigin = new THREE.Vector3();

  const boomLight = new THREE.PointLight(0xffa040, 0, 22, 1.4);
  scene.add(boomLight);
  let boomLife = 0;
  const boomPos = new THREE.Vector3();

  return {
    tracer(from, to, color = 0xffe9a8) {
      const slot = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % TRACER_COUNT;
      const positions = slot.line.geometry.attributes.position.array;
      positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
      positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
      slot.line.geometry.attributes.position.needsUpdate = true;
      slot.line.material.color.setHex(color);
      slot.line.material.opacity = 0.9;
      slot.life = 0.09;
    },
    impact(point) {
      sparkOrigin.copy(point);
      for (let i = 0; i < 24; i += 1) {
        sparkPositions[i * 3] = point.x + (Math.random() - 0.5) * 0.25;
        sparkPositions[i * 3 + 1] = point.y + (Math.random() - 0.5) * 0.25;
        sparkPositions[i * 3 + 2] = point.z + (Math.random() - 0.5) * 0.25;
      }
      sparkGeometry.attributes.position.needsUpdate = true;
      sparks.material.opacity = 1;
      sparkLife = 0.14;
    },
    explosion(point) {
      boomPos.copy(point);
      boomLight.position.copy(point);
      boomLight.position.y += 0.6;
      boomLight.intensity = 90;
      boomLife = 0.35;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life > 0) {
          slot.life -= dt;
          slot.line.material.opacity = Math.max(0, slot.life / 0.09) * 0.9;
        }
      }
      if (sparkLife > 0) {
        sparkLife -= dt;
        sparks.material.opacity = Math.max(0, sparkLife / 0.14);
      }
      if (boomLife > 0) {
        boomLife -= dt;
        boomLight.intensity = Math.max(0, boomLife / 0.35) * 90;
      }
    },
  };
}
