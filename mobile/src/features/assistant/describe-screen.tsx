import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, ChevronDown, ChevronUp, FileText, Image as ImageIcon, Mic, Paperclip, RotateCcw, Square, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { AgentOrb, type OrbMode } from '../../components/orb';
import { ErrorNotice } from '../../components/states';
import { AppText, Badge, Button, Notice, Screen } from '../../components/ui';
import { capabilities } from '../../lib/capabilities';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import {
  addAttachment,
  analyseState,
  appendTranscript,
  attachmentName,
  jobInput,
  markFailed,
  markRetrying,
  markUploaded,
  MAX_ATTACHMENTS,
  MAX_TEXT_LENGTH,
  removeAttachment,
  type Attachment,
} from './composer';
import { mimeTypeFor, uploadToSlot } from './inputs';
import { MAX_VOICE_SECONDS, useVoiceNote } from './use-voice-note';

/** Explicitly fictional, matching the shared regression fixture. Always labeled as sample data. */
export const SAMPLE_DESCRIPTION = `I have dental insurance. My benefit year runs 2026-01-01 to 2026-12-31. The annual maximum is $800 and insurance already paid $500 this year. My deductible is $50 and I haven't met it yet.
The plan pays 80% for basic services and the deductible applies. It pays 50% for major services and the deductible applies.
My dentist recommends two fillings at $250 each and a crown at $1,000. The office is in network, and the allowed amounts equal the charges.
The fillings are planned for 2026-11-10 and 2026-11-11 and the crown for 2026-11-12.`;

const WHAT_TO_MENTION = [
  'What your dentist recommended, and what each part costs',
  'What your plan pays: percentages, annual maximum, deductible',
  'What insurance has already paid this year',
  'When the dentist says it can be done',
];

type Start = 'voice' | 'upload' | 'photo' | 'type';

/**
 * The composer (doc 05 §3C): speak, type and attach pages as a draft, then Analyse once. Pages
 * upload in the background as they are added, but nothing is analysed until the user asks. The
 * assistant then shows what it understood ("Is this right?") and asks only for what is missing.
 */
