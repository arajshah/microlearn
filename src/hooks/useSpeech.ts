import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';

/** Thin wrapper around expo-speech that tracks speaking state. */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const stop = useCallback(() => {
    Speech.stop();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    Speech.stop();
    const t = text?.trim();
    if (!t) return;
    setSpeaking(true);
    Speech.speak(t, {
      rate: 1.0,
      pitch: 1.0,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, []);

  return { speaking, speak, stop };
}
