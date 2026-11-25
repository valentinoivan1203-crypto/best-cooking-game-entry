// Rush Hour Kitchen — sound: tiny synthesized blips from the Web Audio API.
// No audio files, no network. Created lazily on the first user gesture so
// the browser allows it; a mute toggle silences everything.

let ctx = null;
let muted = false;
let unlocked = false;

export function setMuted(value) {
  muted = value;
}

export function isMuted() {
  return muted;
}

function ensureCtx() {
  if (!unlocked) return null; // never create audio before a user gesture
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

// Unlock audio on a user gesture (browsers block it before one).
export function unlockAudio() {
  unlocked = true;
  const c = ensureCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function blip(freq, dur, type = 'sine', gain = 0.12, when = 0) {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  try {
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    // Sound is garnish; a failure must never break the game.
  }
}

export const sfx = {
  pick() { blip(520, 0.07, 'sine', 0.10); },
  drop() { blip(340, 0.06, 'sine', 0.08); },
  cookStart() { blip(240, 0.12, 'triangle', 0.10); },
  chop() { blip(180, 0.05, 'square', 0.07); blip(150, 0.05, 'square', 0.06, 0.09); },
  ready() { blip(660, 0.09, 'sine', 0.11); blip(880, 0.12, 'sine', 0.11, 0.09); },
  plate() { blip(440, 0.06, 'triangle', 0.10); },
  serve() { blip(523, 0.1, 'sine', 0.12); blip(659, 0.1, 'sine', 0.12, 0.09); blip(784, 0.16, 'sine', 0.12, 0.18); },
  error() { blip(160, 0.15, 'sawtooth', 0.07); },
  timeout() { blip(220, 0.2, 'sawtooth', 0.09); blip(165, 0.25, 'sawtooth', 0.09, 0.18); },
  tick() { blip(980, 0.04, 'sine', 0.05); },
  start() { blip(392, 0.1, 'sine', 0.11); blip(523, 0.1, 'sine', 0.11, 0.09); blip(659, 0.16, 'sine', 0.11, 0.18); },
};