export function DescribeScreen() {
  const api = useApi();
  const { colors } = useTheme();
  const { start: startWith } = useLocalSearchParams<{ start?: Start }>();
  const [text, setText] = useState('');
  const [isSample, setIsSample] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const created = useRef<Promise<{ caseId: string; caseRevision: number }> | null>(null);
  const nextId = useRef(0);
  const input = useRef<TextInput>(null);

  /** One case per visit, created on first use and shared by voice, pages and text. */
  const ensureCase = () => {
    created.current ??= api.createCase({ currency: 'USD', coverageMode: 'unknown', policy: null, planYears: {}, procedures: [] }).catch((error: unknown) => {
      created.current = null;
      throw error;
    });
    return created.current;
  };

  const voice = useVoiceNote({
    ensureCase,
    onTranscript: (heard) => {
      setIsSample(false);
      setText((current) => appendTranscript(current, heard));
    },
  });

  /** Uploads one page to its private slot. No job starts: the page waits in the draft. */
  const upload = async (attachment: Attachment) => {
    try {
      const { caseId } = await ensureCase();
      const slot = await api.createUpload(caseId, { kind: 'document', mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes });
      await uploadToSlot(slot, attachment);
      setAttachments((list) => markUploaded(list, attachment.localId, slot.uploadId));
    } catch (caught) {
      const message = caught instanceof Error && !('code' in caught) ? caught.message : asApiError(caught).message;
      setAttachments((list) => markFailed(list, attachment.localId, message));
    }
  };

  const attach = (file: { uri: string; mimeType: string; sizeBytes: number; kind: Attachment['kind']; pickedName?: string | null }) => {
    setFileProblem(null);
    const localId = `att-${++nextId.current}`;
    const added = addAttachment(attachments, { localId, name: attachmentName(file.kind, file.pickedName, attachments), kind: file.kind, uri: file.uri, mimeType: file.mimeType, sizeBytes: file.sizeBytes });
    if (!added.ok) {
      setFileProblem(added.problem);
      return;
    }
    setAttachments(added.list);
    const attachment = added.list[added.list.length - 1];
    if (attachment) void upload(attachment);
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const mimeType = mimeTypeFor(asset.uri, asset.mimeType);
    if (!mimeType || mimeType.startsWith('audio/')) {
      setFileProblem('Please choose a PDF, JPEG or PNG.');
      return;
    }
    attach({ uri: asset.uri, mimeType, sizeBytes: asset.size ?? 0, kind: 'document', pickedName: asset.name });
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setFileProblem('The camera is off for this app. You can upload a file or type instead, or allow the camera in Settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    attach({ uri: asset.uri, mimeType: mimeTypeFor(asset.uri, asset.mimeType) ?? 'image/jpeg', sizeBytes: asset.fileSize ?? 0, kind: 'photo' });
  };

  // Home's buttons say what the user wants to do first; do it on arrival, once.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    // After the screen has appeared, so the permission prompt or picker opens over it.
    setTimeout(() => {
      if (startWith === 'voice' && capabilities.voice) voice.start();
      else if (startWith === 'upload' && capabilities.upload) void pickDocument();
      else if (startWith === 'photo' && capabilities.photo) void takePhoto();
      else if (startWith === 'type') input.current?.focus();
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWith]);

  const readiness = analyseState(text, attachments);
  const analyse = async () => {
    if (busy || readiness !== 'ready') return;
    setBusy(true);
    setFailure(null);
    try {
      const { caseId, caseRevision } = await ensureCase();
      const { jobId } = await api.createJob(caseId, { expectedRevision: caseRevision, operation: 'interpret', input: jobInput(text, attachments) });
      router.replace({ pathname: '/case/[caseId]/assistant', params: { caseId, jobId } });
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  const uploading = attachments.some((a) => a.state === 'uploading');
  const problem = Boolean(fileProblem || failure || (voice.message && voice.message.tone !== 'info') || attachments.some((a) => a.state === 'failed'));
  const orbMode: OrbMode = voice.phase !== 'idle' || uploading || busy ? 'active' : problem ? 'alert' : 'idle';
  const canAttachMore = attachments.length < MAX_ATTACHMENTS;
  const analyseLabel = busy ? 'Starting…' : readiness === 'waiting' ? 'Finishing upload…' : 'Analyse';

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          {capabilities.voice ? (
            <ToolButton
              label={voice.phase === 'recording' ? `Stop recording, ${voice.seconds} seconds` : 'Record a voice note'}
              onPress={voice.toggle}
              disabled={voice.busy}
              tone={voice.phase === 'recording' ? 'danger' : 'default'}
            >
              {voice.busy ? (
                <ActivityIndicator color={colors.primary} />
              ) : voice.phase === 'recording' ? (
                <Square size={18} color={colors.danger} fill={colors.danger} />
              ) : (
                <Mic size={22} color={colors.primary} />
              )}
            </ToolButton>
          ) : null}
          {capabilities.upload ? (
            <ToolButton label="Attach a PDF or image" onPress={() => void pickDocument()} disabled={!canAttachMore || voice.phase === 'recording'}>
              <Paperclip size={21} color={colors.primary} />
            </ToolButton>
          ) : null}
          {capabilities.photo ? (
            <ToolButton label="Take a photo of a document" onPress={() => void takePhoto()} disabled={!canAttachMore || voice.phase === 'recording'}>
              <Camera size={21} color={colors.primary} />
            </ToolButton>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button
              label={analyseLabel}
              onPress={analyse}
              loading={busy || readiness === 'waiting'}
              disabled={readiness === 'empty' || voice.phase !== 'idle'}
              accessibilityHint="Reads everything you added and shows what it understood before anything is used"
            />
          </View>
        </View>
      }
    >
      <View style={{ alignItems: 'center', gap: space(2), paddingTop: space(1) }}>
        <AgentOrb size={120} mode={orbMode} />
        <AppText variant="title" style={{ textAlign: 'center' }}>
          Tell me about your treatment
        </AppText>
        <AppText muted style={{ textAlign: 'center' }}>
          Speak, type or add a page. I’ll show you what I understood before anything is used.
        </AppText>
      </View>

      {voice.phase !== 'idle' ? (
        <StatusLine tone={voice.phase === 'recording' ? 'danger' : 'info'}>
          {voice.phase === 'recording'
            ? `Listening · ${voice.seconds}s of ${MAX_VOICE_SECONDS}s. Tap stop when you’re done.`
            : voice.phase === 'uploading'
              ? 'Sending your recording securely…'
              : 'Turning your words into text…'}
        </StatusLine>
      ) : null}
      {voice.message ? <Notice tone={voice.message.tone} title={voice.message.title} {...(voice.message.body ? { body: voice.message.body } : {})} /> : null}

      <View style={{ gap: space(2) }}>
        {isSample ? <Badge label="Sample data — fictional" tone="info" /> : null}
        <TextInput
          ref={input}
          accessibilityLabel="Describe your treatment and your plan"
          accessibilityHint="Write in your own words. Amounts, dates and what your plan pays are most useful."
          value={text}
          onChangeText={(next) => {
            setText(next.slice(0, MAX_TEXT_LENGTH));
            setIsSample(false);
          }}
          multiline
          textAlignVertical="top"
          placeholder="For example: My dentist recommends a crown for $1,000. My plan pays 50% for major services…"
          placeholderTextColor={colors.textMuted}
          style={{
            minHeight: 150,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: layout.radius,
            backgroundColor: colors.surface,
            color: colors.text,
            padding: space(4),
            fontFamily: fonts.regular,
            fontSize: 16,
            lineHeight: 23,
          }}
        />
        {text.length > MAX_TEXT_LENGTH - 500 ? (
          <AppText variant="caption" muted>
            {MAX_TEXT_LENGTH - text.length} characters left
          </AppText>
        ) : null}
      </View>

      {attachments.length > 0 ? (
        <View style={{ gap: space(2) }} accessibilityLabel={`${attachments.length} of ${MAX_ATTACHMENTS} pages added`}>
          {attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.localId}
              attachment={attachment}
              onRemove={() => setAttachments((list) => removeAttachment(list, attachment.localId))}
              onRetry={() => {
                setAttachments((list) => markRetrying(list, attachment.localId));
                void upload(attachment);
              }}
            />
          ))}
        </View>
      ) : null}
      {fileProblem ? <Notice tone="warning" title={fileProblem} /> : null}

      <View style={{ gap: space(1) }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showHints }}
          accessibilityLabel="What should I mention?"
          onPress={() => setShowHints((v) => !v)}
          style={{ minHeight: layout.minHitArea, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <AppText variant="label" color={colors.primary}>
            What should I mention?
          </AppText>
          {showHints ? <ChevronUp size={18} color={colors.primary} /> : <ChevronDown size={18} color={colors.primary} />}
        </Pressable>
        {showHints ? (
          <View style={{ gap: space(1.5), paddingBottom: space(1) }}>
            {WHAT_TO_MENTION.map((item) => (
              <AppText key={item} variant="caption" muted>
                •  {item}
              </AppText>
            ))}
            <AppText variant="caption" muted>
              Anything you leave out, I’ll ask about. Photos are for documents like estimates, not your teeth — one page each, up to {MAX_ATTACHMENTS}.
            </AppText>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use a sample description"
          onPress={() => {
            setText(SAMPLE_DESCRIPTION);
            setIsSample(true);
          }}
          style={{ minHeight: layout.minHitArea, justifyContent: 'center' }}
        >
          <AppText variant="label" color={colors.primary}>
            Use a sample description
          </AppText>
        </Pressable>
      </View>

      {failure ? <ErrorNotice error={failure} onRetry={analyse} /> : null}

      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        Demo: use made-up details — no names, member IDs or health history. I read plan and cost details only and never decide what treatment you need.
      </AppText>
    </Screen>
  );
}

function ToolButton({ label, onPress, disabled = false, tone = 'default', children }: { label: string; onPress: () => void; disabled?: boolean; tone?: 'default' | 'danger'; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: layout.minHitArea + 8,
        height: layout.minHitArea + 8,
        borderRadius: layout.radius,
        borderWidth: 1.5,
        borderColor: tone === 'danger' ? colors.danger : colors.border,
        backgroundColor: tone === 'danger' ? colors.dangerSoft : pressed ? colors.primarySoft : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

function StatusLine({ tone, children }: { tone: 'info' | 'danger'; children: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(2),
        padding: space(3),
        borderRadius: layout.radiusSmall,
        backgroundColor: tone === 'danger' ? colors.dangerSoft : colors.primarySoft,
      }}
    >
      {tone === 'danger' ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} /> : <ActivityIndicator size="small" color={colors.primary} />}
      <AppText variant="label" color={tone === 'danger' ? colors.danger : colors.primary} style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

function AttachmentRow({ attachment, onRemove, onRetry }: { attachment: Attachment; onRemove: () => void; onRetry: () => void }) {
  const { colors } = useTheme();
  const Icon = attachment.kind === 'photo' || attachment.mimeType.startsWith('image/') ? ImageIcon : FileText;
  const status = attachment.state === 'uploading' ? 'Uploading…' : attachment.state === 'ready' ? 'Ready' : (attachment.problem ?? 'Upload failed');
  return (
    <View
      accessibilityLabel={`${attachment.name}, ${status}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(3),
        paddingLeft: space(3),
        minHeight: layout.minHitArea + 12,
        borderRadius: layout.radiusSmall,
        borderWidth: 1,
        borderColor: attachment.state === 'failed' ? colors.danger : colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Icon size={20} color={attachment.state === 'failed' ? colors.danger : colors.primary} />
      <View style={{ flex: 1, paddingVertical: space(2) }}>
        <AppText variant="label" style={{ fontFamily: fonts.semibold }}>
          {attachment.name}
        </AppText>
        <AppText variant="caption" color={attachment.state === 'failed' ? colors.danger : colors.textMuted}>
          {status}
        </AppText>
      </View>
      {attachment.state === 'uploading' ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      {attachment.state === 'failed' ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Try uploading ${attachment.name} again`} onPress={onRetry} style={{ width: layout.minHitArea, height: layout.minHitArea, alignItems: 'center', justifyContent: 'center' }}>
          <RotateCcw size={18} color={colors.primary} />
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${attachment.name}`} onPress={onRemove} style={{ width: layout.minHitArea, height: layout.minHitArea, alignItems: 'center', justifyContent: 'center' }}>
        <X size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
