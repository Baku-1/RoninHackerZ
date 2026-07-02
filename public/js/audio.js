// No audio assets ship with the prototype, so synthesize short cues with WebAudio.

let audioCtx = null;
let ambientDrone = null;

export function playSound(soundId, volume = 0.5) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (soundId === 'sound-ambient') {
            if (ambientDrone) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 55;
            gain.gain.value = volume * 0.05;
            osc.connect(gain).connect(audioCtx.destination);
            osc.start();
            ambientDrone = { osc, gain };
            return;
        }
        const presets = {
            'sound-ui-click':        { type: 'square',   duration: 0.07, notes: [880] },
            'sound-scan-ping':       { type: 'sine',     duration: 0.4,  notes: [1200] },
            'sound-intercept':       { type: 'sine',     duration: 0.15, notes: [1400, 1800] },
            'sound-penalty':         { type: 'sawtooth', duration: 0.5,  notes: [220, 160] },
            'sound-bounty-complete': { type: 'triangle', duration: 0.3,  notes: [660, 880, 1320] }
        };
        const preset = presets[soundId] || presets['sound-ui-click'];
        preset.notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = preset.type;
            osc.frequency.value = freq;
            const start = audioCtx.currentTime + i * 0.12;
            gain.gain.setValueAtTime(volume * 0.3, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + preset.duration);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(start);
            osc.stop(start + preset.duration);
        });
    } catch {
        // Audio is non-essential; never let it break gameplay.
    }
}
