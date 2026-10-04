import type { PlainSummary } from '@actionbridge/contracts';
import { View } from 'react-native';
import { space } from '../theme/tokens';
import { ListenButton } from './listen';
import { AppText, Card } from './ui';

/** The calculator's results in plain words, with a Listen button. */
export function MeaningCard({ summary, title = 'What this means for you' }: { summary: PlainSummary; title?: string }) {
  return (
    <Card tone="highlight">
      <AppText variant="heading">{title}</AppText>
      <View style={{ gap: space(2) }}>
        {summary.paragraphs.map((p) => (
          <AppText key={p}>{p}</AppText>
        ))}
      </View>
      <ListenButton text={summary.speech} />
    </Card>
  );
}
