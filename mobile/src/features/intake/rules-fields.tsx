import { View } from 'react-native';
import { AppText, ChoiceChips, TextField } from '../../components/ui';
import { space } from '../../theme/tokens';
import { CATEGORIES, type Category, type DraftErrors, type RulesDraft, type YesNoUnknown } from './draft';

const YES_NO_UNKNOWN: { id: YesNoUnknown; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'unknown', label: 'Not sure' },
];

/** Coverage rules from the benefits summary: benefit-year start and, per service type, rate and deductible. */
export function RulesFields({
  rules,
  categories,
  showYearStart,
  errors,
  onChange,
}: {
  rules: RulesDraft;
  categories: Category[];
  showYearStart: boolean;
  errors: DraftErrors;
  onChange: (next: RulesDraft) => void;
}) {
  return (
    <View style={{ gap: space(4) }}>
      {showYearStart ? (
        <TextField
          label="Benefit year starts (YYYY-MM-DD)"
          value={rules.yearStart}
          onChangeText={(yearStart) => onChange({ ...rules, yearStart })}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          helper="Shown on your benefits summary."
          error={errors['rules.yearStart'] ?? null}
        />
      ) : null}

      {categories.length === 0 ? (
        <AppText variant="caption" muted>
          Add a procedure type above to enter its coverage.
        </AppText>
      ) : null}

      {categories.map((category) => {
        const meta = CATEGORIES.find((c) => c.id === category)!;
        return (
          <View key={category} style={{ gap: space(3) }}>
            <TextField
              label={`${meta.label} services: plan pays (%)`}
              value={rules.rates[category] ?? ''}
              onChangeText={(text) => onChange({ ...rules, rates: { ...rules.rates, [category]: text } })}
              keyboardType="decimal-pad"
              helper={meta.hint}
              error={errors[`rules.rates.${category}`] ?? null}
            />
            <ChoiceChips
              label={`Does the deductible apply to ${meta.label.toLowerCase()} services?`}
              options={YES_NO_UNKNOWN}
              value={rules.deductibleApplies[category] ?? null}
              onChange={(id) => onChange({ ...rules, deductibleApplies: { ...rules.deductibleApplies, [category]: id } })}
            />
          </View>
        );
      })}
      {categories.length > 0 ? (
        <AppText variant="caption" muted>
          Enter what your benefits summary says. We don’t check these with your insurer.
        </AppText>
      ) : null}
    </View>
  );
}
