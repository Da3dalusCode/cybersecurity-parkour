import { useCallback, useEffect, useState } from 'react';

const FIRST_CALLOUT_DELAY_MS = 5500;
const MIN_INTERVAL_MS = 14000;
const MAX_INTERVAL_MS = 22000;

const CALLOUTS = [
  'Threat vector mapped. Keep moving.',
  'Cipher route stable. Maintain momentum.',
  'Packet channel open. Secure the data.',
  'Trace pressure rising. Find the next gate.',
  'Firewall adapting. Change your line.',
  'Uplink signal locked. Route is live.',
] as const;

const getRandomDelay = () =>
  Math.floor(Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS + 1)) + MIN_INTERVAL_MS;

export function useYeller() {
  const [muted, setMuted] = useState(true);
  const [isGameActive, setIsGameActive] = useState(false);
  const [isSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined',
  );

  const cancelSpeech = useCallback(() => {
    if (isSupported) window.speechSynthesis.cancel();
  }, [isSupported]);

  const speak = useCallback(() => {
    if (!isSupported) return;

    const line = CALLOUTS[Math.floor(Math.random() * CALLOUTS.length)];
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.rate = 0.94;
    utterance.pitch = 0.82;
    utterance.volume = 0.58;
    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handlePointerLock = () => setIsGameActive(Boolean(document.pointerLockElement));
    document.addEventListener('pointerlockchange', handlePointerLock);
    handlePointerLock();
    return () => document.removeEventListener('pointerlockchange', handlePointerLock);
  }, []);

  useEffect(() => {
    if (!isSupported || muted || !isGameActive) {
      cancelSpeech();
      return undefined;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        if (cancelled) return;
        speak();
        schedule(getRandomDelay());
      }, delay);
    };

    schedule(FIRST_CALLOUT_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelSpeech();
    };
  }, [cancelSpeech, isGameActive, isSupported, muted, speak]);

  const toggleMute = useCallback(() => setMuted((value) => !value), []);

  return {
    isSupported,
    muted,
    toggleMute,
  };
}

export default useYeller;
