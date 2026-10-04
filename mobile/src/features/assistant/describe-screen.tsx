import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, FileUp } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice } from '../../components/states';
import { AppText, Badge, Button, Notice, Screen } from '../../components/ui';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { capabilities } from '../../lib/capabilities';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import { MAX_UPLOAD_BYTES, mimeTypeFor, uploadAndStart, type LocalFile } from './inputs';
import { VoiceRecorder } from './voice-recorder';

/** Sentence starters that show what is useful to mention, without a long form. */
const STARTERS = [
  'My dentist recommends ',
  'It will cost ',
  'My plan pays ',
  'My insurance already paid ',
  'My deductible is ',
  'The dentist said it can be done by ',
];

/** Explicitly fictional, matching the shared regression fixture. Always labeled as sample data. */
export const SAMPLE_DESCRIPTION = `I have dental insurance. My benefit year runs 2026-01-01 to 2026-12-31. The annual maximum is $800 and insurance already paid $500 this year. My deductible is $50 and I haven't met it yet.
The plan pays 80% for basic services and the deductible applies. It pays 50% for major services and the deductible applies.
My dentist recommends two fillings at $250 each and a crown at $1,000. The office is in network, and the allowed amounts equal the charges.
The fillings are planned for 2026-11-10 and 2026-11-11 and the crown for 2026-11-12.`;

const MAX_LENGTH = 8000;

/**
 * "Describe your situation" (doc 05 §3C): the user writes in their own words; the assistant
 * proposes what it understood and asks only for what is missing. Nothing is used until confirmed.
 */
