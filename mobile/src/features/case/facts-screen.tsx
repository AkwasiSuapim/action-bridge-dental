import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, ChevronDown, ChevronUp, Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { FactBadge, factSourceLabel } from '../../components/fact-badge';
import { ErrorState, LoadingState } from '../../components/states';
import { AppText, Badge, Button, Card, Screen, Section } from '../../components/ui';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import { useCase } from './case-store';
import { buildFactGroups, isSampleCase, type FactGroup, type FactRow } from './facts';

/**
 * "Here is what we'll use" (design v3 Facts review): one line per procedure (tap for detail),
 * coverage and benefit years. A sample case is labeled once; rows only carry a source label
 * when it differs from that.
 */
export function FactsScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { record, loading, error, reload } = useCase(caseId);

  if (loading) return <LoadingState label="Loading your details" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading your details" />;

  const sample = isSampleCase(record);
  const groups = buildFactGroups(record);
  const procedures = groups.filter((group) => group.key.startsWith('procedures.'));
  const others = groups.filter((group) => !group.key.startsWith('procedures.'));
  const missing = groups.flatMap((group) => group.rows).filter((row) => row.source === 'missing' && row.editPath).length;

  return (
    <Screen footer={<Button label="Looks right — calculate estimates" onPress={() => router.push(`/case/${record.caseId}/options`)} />}>
      {sample ? <Badge label="Sample data" tone="neutral" /> : null}
      <View style={{ gap: space(2) }}>
        <AppText variant="title">Here is what we’ll use</AppText>
        <AppText muted>Check these before we calculate.</AppText>
        {missing > 0 ? <Badge label={missing === 1 ? 'One detail needs an answer' : `${missing} details need an answer`} tone="warning" /> : null}
      </View>

      <Section title="Treatment">
        <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          {procedures.map((group, index) => (
            <ProcedureRow key={group.key} group={group} first={index === 0} caseId={record.caseId} sample={sample} />
          ))}
        </Card>
      </Section>

      {others.map((group) => (
        <Section key={group.key} title={group.title}>
          <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
            {group.summary ? (
              <ProcedureRow group={group} first caseId={record.caseId} sample={sample} />
            ) : (
              group.rows.map((row, index) => <FactRowView key={row.key} row={row} first={index === 0} caseId={record.caseId} sample={sample} />)
            )}
          </Card>
        </Section>
      ))}
    </Screen>
  );
}

/** A collapsible group (a procedure, or an assumed benefit year): summary line, expanded automatically when something needs an answer. */
function ProcedureRow({ group, first, caseId, sample }: { group: FactGroup; first: boolean; caseId: string; sample: boolean }) {
  const { colors } = useTheme();
  const summary = group.summary!;
  const [open, setOpen] = useState(summary.needsAnswer);
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${group.title}: ${summary.value}. ${summary.detail}.${summary.needsAnswer ? ' Needs an answer.' : ''}`}
        onPress={() => setOpen((value) => !value)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3.5), minHeight: layout.minHitArea + 16 }}
      >
        <View style={{ flex: 1, gap: space(1) }}>
          {group.key.startsWith('procedures.') ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
              <AppText style={{ fontFamily: fonts.bold }}>{group.title}</AppText>
              {summary.needsAnswer ? <AlertTriangle size={15} color={colors.warning} /> : null}
            </View>
          ) : null}
          <AppText style={{ fontFamily: fonts.semibold }}>{summary.value}</AppText>
          <AppText variant="caption" muted>
            {summary.detail}
          </AppText>
          {summary.source ? <FactBadge source={summary.source} /> : null}
        </View>
        <Icon size={20} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={{ backgroundColor: colors.surfaceMuted }}>
          {group.rows.map((row) => (
            <FactRowView key={row.key} row={row} first={false} caseId={caseId} sample={sample} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FactRowView({ row, first, caseId, sample }: { row: FactRow; first: boolean; caseId: string; sample: boolean }) {
  const { colors } = useTheme();
  // The page already says "Sample data"; repeat a source only when it differs from that.
  const showBadge = !(sample && row.source === 'sample');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(3),
        paddingHorizontal: space(4),
        paddingVertical: space(3),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: space(1) }} accessible accessibilityLabel={`${row.label}: ${row.value}. ${factSourceLabel(row.source)}`}>
        <AppText variant="caption" muted>
          {row.label}
        </AppText>
        <AppText style={{ fontFamily: fonts.semibold }}>{row.value}</AppText>
        {showBadge ? <FactBadge source={row.source} /> : null}
      </View>
      {row.editPath ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${row.source === 'missing' ? 'Answer' : 'Edit'} ${row.label.toLowerCase()}`}
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
            backgroundColor: colors.surface,
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
