/**
 * The sound of a nudge (ADR-0020): two soft tones made with WebAudio, no file. Browsers play sound only after the page
 * was used once, so the first click or key press in the page unlocks it; after that a nudge is heard even while the
 * tab is in the background. Whether it plays is decided by the notice centre (ADR-0023).
 */
let context: AudioContext | null = null;

/** create (and resume) the audio context with the first click or key press; returns the cleanup */
export function unlockAudioOnFirstUse(): () => void {
  const unlock = () => {
    try {
      context ??= new AudioContext();
      void context.resume();
    } catch {
      /* no WebAudio: nudges stay silent */
    }
    remove();
  };
  const remove = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  return remove;
}

/** "ding-dong": two short sine tones, a sixth apart, fading out */
export function playNudgeSound(): void {
  if (!context || context.state !== "running") return;
  const start = context.currentTime + 0.01;
  for (const [i, frequency] of [880, 523.25].entries()) {
    const at = start + i * 0.22;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    osc.connect(gain).connect(context.destination);
    osc.start(at);
    osc.stop(at + 0.65);
  }
}
