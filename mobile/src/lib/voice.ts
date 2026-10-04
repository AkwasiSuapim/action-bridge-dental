import { speakable } from '@actionbridge/contracts';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { useEffect, useSyncExternalStore } from 'react';
import type { ApiClient } from '../services/api';
import { deviceStorage } from './device-storage';

/**
 * Voice guidance on the phone: approved screens read their key content aloud as they open
 * (Amazon Polly, with the phone's own voice as a fallback). Answers are tapped on the phone.
 * Off by default; the choice is remembered on this device.
 */
const KEY = 'actionbridge.voice.v1';
const listeners = new Set<() => void>();
let voiceOn = false;
void deviceStorage
  .get(KEY)
  .then((value) => {
    voiceOn = value === 'on';
    listeners.forEach((l) => l());
  })
  .catch(() => undefined);

export function setVoiceGuidance(on: boolean) {
  voiceOn = on;
  void deviceStorage.set(KEY, on ? 'on' : 'off').catch(() => undefined);
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
  );
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Base64 → bytes without relying on atob (not on every Hermes build). */
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let out = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | ALPHABET.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.slice(0, out);
}

let current: { player: AudioPlayer | null; done: () => void } | null = null;

export function stopSpeaking() {
  current?.player?.remove();
  current?.done();
  current = null;
  void Speech.stop();
}

/** Speaks the text and resolves when it has finished (or was stopped). */
export async function speak(api: ApiClient, text: string): Promise<void> {
  stopSpeaking();
  const spoken = speakable(text);
  if (!spoken) return;
  let finish = () => undefined as void;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  const mine = { player: null as AudioPlayer | null, done: finish };
  current = mine;
  try {
    const result = await api.speech(spoken);
    if (current !== mine) return;
    const file = new File(Paths.cache, `speech-${Date.now()}.mp3`);
    file.create({ overwrite: true });
    file.write(base64ToBytes(result.audioBase64));
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    const player = createAudioPlayer({ uri: file.uri });
    mine.player = player;
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finish();
    });
    player.play();
  } catch {
    if (current !== mine) return;
    Speech.speak(spoken, { onDone: finish, onStopped: finish, onError: finish });
  }
  await finished;
  mine.player?.remove();
  if (current === mine) current = null;
}

/** Reads the text once when it appears on an approved screen, if voice guidance is on. */
export function useAutoRead(api: ApiClient, text: string | null) {
  const on = useVoiceGuidance();
  useEffect(() => {
    if (!on || !text) return;
    void speak(api, text);
    return () => stopSpeaking();
  }, [api, on, text]);
}
