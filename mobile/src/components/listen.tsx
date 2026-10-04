import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Square, Volume2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../services/api-context';
import { useTheme } from '../theme/theme';
import { Button } from './ui';

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

/**
 * Reads text aloud for people who prefer listening. Amazon Polly speaks it (natural voice); if
 * the speech service can't be reached, the phone's built-in voice is used instead.
 */
export function ListenButton({ text, label = 'Listen' }: { text: string; label?: string }) {
  const api = useApi();
  const { colors } = useTheme();
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const player = useRef<AudioPlayer | null>(null);

  const stop = () => {
    player.current?.remove();
    player.current = null;
    void Speech.stop();
    setState('idle');
  };
  useEffect(() => stop, []);

  const deviceVoice = () => {
    Speech.speak(text, { onDone: () => setState('idle'), onStopped: () => setState('idle'), onError: () => setState('idle') });
    setState('playing');
  };

  const play = async () => {
    if (state !== 'idle') return stop();
    setState('loading');
    try {
      const result = await api.speech(text);
      const file = new File(Paths.cache, `speech-${Date.now()}.mp3`);
      file.create({ overwrite: true });
      file.write(base64ToBytes(result.audioBase64));
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const next = createAudioPlayer({ uri: file.uri });
      next.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          next.remove();
          if (player.current === next) player.current = null;
          setState('idle');
        }
      });
      player.current = next;
      next.play();
      setState('playing');
    } catch {
      deviceVoice();
    }
  };

  return (
    <Button
      label={state === 'playing' ? 'Stop' : state === 'loading' ? 'Loading…' : label}
      variant="secondary"
      icon={state === 'playing' ? <Square size={16} color={colors.primary} /> : <Volume2 size={18} color={colors.primary} />}
      accessibilityHint={state === 'playing' ? 'Stops reading aloud' : 'Reads this section aloud'}
      onPress={() => void play()}
    />
  );
}
