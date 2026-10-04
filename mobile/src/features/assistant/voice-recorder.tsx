import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { File } from 'expo-file-system';
import { Mic, Square } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Notice } from '../../components/ui';
import { asApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import { MAX_UPLOAD_BYTES, uploadAndStart, waitForJob } from './inputs';

const MAX_SECONDS = 90;

type Phase = 'idle' | 'recording' | 'uploading' | 'transcribing';

/**
 * Press to record, stop, then Amazon Transcribe returns words for the user to review and edit
 * (U-07). No always-on microphone; typing stays available at every step.
 */
export function VoiceRecorder({
  ensureCase,
  onTranscript,
}: {
  ensureCase: () => Promise<{ caseId: string; caseRevision: number }>;
  onTranscript: (text: string) => void;
}) {
  const api = useApi();
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<{ tone: 'info' | 'warning' | 'danger'; title: string; body?: string } | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => void (cancelled.current = true), []);

  const start = async () => {
    setMessage(null);
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setMessage({ tone: 'warning', title: 'Microphone is off for this app', body: 'You can type instead, or allow the microphone in your phone’s Settings.' });
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setPhase('recording');
    AccessibilityInfo.announceForAccessibility('Recording. Tap stop when you are done.');
  };

  const stop = async () => {
    if (phase !== 'recording') return;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    const uri = recorder.uri;
    if (!uri) {
      setPhase('idle');
      setMessage({ tone: 'danger', title: 'The recording could not be saved. Please try again, or type instead.' });
      return;
    }
    const sizeBytes = new File(uri).size;
    if (sizeBytes > MAX_UPLOAD_BYTES) {
      setPhase('idle');
      setMessage({ tone: 'warning', title: 'That recording is too long. Please keep it under a minute and a half.' });
      return;
    }
    try {
      setPhase('uploading');
      const { caseId, caseRevision } = await ensureCase();
      const jobId = await uploadAndStart(api, caseId, caseRevision, 'audio', { uri, mimeType: 'audio/mp4', sizeBytes });
      setPhase('transcribing');
      const job = await waitForJob(api, jobId, () => cancelled.current);
      if (cancelled.current) return;
      if (!job) setMessage({ tone: 'warning', title: 'Transcription is taking longer than usual.', body: 'Please try again, or type instead.' });
      else if (job.status === 'failed') setMessage({ tone: 'danger', title: job.error?.message ?? 'The recording could not be transcribed.' });
      else if (!job.transcript) setMessage({ tone: 'warning', title: 'I couldn’t make out any words.', body: 'Try again a little closer to the phone, or type instead.' });
      else {
        onTranscript(job.transcript);
        setMessage({ tone: 'info', title: 'Here’s what I heard', body: 'It’s in the box below. Fix anything I misheard — nothing is used until you continue.' });
        AccessibilityInfo.announceForAccessibility('Transcript added to the text box. Review and edit it before continuing.');
      }
    } catch (caught) {
      setMessage({ tone: 'danger', title: caught instanceof Error && !('code' in caught) ? caught.message : asApiError(caught).message });
    } finally {
      if (!cancelled.current) setPhase('idle');
    }
  };

  const seconds = Math.floor((state.durationMillis ?? 0) / 1000);
  useEffect(() => {
    if (phase === 'recording' && seconds >= MAX_SECONDS) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, seconds]);

  const recording = phase === 'recording';
  const busy = phase === 'uploading' || phase === 'transcribing';
  const label = recording ? `Stop recording, ${seconds} seconds` : busy ? 'Working on your recording' : 'Record a voice note';

  return (
    <View style={{ gap: space(2) }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={recording ? stop : start}
        style={({ pressed }) => ({
          minHeight: layout.minHitArea + 16,
          borderRadius: layout.radius,
          borderWidth: 1.5,
          borderColor: recording ? colors.danger : colors.primary,
          backgroundColor: recording ? colors.dangerSoft : colors.primarySoft,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space(3),
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {busy ? <ActivityIndicator color={colors.primary} /> : recording ? <Square size={20} color={colors.danger} fill={colors.danger} /> : <Mic size={22} color={colors.primary} />}
        <AppText variant="label" color={recording ? colors.danger : colors.primary} style={{ fontFamily: fonts.semibold, fontSize: 16 }}>
          {recording ? `Stop · ${seconds}s` : phase === 'uploading' ? 'Uploading securely…' : phase === 'transcribing' ? 'Turning your words into text…' : 'Prefer to talk? Record a voice note'}
        </AppText>
      </Pressable>
      {recording ? (
        <AppText variant="caption" muted>
          Say what your dentist recommended, the costs, and what your plan pays. Stops automatically at {MAX_SECONDS} seconds.
        </AppText>
      ) : null}
      {message ? <Notice tone={message.tone} title={message.title} {...(message.body ? { body: message.body } : {})} /> : null}
    </View>
  );
}
