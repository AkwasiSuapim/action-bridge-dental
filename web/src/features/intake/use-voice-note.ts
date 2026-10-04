import { useEffect, useRef, useState } from 'react';
import { MAX_UPLOAD_BYTES, recordingType } from '../../domain/composer';
import { asApiError, uploadToSlot } from '../../services/api';
import { useApi } from '../../state/auth';
import { waitForJob } from '../../state/use-job';

export const MAX_VOICE_SECONDS = 90;

export type VoicePhase = 'idle' | 'recording' | 'uploading' | 'transcribing';
export type VoiceMessage = {
  tone: 'info' | 'warning' | 'danger';
  title: string;
  body?: string;
};

/**
 * Press to record, stop, then Amazon Transcribe returns words for the user to review and edit.
 * The browser records WebM/Ogg (Opus) or MP4; the backend checks the real format. The microphone
 * is only on while recording, and typing stays available at every step.
 */
export function useVoiceNote({
  ensureCase,
  onTranscript,
}: {
  ensureCase: () => Promise<{ caseId: string; caseRevision: number }>;
  onTranscript: (text: string) => void;
}) {
  const api = useApi();
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [message, setMessage] = useState<VoiceMessage | null>(null);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const format =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
      ? recordingType((type) => MediaRecorder.isTypeSupported(type))
      : null;

  const release = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };

  useEffect(
    () => () => {
      cancelled.current = true;
      recorder.current?.state === 'recording' && recorder.current.stop();
      release();
    },
    [],
  );

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_VOICE_SECONDS) recorder.current?.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  const transcribe = async (blob: Blob) => {
    if (!format) return;
    if (blob.size === 0) {
      setMessage({
        tone: 'warning',
        title: 'Nothing was recorded. Please try again, or type instead.',
      });
      setPhase('idle');
      return;
    }
    if (blob.size > MAX_UPLOAD_BYTES) {
      setMessage({
        tone: 'warning',
        title:
          'That recording is too long. Please keep it under a minute and a half.',
      });
      setPhase('idle');
      return;
    }
    try {
      setPhase('uploading');
      const { caseId, caseRevision } = await ensureCase();
      const slot = await api.createUpload(caseId, {
        kind: 'audio',
        mimeType: format.upload,
        sizeBytes: blob.size,
      });
      await uploadToSlot(slot, new Blob([blob], { type: format.upload }));
      const { jobId } = await api.createJob(caseId, {
        expectedRevision: caseRevision,
        operation: 'transcribe_audio',
        input: { documentId: slot.uploadId },
      });
      setPhase('transcribing');
      const job = await waitForJob(api, jobId, () => cancelled.current);
      if (cancelled.current) return;
      if (!job)
        setMessage({
          tone: 'warning',
          title: 'Transcription is taking longer than usual.',
          body: 'Please try again, or type instead.',
        });
      else if (job.status === 'failed')
        setMessage({
          tone: 'danger',
          title:
            job.error?.message ?? 'The recording could not be transcribed.',
        });
      else if (!job.transcript)
        setMessage({
          tone: 'warning',
          title: 'I couldn’t make out any words.',
          body: 'Try again a little closer to the microphone, or type instead.',
        });
      else {
        onTranscript(job.transcript);
        setMessage({
          tone: 'info',
          title: 'Added what I heard to your notes',
          body: 'Fix anything I misheard. Nothing is used until you choose Analyse.',
        });
      }
    } catch (caught) {
      setMessage({ tone: 'danger', title: asApiError(caught).message });
    } finally {
      if (!cancelled.current) setPhase('idle');
    }
  };

  const start = async () => {
    if (phase !== 'idle' || !format) return;
    setMessage(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch {
      setMessage({
        tone: 'warning',
        title: 'The microphone is off for this site',
        body: 'You can type instead, or allow the microphone in your browser’s site settings.',
      });
      return;
    }
    chunks.current = [];
    const next = new MediaRecorder(stream.current, {
      mimeType: format.recorder,
    });
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    next.onstop = () => {
      release();
      void transcribe(new Blob(chunks.current, { type: format.upload }));
    };
    recorder.current = next;
    startedAt.current = Date.now();
    setSeconds(0);
    next.start(1000);
    setPhase('recording');
  };

  const stop = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  return {
    phase,
    seconds,
    message,
    supported: format !== null,
    busy: phase === 'uploading' || phase === 'transcribing',
    toggle: () => (phase === 'recording' ? stop() : void start()),
    start: () => void start(),
  };
}
