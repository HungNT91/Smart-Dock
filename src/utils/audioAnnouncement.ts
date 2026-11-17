/**
 * Logistics Warehouse PA System:
 * - Plays pleasant dual-tone chime (Web Audio API)
 * - Speaks dispatch announcement in Vietnamese using Web Speech API
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Plays warehouse chime: F5 (698.46 Hz) -> C6 (1046.5 Hz)
 */
export function playChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Note 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(698.46, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    // Note 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.5, now + 0.22);
    gain2.gain.setValueAtTime(0, now + 0.22);
    gain2.gain.linearRampToValueAtTime(0.22, now + 0.27);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.22);
    osc2.stop(now + 0.9);
  } catch (err) {
    console.warn('Audio chime error:', err);
  }
}

let pendingSpeechTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Cancel any queued or currently speaking announcement
 */
export function cancelAnnouncement(): void {
  if (pendingSpeechTimer) {
    clearTimeout(pendingSpeechTimer);
    pendingSpeechTimer = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore speech synthesis cancel error
    }
  }
}

/**
 * Announce truck arrival or dock assignment
 */
export function speakAnnouncement(text: string, enabled = true): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  cancelAnnouncement();
  playChime();

  pendingSpeechTimer = setTimeout(() => {
    pendingSpeechTimer = null;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.95;
      utterance.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find((v) => v.lang.startsWith('vi') || v.lang.includes('VN'));
      if (viVoice) {
        utterance.voice = viVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis error:', err);
    }
  }, 450);
}
