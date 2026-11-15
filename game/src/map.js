// Yard 9: an original dusk container yard, three lanes, two bomb sites.
// x runs east, z runs south. Vanguard spawn is south (z +15), Sentinel north
// (z -15). Site A is north-west, site B north-east. All obstacles are
// axis-aligned boxes, so collision and line of sight stay exact.
// The waypoint graph is hand-authored to match the lanes; bots pathfind on it.
import * as THREE from 'three';
import { makeTextures } from './textures.js';

const WALL_H = 5;

// [width, height, depth, x, y, z, material]
const BOXES = [
  // Ground and outer walls.
  [44.4, 0.4, 36.4, 0, -0.2, 0, 'ground'],
  [0.5, WALL_H, 36.4, -22.2, WALL_H / 2, 0, 'concrete'],
  [0.5, WALL_H, 36.4, 22.2, WALL_H / 2, 0, 'concrete'],
  [44.4, WALL_H, 0.5, 0, WALL_H / 2, -18.2, 'concrete'],
  [44.4, WALL_H, 0.5, 0, WALL_H / 2, 18.2, 'concrete'],

  // Lane buildings: solid blocks between the lanes, with a connector gap
  // at z in [-6, 2] on each side.
  [10, 4.4, 8, -9, 2.2, -10, 'concrete'], // west north block
  [10, 4.4, 8, -9, 2.2, 6, 'concrete'], // west south block
  [10, 4.4, 8, 9, 2.2, -10, 'concrete'], // east north block
  [10, 4.4, 8, 9, 2.2, 6, 'concrete'], // east south block

  // Mid wall with a doorway at x in [-1.1, 1.1], z = -2.
  [2.9, 4, 0.5, -2.55, 2, -2, 'concrete'],
  [2.9, 4, 0.5, 2.55, 2, -2, 'concrete'],

  // A-long cover: containers and crates down the west lane.
  [2.6, 2.6, 6, -18.5, 1.3, 5, 'rust'],
  [1.2, 1.2, 1.2, -19.5, 0.6, -1, 'steel'],
  [1.2, 1.2, 1.2, -19.5, 0.6, -2.2, 'steel'],
  [1.2, 1.2, 1.2, -19.5, 1.8, -1.6, 'steel'],
  [2.4, 1.1, 0.6, -16.8, 0.55, -7, 'concrete'],
  [2.6, 2.6, 6, -20.5, 1.3, -12.5, 'teal'],

  // B-long cover, arranged differently from A-long.
  [2.6, 2.6, 6, 18.5, 1.3, -1, 'teal'],
  [1.2, 1.2, 1.2, 19.5, 0.6, 7, 'steel'],
  [1.2, 1.2, 1.2, 19.5, 0.6, 8.2, 'steel'],
  [2.4, 1.1, 0.6, 16.8, 0.55, -6, 'concrete'],
  [6, 2.6, 2.6, 19, 1.3, -13.5, 'sand'],

  // Mid cover: crates, a low barrier, and the silo.
  [1.2, 1.2, 1.2, 2.2, 0.6, 2.5, 'steel'],
  [1.2, 1.2, 1.2, -2.2, 0.6, 6.5, 'steel'],
  [1.2, 1.2, 1.2, -2.2, 1.8, 6.5, 'steel'],
  [3.2, 1.1, 0.6, 0, 0.55, 7.5, 'concrete'],
  [2.6, 2.6, 2.6, -2.6, 1.3, -11.5, 'rust'],

  // Site A cover: an L of containers and a crate stack.
  [6, 2.6, 2.6, -17, 1.3, -14.5, 'rust'],
  [2.6, 2.6, 4, -11.5, 1.3, -15.5, 'sand'],
  [1.2, 1.2, 1.2, -14, 0.6, -9.5, 'steel'],
  [1.2, 1.2, 1.2, -14, 1.8, -9.5, 'steel'],
  [2.4, 1.1, 0.6, -12.5, 0.55, -12.5, 'concrete'],

  // Site B cover: a long container, a crate wall, a barrier.
  [2.6, 2.6, 6, 20.5, 1.3, -10, 'rust'],
  [1.2, 1.2, 1.2, 13.5, 0.6, -14.5, 'steel'],
  [1.2, 1.2, 1.2, 14.7, 0.6, -14.5, 'steel'],
  [1.2, 1.2, 1.2, 14.1, 1.8, -14.5, 'steel'],
  [2.4, 1.1, 0.6, 17.5, 0.55, -12.5, 'concrete'],

  // Spawn plaza cover.
  [1.2, 1.2, 1.2, -8, 0.6, 13, 'steel'],
  [1.2, 1.2, 1.2, 8, 0.6, 13, 'steel'],
  [2.4, 1.1, 0.6, 0, 0.55, 12, 'concrete'],
];

