// The player: acceleration, friction, gravity, crouch and jump, resolved as
// a box against the world's colliders one axis at a time. Health and armour
// live here; money and weapons live in rounds.js and weapons.js.
import * as THREE from 'three';
import { moveBox } from './physics.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const SPRINT_SPEED = 6.1;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders, audio) {
  const state = {
    position: new THREE.Vector3(0, 0, 15),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
    alive: true,
    stepPhase: 0,
  };

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function reset(spawn, yaw) {
    state.position.set(spawn[0], 0, spawn[1]);
    state.velocity.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    state.eye = STAND_EYE;
    state.onGround = true;
    state.crouching = false;
    state.height = STAND_HEIGHT;
    state.health = 100;
    state.alive = true;
  }

  // Damage after armour: armour absorbs half of each hit until it runs out.
  function damage(amount) {
    if (!state.alive) return 0;
    let rest = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, rest * 0.5);
      state.armor -= absorbed;
      rest -= absorbed;
    }
    state.health -= rest;
    if (state.health <= 0) {
      state.health = 0;
      state.alive = false;
    }
    return rest;
  }

  function step(dt, keys) {
    if (!state.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (!crouching && state.crouching) {
      state.crouching = false;
      state.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sprinting = keys.has('ShiftLeft') && forward > 0 && !state.crouching;
    const speed = state.crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    const wishX = forward || strafe ? (-sin * forward + cos * strafe) : 0;
    const wishZ = forward || strafe ? (-cos * forward - sin * strafe) : 0;
    const wishLen = Math.hypot(wishX, wishZ) || 1;
    const blend = Math.min(1, ((state.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt) / speed);
    state.velocity.x += ((wishX / wishLen) * speed - state.velocity.x) * blend;
    state.velocity.z += ((wishZ / wishLen) * speed - state.velocity.z) * blend;
    if (state.onGround && !forward && !strafe) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }
    if (keys.has('Space') && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;
    state.onGround = moveBox(state.position, state.velocity, dt, RADIUS, state.height, colliders);
    state.velocity.y = Math.max(-30, state.velocity.y);

    // Footstep ticks, timed by distance walked.
    const groundSpeed = Math.hypot(state.velocity.x, state.velocity.z);
    if (state.onGround && groundSpeed > 2) {
      state.stepPhase += groundSpeed * dt;
      if (state.stepPhase > 2.4) {
        state.stepPhase = 0;
        audio.step();
      }
    }
  }

  return {
    state,
    step,
    look,
    recoil,
    reset,
    damage,
    sprinting(keys) {
      return keys.has('ShiftLeft') && keys.has('KeyW') && !state.crouching;
    },
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
  };
}
