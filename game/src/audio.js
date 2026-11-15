// All sound is synthesised with WebAudio: no audio files, no network. A
// master gain feeds one shared noise buffer; every effect is a short envelope
// over an oscillator or that buffer, so a shot costs one node, not a download.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(dur, filterFreq, gainValue, when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, Math.random() * 0.2);
    source.stop(t + dur + 0.02);
  }

  function tone(freq, dur, gainValue, type = 'sine', slideTo = 0, when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    shot(kind) {
      if (kind === 'sniper') {
        noise(0.22, 900, 0.9);
        tone(160, 0.18, 0.5, 'sine', 50);
      } else if (kind === 'shotgun') {
        noise(0.28, 700, 1.0);
        tone(110, 0.22, 0.6, 'sine', 40);
      } else if (kind === 'smg') {
        noise(0.09, 1800, 0.55);
        tone(220, 0.07, 0.3, 'square', 90);
      } else if (kind === 'pistol') {
        noise(0.11, 1400, 0.6);
        tone(190, 0.08, 0.35, 'square', 80);
      } else {
        noise(0.13, 1200, 0.7);
        tone(150, 0.1, 0.45, 'sawtooth', 60);
      }
    },
    distantShot() {
      noise(0.18, 500, 0.22);
    },
    dry() {
      tone(1400, 0.03, 0.15, 'square');
    },
    reload() {
      tone(900, 0.04, 0.2, 'square');
      tone(600, 0.04, 0.2, 'square', 0, 0.18);
      tone(1100, 0.05, 0.25, 'square', 0, 0.45);
    },
    hit() {
      tone(1900, 0.05, 0.3, 'sine');
    },
    kill() {
      tone(1500, 0.06, 0.3, 'sine');
      tone(2100, 0.09, 0.3, 'sine', 0, 0.07);
    },
    hurt() {
      tone(120, 0.15, 0.5, 'sawtooth', 60);
      noise(0.1, 400, 0.3);
    },
    step() {
      noise(0.05, 300, 0.08);
    },
    plantBeep(fast) {
      tone(fast ? 1400 : 1000, 0.07, 0.3, 'square');
    },
    defuseBeep() {
      tone(800, 0.06, 0.25, 'square');
    },
    explosion() {
      noise(0.9, 350, 1.2);
      tone(70, 0.8, 0.9, 'sine', 28);
      noise(0.4, 2000, 0.4, 0.05);
    },
    grenadePin() {
      tone(2200, 0.03, 0.2, 'square');
    },
    roundWin() {
      tone(523, 0.12, 0.3, 'triangle');
      tone(659, 0.12, 0.3, 'triangle', 0, 0.12);
      tone(784, 0.22, 0.35, 'triangle', 0, 0.24);
    },
    roundLose() {
      tone(392, 0.14, 0.3, 'triangle');
      tone(330, 0.14, 0.3, 'triangle', 0, 0.14);
      tone(262, 0.28, 0.35, 'triangle', 0, 0.28);
    },
    buy() {
      tone(880, 0.05, 0.25, 'square');
      tone(1320, 0.07, 0.25, 'square', 0, 0.06);
    },
    denied() {
      tone(220, 0.12, 0.3, 'square');
    },
    click() {
      tone(1200, 0.03, 0.18, 'square');
    },
  };
}
