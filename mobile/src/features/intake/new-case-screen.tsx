import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { ErrorNotice } from '../../components/states';
import { AppText, Button, Card, ChoiceChips, MoneyField, Notice, Screen, TextField } from '../../components/ui';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import {
  CATEGORIES,
  MAX_PROCEDURES,
  emptyDraft,
  emptyProcedure,
  toCreateCaseRequest,
  usedCategories,
  validateDraft,
  type CaseDraft,
  type DraftErrors,
  type MoneyDraft,
  type ProcedureDraft,
} from './draft';
import { useRecentCases } from '../activity/recent-cases';
import { RulesFields } from './rules-fields';

const COVERAGE_OPTIONS = [
  { id: 'insured', label: 'I have dental insurance' },
  { id: 'self_pay', label: 'I’ll pay myself' },
  { id: 'unknown', label: 'Not sure' },
] as const;

const NETWORK_OPTIONS = [
  { id: 'in', label: 'In network' },
  { id: 'out', label: 'Out of network' },
  { id: 'unknown', label: 'Not sure' },
] as const;

const PLAN_AMOUNTS: { field: 'annualMaximum' | 'deductible' | 'alreadyPaid' | 'deductibleMet'; label: string }[] = [
  { field: 'annualMaximum', label: 'Annual maximum' },
  { field: 'deductible', label: 'Annual deductible' },
  { field: 'alreadyPaid', label: 'Plan already paid this benefit year' },
  { field: 'deductibleMet', label: 'Deductible already met' },
];

/**
 * New estimate by typing (manual entry). Collects the treatment and the plan rules only the user
 * can supply up front; anything left empty is asked one question at a time afterwards.
 */
export function NewCaseScreen() {
  const api = useApi();
  const { remember } = useRecentCases();
  const [draft, setDraft] = useState<CaseDraft>(() => emptyDraft(randomUUID()));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (patch: Partial<CaseDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const updateProcedure = (key: string, patch: Partial<ProcedureDraft>) =>
    setDraft((current) => ({ ...current, procedures: current.procedures.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));

  const submit = async () => {
    if (busy) return;
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      AccessibilityInfo.announceForAccessibility('Some details need fixing. Check the highlighted fields.');
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const { caseId } = await api.createCase(toCreateCaseRequest(draft, { now: () => new Date(), newId: randomUUID }));
      await remember(caseId);
      router.replace(`/case/${caseId}/questions`);
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <Screen footer={<Button label="Continue" onPress={submit} loading={busy} />}>
      <View style={{ gap: space(2) }}>
        <AppText variant="title">Tell us about your treatment</AppText>
        <AppText muted>Add what you know. Leave anything else empty and we’ll ask for it next.</AppText>
      </View>

      {hasErrors ? <Notice tone="danger" title="Some details need fixing. Check the highlighted fields." /> : null}
      {failure ? <ErrorNotice error={failure} onRetry={submit} /> : null}

      <Section title="Coverage">
        <ChoiceChips
          label="Do you have dental insurance for this treatment?"
          options={[...COVERAGE_OPTIONS]}
          value={draft.coverage}
          onChange={(coverage) => update({ coverage })}
        />
        <FieldError message={errors.coverage} />
      </Section>

      <Section title="Treatment">
        {draft.procedures.map((procedure, index) => (
          <ProcedureCard
            key={procedure.key}
            procedure={procedure}
            index={index}
            errors={errors}
            canRemove={draft.procedures.length > 1}
            onChange={(patch) => updateProcedure(procedure.key, patch)}
            onRemove={() => update({ procedures: draft.procedures.filter((p) => p.key !== procedure.key) })}
          />
        ))}
        <FieldError message={errors.procedures} />
        {draft.procedures.length < MAX_PROCEDURES ? (
          <Button
            label="Add another procedure"
            variant="secondary"
            icon={<AddIcon />}
            onPress={() => update({ procedures: [...draft.procedures, emptyProcedure(randomUUID())] })}
          />
        ) : null}
      </Section>

      {draft.coverage === 'insured' ? (
        <Section title="Your plan">
          <RulesFields
            rules={draft.rules}
            categories={usedCategories(draft.procedures)}
            showYearStart
            errors={errors}
            onChange={(rules) => update({ rules })}
          />
          {PLAN_AMOUNTS.map(({ field, label }) => (
            <PlanAmount key={field} label={label} value={draft[field]} error={errors[`money.${field}`]} onChange={(value) => update({ [field]: value })} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space(3) }}>
      <AppText variant="heading">{title}</AppText>
      {children}
    </View>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  const { colors } = useTheme();
  return message ? (
    <AppText variant="caption" color={colors.danger}>
      {message}
    </AppText>
  ) : null;
}

function AddIcon() {
  const { colors } = useTheme();
  return <Plus size={18} color={colors.primary} />;
}

function PlanAmount({ label, value, error, onChange }: { label: string; value: MoneyDraft; error: string | undefined; onChange: (value: MoneyDraft) => void }) {
  return (
    <View style={{ gap: space(1) }}>
      <MoneyField label={label} text={value.text} unknown={value.unknown} onChange={onChange} />
      <FieldError message={error} />
    </View>
  );
}

function ProcedureCard({
  procedure,
  index,
  errors,
  canRemove,
  onChange,
  onRemove,
}: {
  procedure: ProcedureDraft;
  index: number;
  errors: DraftErrors;
  canRemove: boolean;
  onChange: (patch: Partial<ProcedureDraft>) => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const at = `procedures.${index}`;
  const name = procedure.label.trim() || `Procedure ${index + 1}`;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="label" muted style={{ fontFamily: fonts.semibold }}>
          {`Procedure ${index + 1}`}
        </AppText>
        {canRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${name}`}
            onPress={onRemove}
            style={{ width: layout.minHitArea, height: layout.minHitArea, alignItems: 'center', justifyContent: 'center', marginRight: -space(2) }}
          >
            <Trash2 size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <TextField
        label="Name"
        value={procedure.label}
        onChangeText={(label) => onChange({ label })}
        placeholder="For example, Crown"
        autoCapitalize="sentences"
        error={errors[`${at}.label`] ?? null}
      />
      <ChoiceChips
        label="Type"
        options={CATEGORIES.map((c) => ({ id: c.id, label: `${c.label} · ${c.hint}` }))}
        value={procedure.category}
        onChange={(category) => onChange({ category })}
      />
      <FieldError message={errors[`${at}.category`]} />
      <MoneyField label="Dentist’s charge" text={procedure.charge.text} unknown={procedure.charge.unknown} onChange={(charge) => onChange({ charge })} />
      <FieldError message={errors[`${at}.charge`]} />
      <ChoiceChips label="Is the dentist in your plan’s network?" options={[...NETWORK_OPTIONS]} value={procedure.network} onChange={(network) => onChange({ network })} />
      <TextField
        label="Planned date (YYYY-MM-DD)"
        value={procedure.date}
        onChangeText={(date) => onChange({ date })}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        error={errors[`${at}.date`] ?? null}
      />
    </Card>
  );
}
