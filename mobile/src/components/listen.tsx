import { Square, Volume2, VolumeX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { setVoiceGuidance, speak, stopSpeaking, useVoiceGuidance } from '../lib/voice';
import { useApi } from '../services/api-context';
import { useTheme } from '../theme/theme';
import { Button } from './ui';

/**
 * Reads text aloud for people who prefer listening: Amazon Polly's natural voice, or the phone's
 * built-in voice if the speech service can't be reached.
 */
export function ListenButton({ text, label = 'Listen' }: { text: string; label?: string }) {
  const api = useApi();
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => stopSpeaking(), [text]);

  const play = async () => {
    if (playing) {
      stopSpeaking();
      return setPlaying(false);
    }
    setPlaying(true);
    await speak(api, text);
    setPlaying(false);
  };

  return (
    <Button
      label={playing ? 'Stop' : label}
      variant="secondary"
      icon={playing ? <Square size={16} color={colors.primary} /> : <Volume2 size={18} color={colors.primary} />}
      accessibilityHint={playing ? 'Stops reading aloud' : 'Reads this section aloud'}
      onPress={() => void play()}
    />
  );
}

/** Turns voice guidance on or off: approved screens read aloud as they open. */
export function VoiceToggle() {
  const on = useVoiceGuidance();
  const { colors } = useTheme();
  return (
    <Button
      label={on ? 'Voice guidance: on' : 'Voice guidance: off'}
      variant={on ? 'primary' : 'secondary'}
      icon={on ? <Volume2 size={18} color={colors.onPrimary} /> : <VolumeX size={18} color={colors.primary} />}
      accessibilityHint="Reads key screens aloud automatically"
      onPress={() => setVoiceGuidance(!on)}
    />
  );
}
