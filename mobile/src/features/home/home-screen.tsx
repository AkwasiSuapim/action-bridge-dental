import { router } from 'expo-router';
import { Camera, ChevronRight, Keyboard, Mic, Upload, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { BrandLockup } from '../../components/brand';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice } from '../../components/states';
import { AppText, Badge, Screen } from '../../components/ui';
import { capabilities } from '../../lib/capabilities';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { ThemeProvider, useTheme } from '../../theme/theme';
import { useFocusStatusBar } from '../../theme/status-bar';
import { fonts, layout, space } from '../../theme/tokens';
import { CaseCard } from '../activity/case-card';
import { useRecentCases } from '../activity/recent-cases';
import { useRefreshOnFocus } from '../activity/use-refresh-on-focus';
import { sampleCaseRequest } from '../intake/sample-case';

/**
 * Every way in opens the same composer, starting with what the user picked (switched on in
 * `lib/capabilities.ts`). Nothing is analysed until they tap Analyse there.
 */
const METHODS: { start: 'voice' | 'upload' | 'photo' | 'type'; label: string; hint: string; Icon: LucideIcon; available: boolean }[] = [
  { start: 'voice', label: 'Speak', hint: 'Starts recording. Tap stop when you’re done.', Icon: Mic, available: capabilities.voice && capabilities.assistant },
  { start: 'upload', label: 'Upload', hint: 'Add a PDF or image of your estimate or plan.', Icon: Upload, available: capabilities.upload && capabilities.assistant },
  { start: 'photo', label: 'Photo', hint: 'Photograph a document, not your teeth.', Icon: Camera, available: capabilities.photo && capabilities.assistant },
  { start: 'type', label: 'Type', hint: 'Write it in your own words.', Icon: Keyboard, available: capabilities.assistant },
];

const STEPS = [
  ['Tell me', 'Speak, type or add a page'],
  ['Check', 'Confirm what I found'],
  ['Compare', 'Costs by timing, then save'],
] as const;

export function HomeScreen() {
  useFocusStatusBar('light');
  return (
    <ThemeProvider scheme="dark">
      <HomeBody />
    </ThemeProvider>
  );
}

function HomeBody() {
  const { colors } = useTheme();
  const api = useApi();
  const { remember } = useRecentCases();
  const { items, summaries } = useRefreshOnFocus();
  const latest = items[0] ? summaries[items[0].caseId] : undefined;
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);

  /** Creates the labeled synthetic case on the live API, then opens its facts review. */
  const trySample = async () => {
    if (starting) return;
    setStarting(true);
    setFailure(null);
    try {
      const { caseId } = await api.createCase(sampleCaseRequest());
      await remember(caseId);
      router.push(`/case/${caseId}/facts`);
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setStarting(false);
    }
  };
  const [primary, ...others] = METHODS;

  return (
    <Screen headerless>
      <BrandLockup size={28} />

      <View style={{ alignItems: 'center' }}>
        <AgentOrb size={170} mode="idle" />
      </View>

      <View style={{ gap: space(3) }}>
        <AppText variant="display">Let’s make sense of your dental costs.</AppText>
        <AppText muted>Tell me about your treatment or add an estimate. I’ll ask only for what’s missing.</AppText>
      </View>

      <View style={{ gap: space(3) }}>
        {primary ? <MethodButton method={primary} large /> : null}
        <View style={{ flexDirection: 'row', gap: space(3) }}>
          {others.map((method) => (
            <MethodButton key={method.start} method={method} />
          ))}
        </View>
      </View>

      {latest?.status === 'ok' ? <CaseCard summary={latest.summary} label="Continue your plan" /> : null}

      <View>
        {capabilities.typing ? <QuietLink label="Prefer a form? Enter details step by step" onPress={() => router.push('/case/new')} /> : null}
        <QuietLink
          label={starting ? 'Starting the sample…' : 'Try a sample'}
          accessibilityLabel="Try a sample. Sample data."
          onPress={trySample}
          busy={starting}
          trailing={<Badge label="Sample data" tone="neutral" />}
        />
      </View>
      {failure ? <ErrorNotice error={failure} onRetry={trySample} /> : null}

      <View accessible accessibilityLabel="How it works: tell me, check what I found, then compare costs and save." style={{ flexDirection: 'row', gap: space(3) }}>
        {STEPS.map(([title, body], index) => (
          <View key={title} style={{ flex: 1, gap: space(1.5) }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <AppText variant="label" color={colors.primary} style={{ fontFamily: fonts.bold, fontSize: 13 }}>
                {String(index + 1)}
              </AppText>
            </View>
            <AppText variant="label" style={{ fontFamily: fonts.semibold }}>
              {title}
            </AppText>
            <AppText variant="caption" muted>
              {body}
            </AppText>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function MethodButton({ method, large = false }: { method: (typeof METHODS)[number]; large?: boolean }) {
  const { colors } = useTheme();
  const { Icon, label, available } = method;
  const foreground = large && available ? colors.onPrimary : available ? colors.text : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={available ? label : `${label}, coming soon`}
      accessibilityHint={available ? method.hint : undefined}
      accessibilityState={{ disabled: !available }}
      disabled={!available}
      onPress={() => router.push({ pathname: '/case/describe', params: { start: method.start } })}
      style={({ pressed }) => ({
        flex: large ? undefined : 1,
        minHeight: large ? layout.minHitArea + 20 : layout.minHitArea + 32,
        borderRadius: layout.radius,
        borderWidth: 1,
        borderColor: colors.border,
        borderStyle: available ? 'solid' : 'dashed',
        backgroundColor: large && available ? colors.primary : colors.surface,
        flexDirection: large ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space(2),
        padding: space(2),
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon size={large ? 24 : 20} color={foreground} />
      <AppText variant="label" color={foreground} style={{ fontFamily: fonts.semibold, textAlign: 'center', ...(large ? { fontSize: 17 } : {}) }}>
        {label}
      </AppText>
      {available ? null : (
        <AppText variant="caption" muted style={{ fontSize: 11, lineHeight: 14 }}>
          Coming soon
        </AppText>
      )}
    </Pressable>
  );
}

function QuietLink({ label, onPress, accessibilityLabel, busy = false, trailing }: { label: string; onPress: () => void; accessibilityLabel?: string; busy?: boolean; trailing?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: layout.minHitArea + 4, flexDirection: 'row', alignItems: 'center', gap: space(2), opacity: pressed ? 0.7 : 1 })}
    >
      {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      <AppText variant="label" color={colors.primary} style={{ fontFamily: fonts.semibold, flexShrink: 1 }}>
        {label}
      </AppText>
      {trailing}
      <View style={{ flex: 1 }} />
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}
