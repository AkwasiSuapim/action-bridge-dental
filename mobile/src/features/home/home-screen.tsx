import { router } from 'expo-router';
import { Camera, Keyboard, Mic, Upload, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { BrandLockup } from '../../components/brand';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice } from '../../components/states';
import { AppText, Badge, Card, Screen } from '../../components/ui';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { ThemeProvider, useTheme } from '../../theme/theme';
import { useFocusStatusBar } from '../../theme/status-bar';
import { fonts, layout, space } from '../../theme/tokens';
import { sampleCaseRequest } from '../intake/sample-case';

/**
 * Intake methods (design v3 "Home · multimodal start"). Voice, upload and photo need the job and
 * upload APIs, which do not exist yet, so they are shown as unavailable rather than simulated.
 * Typing is enabled once the manual-entry screen lands.
 */
const METHODS: { id: 'speak' | 'upload' | 'photo' | 'type'; label: string; Icon: LucideIcon; available: boolean }[] = [
  { id: 'speak', label: 'Speak', Icon: Mic, available: false },
  { id: 'upload', label: 'Upload', Icon: Upload, available: false },
  { id: 'photo', label: 'Take photo', Icon: Camera, available: false },
  { id: 'type', label: 'Type', Icon: Keyboard, available: false },
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
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);

  /** Creates the labeled synthetic case on the live API, then opens its facts review. */
  const trySample = async () => {
    if (starting) return;
    setStarting(true);
    setFailure(null);
    try {
      const { caseId } = await api.createCase(sampleCaseRequest());
      router.push(`/case/${caseId}/facts`);
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setStarting(false);
    }
  };
  const [speak, ...others] = METHODS;
  const anyUnavailable = METHODS.some((method) => !method.available);

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
        {speak ? <MethodButton method={speak} large /> : null}
        <View style={{ flexDirection: 'row', gap: space(3) }}>
          {others.map((method) => (
            <MethodButton key={method.id} method={method} />
          ))}
        </View>
        {anyUnavailable ? (
          <AppText variant="caption" muted>
            Speaking, uploading, photos and typing aren’t connected yet. Try the sample to see a live estimate.
          </AppText>
        ) : null}
        <AppText variant="caption" muted>
          Photos are for documents like estimates and statements, not your teeth.
        </AppText>
      </View>

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
        <Badge label="Sample data" tone="neutral" />
      </Pressable>
      {failure ? <ErrorNotice error={failure} onRetry={trySample} /> : null}

      <Card>
        <AppText variant="heading">How it works</AppText>
        {STEPS.map(([title, body], index) => (
          <View key={title} style={{ flexDirection: 'row', gap: space(3), alignItems: 'flex-start' }}>
            <View
              style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
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
      accessibilityLabel={available ? label : `${label}, not available yet`}
      accessibilityState={{ disabled: !available }}
      disabled={!available}
      onPress={() => undefined}
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
          Not available yet
        </AppText>
      )}
    </Pressable>
  );
}
