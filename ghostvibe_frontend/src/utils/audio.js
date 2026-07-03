// Sound synthesis utilities using Web Audio API

let isSoundEnabled = true;
try {
  isSoundEnabled = localStorage.getItem('gv_sound_enabled') !== 'false';
} catch (e) {
  console.warn('localStorage is not accessible:', e);
}

export const setSoundEnabled = (enabled) => {
  isSoundEnabled = enabled;
  try {
    localStorage.setItem('gv_sound_enabled', enabled ? 'true' : 'false');
  } catch (e) {
    console.warn('localStorage is not accessible:', e);
  }
};

export const getSoundEnabled = () => {
  return isSoundEnabled;
};

// Lazy initialize AudioContext on user interaction to comply with browser autoplay policy
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playSentChime() {
  if (!isSoundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {
    console.error('Audio synthesis failed:', e);
  }
}

export function playReceivedChime() {
  if (!isSoundEnabled) return;
  try {
    const ctx = getAudioContext();
    
    // Play two notes in quick succession (ascending soft pluck)
    const playNote = (freq, delay, duration, volume) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      
      gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    };

    // Ascending soft chime
    playNote(523.25, 0, 0.15, 0.08); // C5
    playNote(783.99, 0.06, 0.25, 0.06); // G5
  } catch (e) {
    console.error('Audio synthesis failed:', e);
  }
}

export function playVibeChime(vibeType) {
  if (!isSoundEnabled) return;
  try {
    const ctx = getAudioContext();

    if (vibeType === 'chill') {
      // Soft cozy bell chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.6); // E4 slide down

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);

    } else if (vibeType === 'electric') {
      // Upbeat neon synth arpeggio (3 notes rapid succession)
      const playPulse = (freq, time, len) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + time);
        
        // Low pass filter to make sawtooth softer
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, ctx.currentTime + time);

        gain.gain.setValueAtTime(0.06, ctx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + len);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + time);
        osc.stop(ctx.currentTime + time + len);
      };

      playPulse(523.25, 0, 0.12);
      playPulse(659.25, 0.06, 0.12);
      playPulse(783.99, 0.12, 0.20);

    } else if (vibeType === 'ghost') {
      // Spooky detuned synth slide up
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const osc2 = ctx.createOscillator(); // detuned second osc for chorus

      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + 0.7);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(183, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(485, ctx.currentTime + 0.7);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);

      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc2.start();
      osc.stop(ctx.currentTime + 0.75);
      osc2.stop(ctx.currentTime + 0.75);

    } else if (vibeType === 'party') {
      // Celebratory synth fan-fare chord
      const freqs = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
      const now = ctx.currentTime;
      
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6 + (idx * 0.05));

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 0.8);
      });
    }
  } catch (e) {
    console.error('Audio synthesis failed:', e);
  }
}
