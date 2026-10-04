import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { AppText, Badge } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import type { CaseState, CaseSummary } from './summary';

const TONE: Record<CaseState, 'warning' | 'info' | 'success'> = { needs_info: 'warning', ready: 'info', saved: 'success', changed: 'warning' };

export function openCase(summary: CaseSummary) {
  router.push(`/case/${summary.caseId}/${summary.resume}`);
}

/** One case with its status (design v3 case card). Tapping resumes where it left off. */
export function CaseCard({ summary, label }: { summary: CaseSummary; label?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label ? `${label}. ` : ''}${summary.title}. ${summary.statusText}. ${summary.detail}.`}
      accessibilityHint={summary.cta}
      onPress={() => openCase(summary)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(3),
        padding: space(4),
        borderRadius: layout.radius,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <View style={{ flex: 1, gap: space(1.5) }}>
        {label ? (
          <AppText variant="caption" color={colors.primary} style={{ fontFamily: fonts.semibold }}>
            {label}
          </AppText>
        ) : null}
        <AppText style={{ fontFamily: fonts.semibold }}>{summary.title}</AppText>
        <Badge label={summary.statusText} tone={TONE[summary.state]} />
        <AppText variant="caption" muted>
          {summary.detail} · Updated {formatDateTime(summary.updatedAt)}
        </AppText>
      </View>
      <ChevronRight size={20} color={colors.textMuted} />
    </Pressable>
  );
}
