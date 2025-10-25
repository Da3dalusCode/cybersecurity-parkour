import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_INTERVAL_MS = 2000;
const MAX_INTERVAL_MS = 3000;

const getRandomDelay = () =>
  Math.floor(Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS + 1)) + MIN_INTERVAL_MS;

export function useYeller() {
  const [muted, setMuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStartedRef = useRef(false);
  const isSpeechSupportedRef = useRef(
    typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined',
  );

  const isSpeechSupported = isSpeechSupportedRef.current;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelQueuedSpeech = useCallback(() => {
    if (isSpeechSupported) {
      window.speechSynthesis.cancel();
    }
  }, [isSpeechSupported]);

  const speak = useCallback(() => {
    if (!isSpeechSupported) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance('Cybersecurity!');
    window.speechSynthesis.speak(utterance);
  }, [isSpeechSupported]);

  const scheduleNext = useCallback(() => {
    if (!isSpeechSupported || muted) {
      return;
    }

    clearTimer();

    const delay = getRandomDelay();
    timerRef.current = setTimeout(() => {
      speak();
      scheduleNext();
    }, delay);
  }, [clearTimer, isSpeechSupported, muted, speak]);

  const stop = useCallback(() => {
    clearTimer();
    cancelQueuedSpeech();
  }, [cancelQueuedSpeech, clearTimer]);

  const start = useCallback(() => {
    if (!isSpeechSupported || muted) {
      return;
    }

    speak();
    scheduleNext();
  }, [isSpeechSupported, muted, scheduleNext, speak]);

  const handlePointerLock = useCallback(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    start();
  }, [start]);

  useEffect(() => {
    if (muted) {
      stop();
    } else if (hasStartedRef.current && timerRef.current === null) {
      scheduleNext();
    }
  }, [muted, scheduleNext, stop]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const onPointerLockChange = () => {
      if (document.pointerLockElement) {
        handlePointerLock();
      }
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);

    if (document.pointerLockElement) {
      handlePointerLock();
    }

    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }, [handlePointerLock]);

  useEffect(() => () => {
    stop();
  }, [stop]);

  const toggleMute = useCallback(() => {
    setMuted((value) => !value);
  }, []);

  return {
    isSupported: isSpeechSupported,
    muted,
    toggleMute,
  };
}

export default useYeller;
