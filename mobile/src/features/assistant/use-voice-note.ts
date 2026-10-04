import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { asApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { MAX_UPLOAD_BYTES, uploadAndStart, waitForJob } from './inputs';

export const MAX_VOICE_SECONDS = 90;

export type VoicePhase = 'idle' | 'recording' | 'uploading' | 'transcribing';
export type VoiceMessage = { tone: 'info' | 'warning' | 'danger'; title: string; body?: string };

/**
 * Press to record, stop, then Amazon Transcribe returns words for the user to review and edit
 * (U-07). No always-on microphone; typing stays available at every step. The transcript is handed
 * to `onTranscript`; nothing is analysed until the user asks.
 */
export function useVoiceNote({
  ensureCase,
  onTranscript,
}: {
  ensureCase: () => Promise<{ caseId: string; caseRevision: number }>;
  onTranscript: (text: string) => void;
}) {
  const api = useApi();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [message, setMessage] = useState<VoiceMessage | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => void (cancelled.current = true), []);

  const start = async () => {
    if (phase !== 'idle') return;
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
        setMessage({ tone: 'info', title: 'Added what I heard to your notes', body: 'Fix anything I misheard. Nothing is used until you tap Analyse.' });
        AccessibilityInfo.announceForAccessibility('Transcript added to the text box. Review and edit it before analysing.');
      }
    } catch (caught) {
      setMessage({ tone: 'danger', title: caught instanceof Error && !('code' in caught) ? caught.message : asApiError(caught).message });
    } finally {
      if (!cancelled.current) setPhase('idle');
    }
  };

  const seconds = Math.floor((state.durationMillis ?? 0) / 1000);
  useEffect(() => {
    if (phase !== 'recording' || seconds < MAX_VOICE_SECONDS) return;
    const timer = setTimeout(() => void stop(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, seconds]);

  return {
    phase,
    seconds,
    message,
    busy: phase === 'uploading' || phase === 'transcribing',
    toggle: () => void (phase === 'recording' ? stop() : start()),
    start: () => void start(),
    dismissMessage: () => setMessage(null),
  };
}
