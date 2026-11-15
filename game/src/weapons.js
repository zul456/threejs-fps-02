// Weapons: one view model per gun, built from boxes, and the firing state —
// magazine, reserve, cooldown, reload, bloom. Damage and hit detection live
// in combat.js; this module owns how a gun looks, feels and cycles.
import * as THREE from 'three';
import { WEAPONS } from './config.js';

const GRIP = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7, metalness: 0.2 });
const BODY = new THREE.MeshStandardMaterial({ color: 0x3d4148, roughness: 0.45, metalness: 0.55 });
const ACCENT = new THREE.MeshStandardMaterial({ color: 0xffb02e, roughness: 0.5, metalness: 0.3 });

function box(w, h, d, x, y, z, mat = BODY) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

// A low-poly gun per weapon id, held at the lower right of the camera.
function buildModel(id) {
  const model = new THREE.Group();
  if (id === 'pistol') {
    model.add(box(0.05, 0.09, 0.22, 0, 0, -0.1));
    model.add(box(0.045, 0.1, 0.05, 0, -0.07, 0.02, GRIP));
    model.add(box(0.02, 0.02, 0.06, 0, 0.055, -0.16, ACCENT));
  } else if (id === 'smg') {
    model.add(box(0.07, 0.09, 0.34, 0, 0, -0.12));
    model.add(box(0.04, 0.04, 0.22, 0, 0.02, -0.36, GRIP));
    model.add(box(0.05, 0.11, 0.06, 0, -0.08, 0.0, GRIP));
    model.add(box(0.05, 0.05, 0.1, 0, -0.01, 0.12, GRIP));
    model.add(box(0.02, 0.03, 0.05, 0, 0.06, -0.2, ACCENT));
  } else if (id === 'shotgun') {
    model.add(box(0.08, 0.09, 0.5, 0, 0, -0.18));
    model.add(box(0.06, 0.06, 0.42, 0, -0.03, -0.2, GRIP));
    model.add(box(0.06, 0.1, 0.08, 0, -0.08, 0.02, GRIP));
    model.add(box(0.07, 0.03, 0.12, 0, 0.05, -0.3, ACCENT));
  } else if (id === 'sniper') {
    model.add(box(0.07, 0.08, 0.62, 0, 0, -0.22));
    model.add(box(0.045, 0.045, 0.5, 0, 0.02, -0.5, GRIP));
    model.add(box(0.05, 0.05, 0.16, 0, 0.06, -0.18, GRIP)); // scope tube
    model.add(box(0.02, 0.02, 0.04, 0, 0.06, -0.28, ACCENT));
    model.add(box(0.05, 0.1, 0.06, 0, -0.08, 0.02, GRIP));
  } else {
    // rifle
    model.add(box(0.08, 0.1, 0.44, 0, 0, -0.16));
    model.add(box(0.045, 0.045, 0.36, 0, 0.025, -0.42, GRIP));
    model.add(box(0.06, 0.09, 0.2, 0, -0.02, 0.12, GRIP));
    model.add(box(0.05, 0.1, 0.06, 0, -0.08, 0.0, GRIP));
    model.add(box(0.03, 0.04, 0.1, 0, 0.07, -0.3, ACCENT));
  }
  model.position.set(0.26, -0.22, -0.45);
  return model;
}

export function createWeapons(camera, audio) {
  const models = {};
  for (const id of Object.keys(WEAPONS)) {
    models[id] = buildModel(id);
    models[id].visible = false;
    camera.add(models[id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.18, -1.05);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(0xffc860, 0, 7);
  flashLight.position.set(0.26, -0.16, -0.7);
  camera.add(flashLight);

  const state = {
    current: 'rifle',
    weapons: {},
    grenades: { he: 0, flash: 0 },
    flash: 0,
    kick: 0,
    bloom: 0,
    scoped: false,
  };
  for (const def of Object.values(WEAPONS)) {
    state.weapons[def.id] = { mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0 };
  }

  function currentDef() {
    return WEAPONS[state.current];
  }
  function currentState() {
    return state.weapons[state.current];
  }

  function equip(id) {
    if (!WEAPONS[id] || state.current === id) return false;
    for (const key of Object.keys(models)) models[key].visible = key === id;
    state.current = id;
    state.scoped = false;
    state.bloom = 0;
    return true;
  }
  equip('rifle');

  function step(dt) {
    const def = currentDef();
    const w = currentState();
    w.cooldown = Math.max(0, w.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 13);
    const model = models[state.current];
    model.position.z = -0.45 + state.kick;
    model.rotation.x = state.kick * 2.4;
    model.visible = !(state.scoped && def.scope);
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 40;
    flashLight.intensity = state.flash > 0 ? 20 : 0;
    if (w.reloadLeft > 0) {
      w.reloadLeft = Math.max(0, w.reloadLeft - dt);
      model.rotation.x = -0.5 * Math.min(1, (def.reload - w.reloadLeft) * 2);
      if (w.reloadLeft === 0) {
        const need = def.mag - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip,
    currentDef,
    currentState,
    ready() {
      const w = currentState();
      return w.mag > 0 && w.cooldown === 0 && w.reloadLeft === 0;
    },
    // Consumes one round and starts the cycle; returns false when empty.
    pullTrigger() {
      const def = currentDef();
      const w = currentState();
      if (w.mag <= 0) {
        audio.dry();
        return false;
      }
      w.mag -= 1;
      w.cooldown = def.rate;
      state.flash = 0.06;
      state.kick = 0.06;
      state.bloom = Math.min(def.bloomMax, state.bloom + def.bloom);
      audio.shot(def.id);
      return true;
    },
    reload() {
      const def = currentDef();
      const w = currentState();
      if (w.reloadLeft > 0 || w.mag === def.mag || w.reserve === 0) return;
      w.reloadLeft = def.reload;
      audio.reload();
    },
    refill() {
      for (const def of Object.values(WEAPONS)) {
        state.weapons[def.id].reserve = def.reserve;
      }
    },
    buyWeapon(id) {
      if (!WEAPONS[id] || id === 'pistol') return false;
      state.weapons[id].mag = WEAPONS[id].mag;
      state.weapons[id].reserve = WEAPONS[id].reserve;
      equip(id);
      return true;
    },
    spread(speed, moving) {
      const def = currentDef();
      const base = def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove;
      return base + state.bloom + (moving ? 0.004 : 0);
    },
    setScoped(on) {
      state.scoped = on && currentDef().scope === true;
    },
  };
}
