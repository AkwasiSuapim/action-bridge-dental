import { LoaderCircle, Square, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApi } from '../state/auth';
import {
  setVoiceGuidance,
  speak,
  stopSpeaking,
  useVoiceGuidance,
} from '../voice/voice';
import { Button } from './ui';

/**
 * Reads text aloud for people who prefer listening: Amazon Polly's natural voice, or the browser
 * voice if the speech service can't be reached.
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
  useEffect(() => () => stopSpeaking(), [text]);

  const play = async () => {
    if (state !== 'idle') {
      stopSpeaking();
      return setState('idle');
    }
    setState('loading');
    const spoken = speak(api, text);
    setState('playing');
    await spoken;
    setState('idle');
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

/** Turns voice guidance on or off: approved screens read aloud and accept spoken answers. */
export function VoiceToggle({ compact = false }: { compact?: boolean }) {
  const on = useVoiceGuidance();
  return (
    <Button
      variant={on ? 'primary' : 'secondary'}
      icon={on ? Volume2 : VolumeX}
      aria-pressed={on}
      aria-label={
        on ? 'Voice guidance is on. Turn it off' : 'Turn on voice guidance'
      }
      className="voice-toggle"
      onClick={() => setVoiceGuidance(!on)}
    >
      {compact ? null : on ? 'Voice on' : 'Voice off'}
    </Button>
  );
}
