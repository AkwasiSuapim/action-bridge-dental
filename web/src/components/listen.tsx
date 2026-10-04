import { LoaderCircle, Square, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../state/auth';
import { Button } from './ui';

/**
 * Reads text aloud for people who prefer listening. Amazon Polly speaks it (natural voice);
 * if the speech service can't be reached, the browser's built-in voice is used instead.
 */
export function ListenButton({
  text,
  label = 'Listen',
}: {
  text: string;
  label?: string;
}) {
  const api = useApi();
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audio = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    setState('idle');
  };
  useEffect(() => stop, []);
  useEffect(() => stop, [text]);

  const browserVoice = () => {
    if (typeof speechSynthesis === 'undefined') return setState('idle');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setState('idle');
    utterance.onerror = () => setState('idle');
    speechSynthesis.speak(utterance);
    setState('playing');
  };

  const play = async () => {
    if (state !== 'idle') return stop();
    setState('loading');
    try {
      const result = await api.speech(text);
      const player = new Audio(
        `data:${result.contentType};base64,${result.audioBase64}`,
      );
      audio.current = player;
      player.onended = () => setState('idle');
      await player.play();
      setState('playing');
    } catch {
      browserVoice();
    }
  };

  return (
    <Button
      variant="secondary"
      className="listen-button"
      icon={
        state === 'loading'
          ? LoaderCircle
          : state === 'playing'
            ? Square
            : Volume2
      }
      aria-label={
        state === 'playing' ? 'Stop reading aloud' : `${label}: read this aloud`
      }
      aria-pressed={state === 'playing'}
      onClick={() => void play()}
    >
      {state === 'playing' ? 'Stop' : label}
    </Button>
  );
}
