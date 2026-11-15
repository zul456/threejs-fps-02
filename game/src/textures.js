// Procedural textures, drawn once on canvases: the game ships no image files,
// so every surface is its own art. Each returns a THREE.CanvasTexture with
// repeat wrapping; the caller sets repeat per mesh.
import * as THREE from 'three';

function canvas(size, draw) {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  draw(element.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function speckle(ctx, size, colors, count, maxR) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.globalAlpha = 0.05 + Math.random() * 0.12;
    const r = 1 + Math.random() * maxR;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function makeTextures() {
  // Worn asphalt: dark sand base, pale aggregate speckle, faint expansion joints.
  const ground = canvas(512, (ctx, s) => {
    ctx.fillStyle = '#3a3630';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ['#4a463d', '#2e2b26', '#57503f', '#6b5f45'], 2600, 3);
    ctx.strokeStyle = 'rgba(20,18,15,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.strokeStyle = 'rgba(240,220,170,0.10)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.5);
    ctx.lineTo(s, s * 0.5);
    ctx.stroke();
  });
  ground.repeat.set(11, 9);

  // Painted concrete: pale grey with formwork seams and stains.
  const concrete = canvas(256, (ctx, s) => {
    ctx.fillStyle = '#6b6a63';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ['#7a786f', '#5b5952', '#83807a'], 1200, 2);
    ctx.strokeStyle = 'rgba(30,28,25,0.4)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(0, (s / 4) * i); ctx.lineTo(s, (s / 4) * i); ctx.stroke();
      ctx.beginPath(); ctx.moveTo((s / 4) * i, 0); ctx.lineTo((s / 4) * i, s); ctx.stroke();
    }
  });

  // Corrugated container panel: vertical ribs with a top rail and rust streaks.
  function container(base, rib, streak) {
    return canvas(256, (ctx, s) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) {
        ctx.fillStyle = rib;
        ctx.fillRect(x, 0, 7, s);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x + 7, 0, 3, s);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, s, 10);
      ctx.fillRect(0, s - 10, s, 10);
      for (let i = 0; i < 26; i += 1) {
        ctx.fillStyle = streak;
        ctx.globalAlpha = 0.08 + Math.random() * 0.16;
        const x = Math.random() * s;
        ctx.fillRect(x, Math.random() * s * 0.4, 3 + Math.random() * 4, 30 + Math.random() * 90);
      }
      ctx.globalAlpha = 1;
    });
  }
  const rust = container('#a4552f', '#8f4726', '#5e2c15');
  const teal = container('#2f6b6b', '#275a5a', '#173a3a');
  const sand = container('#b08d4f', '#96783f', '#6b5226');

  // Hazard chevrons for site markers and the plant zones.
  const hazard = canvas(128, (ctx, s) => {
    ctx.fillStyle = '#c99a2e';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#1c1a17';
    for (let i = -2; i < 6; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 32, s);
      ctx.lineTo(i * 32 + 32, 0);
      ctx.lineTo(i * 32 + 48, 0);
      ctx.lineTo(i * 32 + 16, s);
      ctx.closePath();
      ctx.fill();
    }
  });
  hazard.repeat.set(4, 4);

  // Dark steel for doors, frames and the silo.
  const steel = canvas(128, (ctx, s) => {
    ctx.fillStyle = '#33373d';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ['#43484f', '#26292e'], 500, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, s - 4, s - 4);
  });

  return { ground, concrete, rust, teal, sand, hazard, steel };
}