export const SITES = {
  A: { id: 'A', x: -15.5, z: -11, radius: 4.5 },
  B: { id: 'B', x: 15.5, z: -11, radius: 4.5 },
};

export const SPAWNS = {
  vanguard: [[-3, 15], [0, 15.5], [3, 15], [-6, 14], [6, 14]],
  sentinel: [[-3, -15.5], [0, -16], [3, -15.5], [-6, -14.5], [6, -14.5]],
};

// Waypoint graph: nodes are [x, z]; edges are pairs of node ids.
export const WAYPOINTS = {
  S0: [0, 15], P1: [-8, 12], P2: [8, 12], P3: [0, 10],
  A1: [-12, 11], A2: [-18, 8], A3: [-18, 2], A4: [-18, -4], A5: [-18, -9], A6: [-15, -11],
  B1: [12, 11], B2: [18, 8], B3: [18, 2], B4: [18, -4], B5: [18, -9], B6: [15, -11],
  M1: [0, 8], M2: [0, 3], M3: [0, -1], M4: [0, -5], M5: [0, -9], M6: [0, -13],
  C1: [-7, -2], C2: [-11, -7], D1: [7, -2], D2: [11, -7],
  N0: [0, -15.5], N1: [-6, -14], N2: [6, -14],
  HA1: [-13, -13], HA2: [-19, -13], HB1: [13, -13], HB2: [19, -13],
};
export const EDGES = [
  ['S0', 'P1'], ['S0', 'P2'], ['S0', 'P3'], ['P1', 'A1'], ['P2', 'B1'], ['P3', 'M1'],
  ['A1', 'A2'], ['A2', 'A3'], ['A3', 'A4'], ['A4', 'A5'], ['A5', 'A6'],
  ['B1', 'B2'], ['B2', 'B3'], ['B3', 'B4'], ['B4', 'B5'], ['B5', 'B6'],
  ['M1', 'M2'], ['M2', 'M3'], ['M3', 'M4'], ['M4', 'M5'], ['M5', 'M6'],
  ['M2', 'C1'], ['C1', 'C2'], ['C2', 'A5'], ['C2', 'A6'],
  ['M2', 'D1'], ['D1', 'D2'], ['D2', 'B5'], ['D2', 'B6'],
  ['A6', 'HA1'], ['A6', 'HA2'], ['B6', 'HB1'], ['B6', 'HB2'],
  ['HA1', 'N1'], ['HB1', 'N2'], ['M6', 'N0'], ['N1', 'N0'], ['N2', 'N0'],
  ['M5', 'HA1'], ['M5', 'HB1'], ['A4', 'C2'], ['B4', 'D2'],
];

