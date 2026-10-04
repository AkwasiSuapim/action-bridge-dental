import { useMemo } from 'react';
import { dentalService } from '../../services/dental-service';
import { useDemo } from '../../state/demo-store';
export function useComparison() {
  const { state } = useDemo();
  return useMemo(() => {
    if (!state.input || state.comparedRevision !== state.input.caseRevision)
      return { comparison: null, error: null, scenarios: [] };
    try {
      const comparison = dentalService.compare(state.input);
      return {
        comparison,
        error: null,
        scenarios: [comparison.baseline, ...comparison.alternatives],
      };
    } catch (e) {
      return {
        comparison: null,
        error:
          e instanceof Error
            ? e.message
            : 'Review your details before comparing.',
        scenarios: [],
      };
    }
  }, [state.input, state.comparedRevision]);
}
