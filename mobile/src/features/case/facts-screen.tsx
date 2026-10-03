import { router, useLocalSearchParams } from 'expo-router';
import { Pencil } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { FactBadge, factSourceLabel } from '../../components/fact-badge';
import { ErrorState, LoadingState } from '../../components/states';
import { AppText, Badge, Button, Card, Screen } from '../../components/ui';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import { useCase } from './case-store';
import { buildFactGroups, isSampleCase, type FactRow } from './facts';

/**
 * "Here is what we'll use" (design v3 Facts review). Shows every value the calculation will use,
 * where it came from, and lets the user correct their own values before calculating.
 */
export function FactsScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { record, loading, error, reload } = useCase(caseId);

  if (loading) return <LoadingState label="Loading your details" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading your details" />;

  const groups = buildFactGroups(record);
  const missing = groups.flatMap((group) => group.rows).filter((row) => row.source === 'missing').length;

  return (
    <Screen
      footer={
        <>
          <Button label="Looks right — calculate estimates" onPress={() => router.push(`/case/${record.caseId}/results`)} />
          <AppText variant="caption" muted style={{ textAlign: 'center' }}>
            Calculating doesn’t save a plan or share anything.
          </AppText>
        </>
      }
    >
      {isSampleCase(record) ? <Badge label="Sample data" tone="neutral" /> : null}
      <View style={{ gap: space(2) }}>
        <AppText variant="title">Here is what we’ll use</AppText>
        <AppText muted>Check these before we calculate. Labels show where each detail came from.</AppText>
        {missing > 0 ? (
          <AppText variant="caption" muted>
            {missing === 1 ? 'One detail needs an answer.' : `${missing} details need an answer.`} We’ll still calculate what we can.
          </AppText>
        ) : null}
      </View>

      {groups.map((group) => (
        <View key={group.key} style={{ gap: space(2) }}>
          <AppText variant="heading">{group.title}</AppText>
          <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
            {group.rows.map((row, index) => (
              <FactRowView key={row.key} row={row} first={index === 0} caseId={record.caseId} />
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

function FactRowView({ row, first, caseId }: { row: FactRow; first: boolean; caseId: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space(3),
        paddingHorizontal: space(4),
        paddingVertical: space(3.5),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: space(1) }} accessible accessibilityLabel={`${row.label}: ${row.value}. ${factSourceLabel(row.source)}`}>
        <AppText variant="caption" muted>
          {row.label}
        </AppText>
        <AppText style={{ fontFamily: fonts.semibold }}>{row.value}</AppText>
        <FactBadge source={row.source} />
      </View>
      {row.editPath ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${row.label.toLowerCase()}`}
          onPress={() =>
            row.editPath === 'rules'
              ? router.push({ pathname: '/case/[caseId]/rules', params: { caseId } })
              : router.push({ pathname: '/case/[caseId]/edit', params: { caseId, field: row.editPath! } })
          }
          style={({ pressed }) => ({
            minHeight: layout.minHitArea,
            borderWidth: 1.5,
            borderColor: colors.border,
            borderRadius: layout.radiusSmall + 2,
            paddingHorizontal: space(3),
            flexDirection: 'row',
            alignItems: 'center',
            gap: space(1.5),
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Pencil size={14} color={colors.primary} />
          <AppText variant="label" color={colors.primary} style={{ fontFamily: fonts.semibold }}>
            {row.source === 'missing' ? 'Answer' : 'Edit'}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

