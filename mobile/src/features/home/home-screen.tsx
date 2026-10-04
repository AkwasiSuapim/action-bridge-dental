import { router } from 'expo-router';
import { Camera, Keyboard, MessageSquareText, Mic, Upload, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { BrandLockup } from '../../components/brand';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice } from '../../components/states';
import { AppText, Badge, Card, Screen } from '../../components/ui';
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

/** Intake methods (design v3 "Home · multimodal start"), switched on in `lib/capabilities.ts`. */
const METHODS: { id: 'describe' | 'speak' | 'upload' | 'photo' | 'type'; label: string; Icon: LucideIcon; available: boolean }[] = [
  { id: 'describe', label: 'Describe your situation', Icon: MessageSquareText, available: capabilities.assistant },
  { id: 'speak', label: 'Speak', Icon: Mic, available: capabilities.voice },
  { id: 'upload', label: 'Upload', Icon: Upload, available: capabilities.upload },
  { id: 'photo', label: 'Take photo', Icon: Camera, available: capabilities.photo },
  { id: 'type', label: 'Form', Icon: Keyboard, available: capabilities.typing },
];

const STEPS = [
  ['Add your information.', 'Speak, type, or add your estimate and benefits.'],
  ['Review what matters.', 'Confirm the details we found and answer what’s missing.'],
  ['Compare and save.', 'See estimated costs by timing and save the plan you choose.'],
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
        <AppText muted>Tell us about your treatment or add an estimate. We’ll ask only for what’s missing.</AppText>
      </View>

      <View style={{ gap: space(3) }}>
        {primary ? <MethodButton method={primary} large /> : null}
        <View style={{ flexDirection: 'row', gap: space(3) }}>
          {others.map((method) => (
            <MethodButton key={method.id} method={method} />
          ))}
        </View>
        {capabilities.photo ? (
          <AppText variant="caption" muted>
            Photos are for documents like estimates, not your teeth.
          </AppText>
        ) : null}
      </View>

      {latest?.status === 'ok' ? <CaseCard summary={latest.summary} label="Continue your plan" /> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try a sample. Sample data."
        accessibilityState={{ busy: starting }}
        disabled={starting}
        onPress={trySample}
        style={({ pressed }) => ({
          minHeight: layout.minHitArea + 8,
          borderRadius: layout.radius,
          borderWidth: 1.5,
          borderColor: colors.border,
          paddingHorizontal: space(5),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space(3),
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {starting ? <ActivityIndicator color={colors.primary} /> : null}
        <AppText variant="label" color={colors.primary} style={{ fontFamily: fonts.semibold, fontSize: 16 }}>
          {starting ? 'Starting the sample…' : 'Try a sample'}
        </AppText>
        <View>
          <Badge label="Sample data" tone="neutral" />
        </View>
      </Pressable>
      {failure ? <ErrorNotice error={failure} onRetry={trySample} /> : null}

      <Card>
        <AppText variant="heading">How it works</AppText>
        {STEPS.map(([title, body], index) => (
          <View key={title} style={{ flexDirection: 'row', gap: space(3), alignItems: 'flex-start' }}>
            <View
              style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}
              aria-hidden
            >
              <AppText variant="label" color={colors.primary} style={{ fontFamily: fonts.bold }}>
                {String(index + 1)}
              </AppText>
            </View>
            <AppText variant="caption" style={{ flex: 1 }}>
              <AppText variant="caption" style={{ fontFamily: fonts.semibold }}>
                {title}
              </AppText>{' '}
              <AppText variant="caption" muted>
                {body}
              </AppText>
            </AppText>
          </View>
        ))}
      </Card>
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
      accessibilityState={{ disabled: !available }}
      disabled={!available}
      onPress={() => {
        if (method.id === 'describe') router.push('/case/describe');
        if (method.id === 'speak' || method.id === 'upload' || method.id === 'photo') {
          router.push({ pathname: '/case/describe', params: { start: method.id === 'speak' ? 'voice' : method.id } });
        }
        if (method.id === 'type') router.push('/case/new');
      }}
      style={({ pressed }) => ({
        flex: large ? undefined : 1,
        minHeight: large ? layout.minHitArea + 12 : layout.minHitArea + 32,
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
      <Icon size={20} color={foreground} />
      <AppText variant="label" color={foreground} style={{ fontFamily: fonts.semibold, textAlign: 'center' }}>
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
