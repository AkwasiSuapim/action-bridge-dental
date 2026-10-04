import { TrendingDown } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { AppText, Badge } from '../../components/ui';
import { formatCents } from '../../lib/format';
import { useTheme } from '../../theme/theme';
import { fonts, space } from '../../theme/tokens';
import type { OptionCard } from './options-model';

/**
 * One timing option (design v3 scenario card). Selection is a radio choice, never an approval.
 * `fill` stretches the card to its column's height (side-by-side layout on tablets).
 */
export function ScenarioCard({ card, selected, onSelect, fill = false }: { card: OptionCard; selected: boolean; onSelect: () => void; fill?: boolean }) {
  const { colors } = useTheme();
  const summary = `${card.title}. ${card.timing}. You pay ${formatCents(card.youPayCents)}, estimated. Plan pays ${formatCents(card.planPaysCents)}.${
    card.lowest ? ' Lower estimated cost under these assumptions.' : ''
  }${card.conditional ? ' Assumes next year’s coverage is unchanged.' : ''}`;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={summary}
      onPress={onSelect}
      style={({ pressed }) => ({
        ...(fill ? { flex: 1 } : {}),
        gap: space(3.5),
        padding: space(4.5),
        borderRadius: 20,
        backgroundColor: colors.surface,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', gap: space(3), alignItems: 'flex-start' }}>
        <View
          style={{
            width: 22,
            height: 22,
            marginTop: 2,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: selected ? colors.primary : colors.textMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
        </View>
        <View style={{ flex: 1, gap: space(1) }}>
          <AppText style={{ fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 }}>{card.title}</AppText>
          <AppText variant="caption" muted>
            {card.timing}
          </AppText>
        </View>
      </View>

      <View style={{ gap: space(0.5) }}>
        <AppText variant="caption" muted>
          You pay · estimated · {card.span}
        </AppText>
        <AppText variant="money">{formatCents(card.youPayCents)}</AppText>
      </View>

      <View style={{ gap: space(1.5), paddingTop: space(3), borderTopWidth: 1, borderTopColor: colors.border }}>
        {card.years.length > 1
          ? card.years.map((year) => (
              <Line key={year.planYearId} label={`${year.label} · you pay / plan pays`} value={`${formatCents(year.youPayCents)} / ${formatCents(year.planPaysCents)}`} />
            ))
          : null}
        <Line label={`Plan pays · estimated · ${card.span}`} value={formatCents(card.planPaysCents)} />
      </View>

      {card.lowest ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
          <TrendingDown size={16} color={colors.primary} />
          <AppText variant="label" color={colors.primary} style={{ fontFamily: fonts.semibold }}>
            Lower estimated cost under these assumptions
          </AppText>
        </View>
      ) : null}
      {card.conditional ? <Badge label="Assumes next year’s coverage is unchanged" tone="warning" /> : null}
    </Pressable>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space(3) }}>
      <AppText variant="caption" muted style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="label" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </AppText>
    </View>
  );
}
