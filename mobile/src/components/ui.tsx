import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parseDollarsToCents } from '../lib/format';
import { useTheme } from '../theme/theme';
import { fonts, layout, space } from '../theme/tokens';

// ---- Layout -------------------------------------------------------------------------------

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const body = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, tone = 'default' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'default' | 'muted' | 'highlight' }) {
  const { colors } = useTheme();
  const background = tone === 'muted' ? colors.surfaceMuted : tone === 'highlight' ? colors.primarySoft : colors.surface;
  return <View style={[styles.card, { backgroundColor: background, borderColor: colors.border }, style]}>{children}</View>;
}

export function Gap({ size = 4 }: { size?: number }) {
  return <View style={{ height: space(size) }} />;
}

// ---- Text ---------------------------------------------------------------------------------

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'money';

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 38 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  money: { fontFamily: fonts.bold, fontSize: 36, lineHeight: 44, fontVariant: ['tabular-nums'] },
};

export function AppText({
  children,
  variant = 'body',
  muted = false,
  color,
  style,
  accessibilityRole,
}: {
  children: ReactNode;
  variant?: Variant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  accessibilityRole?: 'header' | 'text';
}) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole={accessibilityRole ?? (variant === 'title' || variant === 'display' || variant === 'heading' ? 'header' : 'text')}
      style={[variants[variant], { color: color ?? (muted ? colors.textMuted : colors.text) }, style]}
    >
      {children}
    </Text>
  );
}

// ---- Actions ------------------------------------------------------------------------------

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const background = variant === 'primary' ? colors.primary : variant === 'secondary' ? colors.surface : 'transparent';
  const foreground = variant === 'primary' ? colors.onPrimary : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: variant === 'secondary' ? colors.border : 'transparent',
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : icon}
      <Text style={[variants.label, { color: foreground, fontFamily: fonts.semibold, fontSize: 16 }]}>{label}</Text>
    </Pressable>
  );
}

// ---- Status -------------------------------------------------------------------------------

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

function toneColors(tone: Tone, colors: ReturnType<typeof useTheme>['colors']) {
  switch (tone) {
    case 'success':
      return { fg: colors.primary, bg: colors.primarySoft, Icon: CheckCircle2 };
    case 'warning':
      return { fg: colors.warning, bg: colors.warningSoft, Icon: AlertTriangle };
    case 'danger':
      return { fg: colors.danger, bg: colors.dangerSoft, Icon: XCircle };
    case 'info':
      return { fg: colors.primary, bg: colors.surfaceMuted, Icon: Info };
    default:
      return { fg: colors.textMuted, bg: colors.surfaceMuted, Icon: Info };
  }
}

/** Small status label. Meaning is always in the text; the icon and color only reinforce it. */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { colors } = useTheme();
  const { fg, bg, Icon } = toneColors(tone, colors);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]} accessible accessibilityLabel={label}>
      <Icon size={14} color={fg} />
      <Text style={[variants.caption, { color: fg, fontFamily: fonts.semibold }]}>{label}</Text>
    </View>
  );
}

export function Notice({ title, body, tone = 'info', children }: { title: string; body?: string; tone?: Tone; children?: ReactNode }) {
  const { colors } = useTheme();
  const { fg, bg, Icon } = toneColors(tone, colors);
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessible={!children} accessibilityRole="summary">
      <Icon size={20} color={fg} />
      <View style={{ flex: 1, gap: space(1) }}>
        <AppText variant="label" color={fg} style={{ fontFamily: fonts.semibold }}>
          {title}
        </AppText>
        {body ? <AppText variant="caption">{body}</AppText> : null}
        {children}
      </View>
    </View>
  );
}

// ---- Inputs -------------------------------------------------------------------------------

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType = 'default',
  secureTextEntry = false,
  autoComplete,
  helper,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  keyboardType?: 'default' | 'email-address' | 'decimal-pad' | 'numbers-and-punctuation';
  secureTextEntry?: boolean;
  autoComplete?: 'email' | 'password' | 'off';
  helper?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space(1) }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        {...(helper ? { accessibilityHint: helper } : {})}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete ?? 'off'}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border },
        ]}
      />
      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption" muted>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

/** Single choice with radio semantics. */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (id: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space(2) }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <AppText variant="label">{label}</AppText>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.id)}
              style={[
                styles.chip,
                { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface },
              ]}
            >
              <Text style={[variants.label, { color: selected ? colors.primary : colors.text, fontFamily: selected ? fonts.semibold : fonts.medium }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Currency input with an explicit "I don't know" route. Unknown is `null`, never 0.
 * `cents` is null while the text is empty, invalid or marked unknown.
 */
export function MoneyField({
  label,
  text,
  unknown,
  onChange,
  helper,
  allowUnknown = true,
}: {
  label: string;
  text: string;
  unknown: boolean;
  onChange: (next: { text: string; unknown: boolean }) => void;
  helper?: string;
  allowUnknown?: boolean;
}) {
  const { colors } = useTheme();
  const invalid = !unknown && text.trim() !== '' && parseDollarsToCents(text) === null;
  return (
    <View style={{ gap: space(2) }}>
      {unknown ? (
        <View style={{ gap: space(1) }}>
          <AppText variant="label">{label}</AppText>
          <AppText variant="caption" muted>
            Marked as unknown — we’ll ask for it only if the estimate needs it.
          </AppText>
        </View>
      ) : (
        <TextField
          label={label}
          value={text}
          onChangeText={(next) => onChange({ text: next, unknown })}
          placeholder="0.00"
          keyboardType="decimal-pad"
          error={invalid ? 'Enter dollars and cents, for example 1200.00' : null}
          {...(helper ? { helper } : {})}
        />
      )}
      {allowUnknown ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: unknown }}
          accessibilityLabel={`I don't know ${label}`}
          onPress={() => onChange({ text: unknown ? text : '', unknown: !unknown })}
          style={styles.unknownToggle}
        >
          <View style={[styles.checkbox, { borderColor: colors.primary, backgroundColor: unknown ? colors.primary : 'transparent' }]} />
          <AppText variant="caption">I don’t know</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Row({ label, value, strong = false, muted = false }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant={strong ? 'label' : 'caption'} muted={muted} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant={strong ? 'heading' : 'label'} muted={muted} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: { width: '100%', maxWidth: layout.maxContentWidth, padding: space(5), gap: space(4) },
  card: { borderRadius: layout.radius, borderWidth: StyleSheet.hairlineWidth, padding: space(4), gap: space(3) },
  button: {
    minHeight: layout.minHitArea + 8,
    borderRadius: layout.radius,
    borderWidth: 1,
    paddingHorizontal: space(5),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: space(1), alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: space(2.5), paddingVertical: space(1) },
  notice: { flexDirection: 'row', gap: space(3), borderRadius: layout.radiusSmall, padding: space(3.5) },
  input: { minHeight: layout.minHitArea + 4, borderWidth: 1, borderRadius: layout.radiusSmall, paddingHorizontal: space(3), fontFamily: fonts.regular, fontSize: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: { minHeight: layout.minHitArea, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: space(4), justifyContent: 'center' },
  unknownToggle: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: layout.minHitArea, alignSelf: 'flex-start' },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space(3), minHeight: 28 },
});
