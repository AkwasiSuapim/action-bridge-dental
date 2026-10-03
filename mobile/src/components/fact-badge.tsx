import { AlertTriangle, Calculator, FileText, FlaskConical, HelpCircle, Mic, Sparkles, User, type LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';
import type { FactSource } from '../features/case/facts';
import { useTheme } from '../theme/theme';
import { fonts, space } from '../theme/tokens';

/**
 * Where a value came from (design v3 source labels). Always icon + text; "Assumed" uses a dashed
 * outline so it reads differently without relying on color.
 */
const LABELS: Record<FactSource, { text: string; Icon: LucideIcon }> = {
  sample: { text: 'Sample data', Icon: FlaskConical },
  user: { text: 'Provided by you', Icon: User },
  document: { text: 'From your document', Icon: FileText },
  voice: { text: 'From your voice note', Icon: Mic },
  proposed: { text: 'Needs confirmation', Icon: Sparkles },
  assumed: { text: 'Assumed for comparison', Icon: HelpCircle },
  missing: { text: 'Needs an answer', Icon: AlertTriangle },
};

export function FactBadge({ source }: { source: FactSource | 'estimated' }) {
  const { colors } = useTheme();
  const { text, Icon } = source === 'estimated' ? { text: 'Estimated', Icon: Calculator } : LABELS[source];
  const warn = source === 'missing' || source === 'proposed';
  const fg = warn ? colors.warning : source === 'document' || source === 'voice' ? colors.primary : colors.textMuted;
  const bg = warn ? colors.warningSoft : source === 'assumed' ? 'transparent' : source === 'document' || source === 'voice' ? colors.primarySoft : colors.surfaceMuted;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(1),
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: space(2),
        paddingVertical: 2,
        backgroundColor: bg,
        borderWidth: source === 'assumed' ? 1 : 0,
        borderStyle: 'dashed',
        borderColor: colors.textMuted,
      }}
    >
      <Icon size={12} color={fg} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: fg }}>{text}</Text>
    </View>
  );
}

export function factSourceLabel(source: FactSource): string {
  return LABELS[source].text;
}