export function DescribeScreen() {
  const api = useApi();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [isSample, setIsSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const { start: startWith } = useLocalSearchParams<{ start?: 'voice' | 'upload' | 'photo' }>();
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const created = useRef<Promise<{ caseId: string; caseRevision: number }> | null>(null);

  /** One case per visit, created on first use and reused by voice, documents and text. */
  const ensureCase = () => {
    created.current ??= api.createCase({ currency: 'USD', coverageMode: 'unknown', policy: null, planYears: {}, procedures: [] }).catch((error: unknown) => {
      created.current = null;
      throw error;
    });
    return created.current;
  };

  /** Documents and photos go straight to the assistant, which reads them and asks "Is this right?". */
  const analyzeFile = async (file: LocalFile) => {
    if (file.sizeBytes > MAX_UPLOAD_BYTES) {
      setFileProblem('That file is larger than 5 MB. Try a one-page PDF, or take a photo instead.');
      return;
    }
    setBusy(true);
    setFailure(null);
    setFileProblem(null);
    try {
      const { caseId, caseRevision } = await ensureCase();
      const jobId = await uploadAndStart(api, caseId, caseRevision, 'document', file);
      router.replace({ pathname: '/case/[caseId]/assistant', params: { caseId, jobId } });
    } catch (caught) {
      if (caught instanceof Error && !('code' in caught)) setFileProblem(caught.message);
      else setFailure(asApiError(caught));
    } finally {
      setBusy(false);
    }
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
    await analyzeFile({ uri: asset.uri, mimeType, sizeBytes: asset.size ?? 0 });
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
    await analyzeFile({ uri: asset.uri, mimeType: mimeTypeFor(asset.uri, asset.mimeType) ?? 'image/jpeg', sizeBytes: asset.fileSize ?? 0 });
  };

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    if (startWith === 'upload' && capabilities.upload) void pickDocument();
    if (startWith === 'photo' && capabilities.photo) void takePhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWith]);

  const add = (starter: string) => {
    setIsSample(false);
    setText((current) => (current.trim() === '' ? starter : `${current.trimEnd()}${/[.!?]$/.test(current.trim()) ? ' ' : '. '}${starter}`));
  };

  const start = async () => {
    if (busy || text.trim().length < 10) return;
    setBusy(true);
    setFailure(null);
    try {
      const { caseId, caseRevision } = await ensureCase();
      const { jobId } = await api.createJob(caseId, { expectedRevision: caseRevision, operation: 'interpret', input: { text: text.trim() } });
      router.replace({ pathname: '/case/[caseId]/assistant', params: { caseId, jobId } });
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button label={busy ? 'Starting…' : 'Show me what you understood'} onPress={start} loading={busy} disabled={text.trim().length < 10} />
          <Button label="Enter details step by step instead" variant="ghost" onPress={() => router.replace('/case/new')} />
        </>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
        <AgentOrb size={56} mode="idle" />
        <View style={{ flex: 1, gap: space(1) }}>
          <AppText variant="title">Tell me about your treatment</AppText>
          <AppText variant="caption" muted>
            In your own words. I’ll show you what I understood before anything is used.
          </AppText>
        </View>
      </View>

      {capabilities.voice ? (
        <VoiceRecorder
          ensureCase={ensureCase}
          onTranscript={(heard) => {
            setIsSample(false);
            setText((current) => (current.trim() ? `${current.trimEnd()}\n${heard}` : heard).slice(0, MAX_LENGTH));
          }}
        />
      ) : null}
      {startWith === 'voice' && !capabilities.voice ? <Notice tone="info" title="Voice notes are coming soon" body="For now, type below. It works the same way." /> : null}

      <View style={{ gap: space(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="label">What did your dentist recommend, and what do you know about your plan?</AppText>
        </View>
        {isSample ? <Badge label="Sample data — fictional" tone="info" /> : null}
        <TextInput
          accessibilityLabel="Describe your treatment and your plan"
          accessibilityHint="Write in your own words. Amounts, dates and what your plan pays are most useful."
          value={text}
          onChangeText={(next) => {
            setText(next.slice(0, MAX_LENGTH));
            setIsSample(false);
          }}
          multiline
          textAlignVertical="top"
          placeholder="For example: My dentist recommends a crown for $1,000. My plan pays 50% for major services…"
          placeholderTextColor={colors.textMuted}
          style={{
            minHeight: 180,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: layout.radiusSmall,
            backgroundColor: colors.surface,
            color: colors.text,
            padding: space(3),
            fontFamily: fonts.regular,
            fontSize: 16,
            lineHeight: 23,
          }}
        />
        <AppText variant="caption" muted>
          {text.length > MAX_LENGTH - 500 ? `${MAX_LENGTH - text.length} characters left` : 'Amounts, dates and what your plan pays help most. Anything you leave out, I’ll ask about.'}
        </AppText>
      </View>

      <View style={{ gap: space(2) }}>
        <AppText variant="label" muted>
          Not sure where to start? Tap to add:
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
          {STARTERS.map((starter) => (
            <Pressable
              key={starter}
              accessibilityRole="button"
              accessibilityLabel={`Add: ${starter.trim()}`}
              onPress={() => add(starter)}
              style={({ pressed }) => ({
                minHeight: layout.minHitArea,
                justifyContent: 'center',
                paddingHorizontal: space(3.5),
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.primarySoft : colors.surface,
              })}
            >
              <AppText variant="caption" style={{ fontFamily: fonts.medium }}>
                {starter.trim()}…
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>

      {capabilities.upload || capabilities.photo ? (
        <View style={{ gap: space(2) }}>
          <AppText variant="label" muted>
            Have the estimate or plan summary? Add one page:
          </AppText>
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            {capabilities.upload ? (
              <View style={{ flex: 1 }}>
                <Button label="Upload" variant="secondary" icon={<FileUp size={18} color={colors.primary} />} onPress={pickDocument} disabled={busy} />
              </View>
            ) : null}
            {capabilities.photo ? (
              <View style={{ flex: 1 }}>
                <Button label="Take photo" variant="secondary" icon={<Camera size={18} color={colors.primary} />} onPress={takePhoto} disabled={busy} />
              </View>
            ) : null}
          </View>
          <AppText variant="caption" muted>
            Photos are for documents like estimates, not your teeth. One page, up to 5 MB.
          </AppText>
          {fileProblem ? <Notice tone="warning" title={fileProblem} /> : null}
        </View>
      ) : null}

      <Button
        label="Use a sample description"
        variant="secondary"
        onPress={() => {
          setText(SAMPLE_DESCRIPTION);
          setIsSample(true);
        }}
      />

      {failure ? <ErrorNotice error={failure} onRetry={start} /> : null}

      <Notice
        tone="info"
        title="Use made-up details in this demo"
        body="Don’t include names, member IDs or health history. The assistant reads plan and cost details only; it never decides what treatment you need."
      />
    </Screen>
  );
}