function billboardTexture() {
  const element = document.createElement('canvas');
  element.width = 512;
  element.height = 128;
  const ctx = element.getContext('2d');
  ctx.fillStyle = '#20242e';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#ffb02e';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = '#ffb02e';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DUSTLINE', 256, 50);
  ctx.fillStyle = '#f2ede3';
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText('YARD 9 · TACTICAL STRIKE', 256, 96);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMap(scene) {
  const textures = makeTextures();
  const group = new THREE.Group();
  scene.add(group);
  const materials = {
    ground: new THREE.MeshStandardMaterial({ map: textures.ground, roughness: 0.95, metalness: 0 }),
    concrete: new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.92, metalness: 0.02 }),
    rust: new THREE.MeshStandardMaterial({ map: textures.rust, roughness: 0.7, metalness: 0.25 }),
    teal: new THREE.MeshStandardMaterial({ map: textures.teal, roughness: 0.7, metalness: 0.25 }),
    sand: new THREE.MeshStandardMaterial({ map: textures.sand, roughness: 0.7, metalness: 0.25 }),
    steel: new THREE.MeshStandardMaterial({ map: textures.steel, roughness: 0.55, metalness: 0.5 }),
    hazard: new THREE.MeshStandardMaterial({ map: textures.hazard, roughness: 0.85, metalness: 0.05 }),
  };

  const colliders = [];
  const shootables = [];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (const [w, h, d, x, y, z, mat] of BOXES) {
    const mesh = new THREE.Mesh(boxGeometry, materials[mat]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
  }

  // The mid silo: a cylinder visual on a box collider, so it reads as a
  // landmark and still collides exactly.
  const silo = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 5.4, 20),
    new THREE.MeshStandardMaterial({ map: textures.steel, roughness: 0.5, metalness: 0.6 }),
  );
  silo.position.set(0, 2.7, -6.5);
  silo.castShadow = true;
  silo.receiveShadow = true;
  group.add(silo);
  colliders.push(new THREE.Box3(new THREE.Vector3(-1.5, 0, -8), new THREE.Vector3(1.5, 5.4, -5)));
  shootables.push(silo);

  // Site markers: hazard rings flat on the ground, with a painted letter.
  const siteMarkers = {};
  for (const site of Object.values(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.35, site.radius, 40),
      new THREE.MeshBasicMaterial({ map: textures.hazard, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    const letterCanvas = document.createElement('canvas');
    letterCanvas.width = 128;
    letterCanvas.height = 128;
    const lctx = letterCanvas.getContext('2d');
    lctx.fillStyle = '#ffb02e';
    lctx.font = 'bold 96px system-ui, sans-serif';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText(site.id, 64, 68);
    const letterTexture = new THREE.CanvasTexture(letterCanvas);
    letterTexture.colorSpace = THREE.SRGBColorSpace;
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: letterTexture, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(site.x, 0.04, site.z);
    group.add(letter);
    siteMarkers[site.id] = { ring, letter };
  }

  // Billboard on the north wall, and light poles at the sites.
  const billboard = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2.5),
    new THREE.MeshBasicMaterial({ map: billboardTexture() }),
  );
  billboard.position.set(0, 3.6, -17.9);
  group.add(billboard);

  // Lighting: dusk hemisphere, a low amber sun with shadows, two site lamps.
  const sky = new THREE.HemisphereLight(0x8a94c8, 0x3a2f22, 0.9);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
  sun.position.set(-26, 18, 14);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const lampA = new THREE.PointLight(0xffb02e, 12, 16, 1.6);
  lampA.position.set(-15.5, 4.5, -11);
  scene.add(lampA);
  const lampB = new THREE.PointLight(0x7fd4d4, 10, 16, 1.6);
  lampB.position.set(15.5, 4.5, -11);
  scene.add(lampB);

  // Distant skyline silhouettes outside the walls, for depth at a glance.
  const skylineMat = new THREE.MeshBasicMaterial({ color: 0x232838 });
  for (let i = 0; i < 14; i += 1) {
    const w = 4 + ((i * 37) % 7);
    const h = 6 + ((i * 53) % 14);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skylineMat);
    const side = i % 2 === 0 ? -1 : 1;
    tower.position.set(side * (26 + ((i * 11) % 12)), h / 2 - 0.5, -30 + ((i * 7) % 40) - 10);
    group.add(tower);
  }

  return { colliders, shootables, group, siteMarkers, textures };
}
