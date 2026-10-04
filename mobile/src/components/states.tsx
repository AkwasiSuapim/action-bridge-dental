import { View } from 'react-native';
import type { ApiError } from '../services/api';
import { space } from '../theme/tokens';
import { AgentOrb } from './orb';
import { AppText, Button, Notice, Screen } from './ui';

/** Full-screen loading state with the agent orb and a spoken label; no fake progress. */
export function LoadingState({ label }: { label: string }) {
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(3) }} accessible accessibilityLabel={label}>
        <AgentOrb size={72} mode="active" />
        <AppText muted>{label}</AppText>
      </View>
    </Screen>
  );
}

/** An API failure with its support reference and a retry. Never replaced by sample data. */
export function ErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <Notice tone={error.options.retryable ? 'warning' : 'danger'} title={error.message} {...(error.options.requestId ? { body: `Reference: ${error.options.requestId}` } : {})}>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </Notice>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <Screen>
      <ErrorNotice error={error} onRetry={onRetry} />
    </Screen>
  );
}
