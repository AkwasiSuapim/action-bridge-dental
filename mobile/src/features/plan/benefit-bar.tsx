import { View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { AppText } from '../../components/ui';
import { formatCents } from '../../lib/format';
import { useTheme } from '../../theme/theme';
import { fonts, space } from '../../theme/tokens';
import type { YearBar } from './plan-model';

/**
 * One benefit year's annual maximum (design v3 benefit-year bar): paid so far (solid), projected
 * for this plan (hatched), left (empty), each repeated as a text row. One bar per year; years are
 * never added together.
 */
export function BenefitBar({ bar }: { bar: YearBar }) {
  const { colors } = useTheme();
  const scale = (cents: number) => (bar.maximumCents > 0 ? Math.min(1000, Math.max(0, (cents / bar.maximumCents) * 1000)) : 0);
  const paid = scale(bar.paidCents);
  const projected = Math.min(1000 - paid, scale(bar.projectedCents));
  const summary = `${bar.label} annual maximum ${formatCents(bar.maximumCents)}: ${formatCents(bar.paidCents)} paid so far, ${formatCents(bar.projectedCents)} projected for this plan, ${formatCents(bar.leftCents)} left.`;
  const hatchId = `hatch-${bar.planYearId}`;

  return (
    <View style={{ gap: space(2.5) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space(3) }}>
        <AppText variant="label" style={{ fontFamily: fonts.semibold }}>
          {bar.label} annual maximum
        </AppText>
        <AppText variant="caption" muted>
          {formatCents(bar.maximumCents)} · {bar.maximumSource}
        </AppText>
      </View>

      <View accessible accessibilityRole="image" accessibilityLabel={summary} style={{ height: 16, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        <Svg width="100%" height="100%" viewBox="0 0 1000 16" preserveAspectRatio="none">
          <Defs>
            <Pattern id={hatchId} width={16} height={16} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <Rect width={16} height={16} fill={colors.primarySoft} />
              <Rect width={7} height={16} fill={colors.projected} />
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={1000} height={16} fill={colors.surface} />
          <Rect x={0} y={0} width={paid} height={16} fill={colors.primary} />
          <Rect x={paid} y={0} width={projected} height={16} fill={`url(#${hatchId})`} />
        </Svg>
      </View>

      <View style={{ gap: space(1.5) }}>
        <Legend swatch="solid" label={bar.paidLabel} value={bar.paidCents} />
        <Legend swatch="hatched" label="Projected for this plan · estimated" value={bar.projectedCents} />
        <Legend swatch="empty" label="Left after this plan · estimated" value={bar.leftCents} strong />
      </View>
    </View>
  );
}

function Legend({ swatch, label, value, strong = false }: { swatch: 'solid' | 'hatched' | 'empty'; label: string; value: number; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
      <View
        aria-hidden
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          borderWidth: 1,
          borderColor: swatch === 'empty' ? colors.textMuted : swatch === 'solid' ? colors.primary : colors.projected,
          borderStyle: swatch === 'hatched' ? 'dashed' : 'solid',
          backgroundColor: swatch === 'solid' ? colors.primary : swatch === 'hatched' ? colors.projected : 'transparent',
        }}
      />
      <AppText variant="caption" muted style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="label" style={{ fontFamily: strong ? fonts.semibold : fonts.medium, fontVariant: ['tabular-nums'] }}>
        {formatCents(value)}
      </AppText>
    </View>
  );
}
