import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, Eye, EyeOff, Info, XCircle } from 'lucide-react-native';
import { useState, type ReactNode, type Ref } from 'react';
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
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parseDollarsToCents } from '../lib/format';
import { useTheme } from '../theme/theme';
import { fonts, layout, space } from '../theme/tokens';

// ---- Layout -------------------------------------------------------------------------------

/**
 * `headerless` adds the top safe-area inset for screens shown without a navigation header.
 * `footer` stays pinned below the scrolling content, for the screen's main action.
 */
export function Screen({
  children,
  scroll = true,
  headerless = false,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  headerless?: boolean;
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  const body = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView edges={headerless ? ['top', 'bottom', 'left', 'right'] : ['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
      {footer ? (
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <View style={styles.footerInner}>{footer}</View>
        </View>
      ) : null}
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
  invalid = false,
  trailing,
  leading,
  hideLabel = false,
  inputRef,
  returnKeyType,
  onSubmitEditing,
  submitBehavior,
  textContentType,
  autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  keyboardType?: 'default' | 'email-address' | 'decimal-pad' | 'numbers-and-punctuation';
  secureTextEntry?: boolean;
  autoComplete?: 'email' | 'password' | 'current-password' | 'new-password' | 'off';
  helper?: string;
  /** Red border without a message under the field, e.g. when one alert above covers the whole form. */
  invalid?: boolean;
  /** A control inside the right edge of the input, such as a show-password toggle. */
  trailing?: ReactNode;
  /** A decorative icon inside the left edge of the input. */
  leading?: ReactNode;
  /** Keep the label for screen readers only; the placeholder carries it visually. */
  hideLabel?: boolean;
  inputRef?: Ref<TextInput>;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  submitBehavior?: TextInputProps['submitBehavior'];
  /** iOS autofill hint, e.g. `username` and `password` on sign-in. */
  textContentType?: TextInputProps['textContentType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space(1) }}>
      {hideLabel ? null : <AppText variant="label">{label}</AppText>}
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          {...(helper ? { accessibilityHint: helper } : {})}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete ?? 'off'}
          {...(textContentType ? { textContentType } : {})}
          {...(returnKeyType ? { returnKeyType } : {})}
          {...(submitBehavior ? { submitBehavior } : {})}
          {...(onSubmitEditing ? { onSubmitEditing } : {})}
          style={[
            styles.input,
            { color: colors.text, backgroundColor: colors.surface, borderColor: error || invalid ? colors.danger : colors.border },
            trailing ? { paddingRight: layout.minHitArea + space(2) } : null,
            leading ? { paddingLeft: space(11) } : null,
          ]}
        />
        {leading ? (
          <View aria-hidden style={styles.leading}>
            {leading}
          </View>
        ) : null}
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
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

/** Password input with a show/hide toggle; the toggle announces what it will do. */
export function PasswordField(props: Omit<Parameters<typeof TextField>[0], 'secureTextEntry' | 'trailing' | 'keyboardType'>) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <TextField
      {...props}
      secureTextEntry={!visible}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          onPress={() => setVisible((v) => !v)}
          hitSlop={4}
          style={styles.iconButton}
        >
          <Icon size={20} color={colors.textMuted} />
        </Pressable>
      }
    />
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

/** Full-width single choice (design v3 question options): radio, title and an optional one-line hint. */
export function RadioCards<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string; hint?: string }[];
  value: T | null;
  onChange: (id: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space(2.5) }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.hint ? `${option.label}. ${option.hint}` : option.label}
            onPress={() => onChange(option.id)}
            style={({ pressed }) => [
              styles.radioCard,
              { borderColor: selected ? colors.primary : colors.border, borderWidth: selected ? 2 : 1, backgroundColor: colors.surface, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.textMuted }]}>
              {selected ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
            </View>
            <View style={{ flex: 1, gap: space(0.5) }}>
              <AppText style={{ fontFamily: fonts.semibold }}>{option.label}</AppText>
              {option.hint ? (
                <AppText variant="caption" muted>
                  {option.hint}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
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
  const invalid = !unknown && text.trim() !== '' && parseDollarsToCents(text) === null;
  return (
    <View style={{ gap: space(2) }}>
      {unknown ? (
        <View style={{ gap: space(1) }}>
          <AppText variant="label">{label}</AppText>
          <AppText variant="caption" muted>
            Marked as unknown.
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
        <Checkbox label="I don’t know" accessibilityLabel={`I don't know ${label}`} checked={unknown} onChange={() => onChange({ text: unknown ? text : '', unknown: !unknown })} />
      ) : null}
    </View>
  );
}

/** A tickable box with its label; `boxed` draws it as a bordered card for consent-style choices. */
export function Checkbox({
  label,
  checked,
  onChange,
  boxed = false,
  accessibilityLabel,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  boxed?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => onChange(!checked)}
      style={[
        styles.unknownToggle,
        { gap: space(3) },
        boxed ? { alignSelf: 'stretch', padding: space(4), borderRadius: layout.radius, borderWidth: 1.5, borderColor: checked ? colors.primary : colors.border, backgroundColor: colors.surface } : null,
      ]}
    >
      <View style={[styles.checkbox, { borderColor: colors.primary, backgroundColor: checked ? colors.primary : 'transparent' }]}>
        {checked ? <Check size={14} color={colors.onPrimary} strokeWidth={3} /> : null}
      </View>
      <AppText variant="caption" style={{ flexShrink: 1 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** A heading and its content: the one way screens group related information. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space(2.5) }}>
      <AppText variant="heading">{title}</AppText>
      {children}
    </View>
  );
}

/** A collapsible card: a 44-point row that shows its content when opened. Closed by default. */
export function Disclosure({ title, children, initiallyOpen = false }: { title: string; children: ReactNode; initiallyOpen?: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: layout.minHitArea, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3) }}
      >
        <AppText variant="label" style={{ fontFamily: fonts.semibold, flex: 1 }}>
          {title}
        </AppText>
        <Icon size={20} color={colors.textMuted} />
      </Pressable>
      {open ? <View style={{ gap: space(2) }}>{children}</View> : null}
    </Card>
  );
}

/** The single "estimates only" line, shown once per screen at the end of its content. */
export function EstimateNote() {
  return (
    <AppText variant="caption" muted style={{ textAlign: 'center' }}>
      Estimates only. Your dentist and insurer decide final costs.
    </AppText>
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
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space(5), paddingTop: space(3), paddingBottom: space(2), alignItems: 'center' },
  footerInner: { width: '100%', maxWidth: layout.maxContentWidth, gap: space(2) },
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
  trailing: { position: 'absolute', right: space(1) },
  leading: { position: 'absolute', left: space(4), pointerEvents: 'none' },
  iconButton: { width: layout.minHitArea, height: layout.minHitArea, alignItems: 'center', justifyContent: 'center', borderRadius: layout.radiusSmall },
  radioCard: { minHeight: layout.minHitArea + 12, borderRadius: layout.radius, padding: space(4), flexDirection: 'row', alignItems: 'center', gap: space(3) },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: { minHeight: layout.minHitArea, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: space(4), justifyContent: 'center' },
  unknownToggle: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: layout.minHitArea, alignSelf: 'flex-start' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space(3), minHeight: 28 },
});
