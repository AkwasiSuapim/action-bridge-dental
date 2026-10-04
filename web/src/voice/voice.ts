import { speakable } from '@actionbridge/contracts';
import { useEffect, useSyncExternalStore } from 'react';
import type { ApiClient } from '../services/api';

/**
 * Voice guidance: approved screens read their key content aloud (Amazon Polly, with the browser
 * voice as a fallback) and "Is this right?" cards can be answered by voice with the browser's
 * speech recognition. Off by default; the choice is remembered in this browser.
 */
const KEY = 'actionbridge.web.voice.v1';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}
let voiceOn = read();

export function setVoiceGuidance(on: boolean) {
  voiceOn = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* memory only */
  }
  if (!on) stopSpeaking();
  listeners.forEach((l) => l());
}

export function useVoiceGuidance(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => voiceOn,
    () => false,
  );
}

// ---- Speaking ------------------------------------------------------------------------------

let current: { audio: HTMLAudioElement | null; done: () => void } | null = null;

export function stopSpeaking() {
  current?.audio?.pause();
  current?.done();
  current = null;
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/** Speaks the text and resolves when it has finished (or was stopped). */
export async function speak(api: ApiClient, text: string): Promise<void> {
  stopSpeaking();
  const spoken = speakable(text);
  if (!spoken) return;
  let finish = () => undefined as void;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  const mine = { audio: null as HTMLAudioElement | null, done: finish };
  current = mine;
  try {
    const result = await api.speech(spoken);
    if (current !== mine) return;
    const audio = new Audio(
      `data:${result.contentType};base64,${result.audioBase64}`,
    );
    mine.audio = audio;
    audio.onended = () => finish();
    audio.onerror = () => finish();
    await audio.play();
  } catch {
    if (current !== mine) return;
    if (typeof speechSynthesis === 'undefined') return finish();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.onend = () => finish();
    utterance.onerror = () => finish();
    speechSynthesis.speak(utterance);
  }
  await finished;
  if (current === mine) current = null;
}

/** Reads the text once when it appears on an approved screen, if voice guidance is on. */
export function useAutoRead(
  api: ApiClient,
  text: string | null,
  enabled = true,
) {
  const on = useVoiceGuidance();
  useEffect(() => {
    if (!on || !enabled || !text) return;
    void speak(api, text);
    return () => stopSpeaking();
  }, [api, on, enabled, text]);
}

// ---- Listening -----------------------------------------------------------------------------

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () =>
  typeof window !== 'undefined' && recognitionClass() !== null;

let activeRecognition: Recognition | null = null;
export function stopListening() {
  activeRecognition?.abort();
  activeRecognition = null;
}

/** Opens the microphone for up to `ms` and resolves with what was heard, or null. */
export function listenOnce(ms = 6000): Promise<string | null> {
  const Klass = recognitionClass();
  if (!Klass) return Promise.resolve(null);
  stopListening();
  return new Promise((resolve) => {
    const recognition = new Klass();
    activeRecognition = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    let heard: string | null = null;
    const timer = setTimeout(() => recognition.stop(), ms);
    recognition.onresult = (event) => {
      heard = event.results[0]?.[0]?.transcript ?? null;
      recognition.stop();
    };
    recognition.onerror = () => undefined;
    recognition.onend = () => {
      clearTimeout(timer);
      if (activeRecognition === recognition) activeRecognition = null;
      resolve(heard);
    };
    try {
      recognition.start();
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}
