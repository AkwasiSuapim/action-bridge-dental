import type { AgentJobView, EstimateResult, MissingFieldBlock, ScenarioComparisonResult, UiBlock } from '@actionbridge/contracts';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Circle, ClipboardCopy, MinusCircle, XCircle } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice, LoadingState } from '../../components/states';
import { AppText, Badge, Button, Card, MoneyField, Notice, RadioCards, Row, Screen, TextField } from '../../components/ui';
import { formatCents } from '../../lib/format';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import { buildAnswers, initialDrafts, questionsOf, type Draft, type Drafts } from './answers';
import { useJob } from './use-job';

/**
 * Assistant workspace (design v3 agent workspace + doc 05 adaptive loop). Renders only
 * server-validated UI blocks with app-owned components: real stage events while working, "here
 * is what I understood" confirmations, grouped questions, and calculator results.
 */
export function AssistantScreen() {
  const { caseId, jobId } = useLocalSearchParams<{ caseId: string; jobId: string }>();
  const { job, error, timedOut, refresh } = useJob(jobId);
  const api = useApi();
  const [actionError, setActionError] = useState<ApiError | null>(null);

  if (!caseId || !jobId) return <LoadingState label="Opening the assistant" />;
  if (error) {
    return (
      <Screen>
        <ErrorNotice error={error} onRetry={refresh} />
      </Screen>
    );
  }
  if (!job) return <LoadingState label="Opening the assistant" />;

  const cancel = async () => {
    try {
      await api.cancelJob(job.jobId);
      router.back();
    } catch (caught) {
      setActionError(asApiError(caught));
    }
  };

  if (job.status === 'queued' || job.status === 'running') {
    return <Working job={job} timedOut={timedOut} onCancel={cancel} onRefresh={refresh} actionError={actionError} />;
  }
  if (job.status === 'needs_information') {
    return <Step key={job.jobId} job={job} caseId={caseId} />;
  }
  if (job.status === 'completed') return <Finished job={job} caseId={caseId} />;
  if (job.status === 'cancelled') {
    return (
      <Screen footer={<Button label="Back to home" onPress={() => router.replace('/')} />}>
        <Notice tone="info" title="You stopped the assistant" body="Nothing was changed. You can start again any time." />
      </Screen>
    );
  }
  return <Failed job={job} caseId={caseId} onRetried={refresh} />;
}

// ---- Working: real stages only, no fake progress ----------------------------------------------

const STAGE_LABEL: Record<string, string> = {
  reading_input: 'Reading what you shared',
  checking_missing_facts: 'Checking what’s still needed',
  retrieving_evidence: 'Finding the supporting details',
  calculating_costs: 'Calculating with your plan’s rules',
  comparing_dates: 'Comparing permitted dates',
  preparing_explanation: 'Preparing what to show you',
  analyzing: 'Analyzing',
};

function Working({ job, timedOut, onCancel, onRefresh, actionError }: { job: AgentJobView; timedOut: boolean; onCancel: () => void; onRefresh: () => void; actionError: ApiError | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - new Date(job.createdAt).getTime()) / 1000));

  return (
    <Screen footer={<Button label="Stop" variant="ghost" onPress={onCancel} />}>
      <View style={{ alignItems: 'center', gap: space(3), paddingTop: space(4) }}>
        <AgentOrb size={130} mode="active" />
        <AppText variant="title" style={{ textAlign: 'center' }}>
          Working on it
        </AppText>
        <AppText variant="caption" muted accessibilityRole="text">
          {seconds < 2 ? 'Just started' : `${seconds} seconds`} · your case is unchanged until you confirm
        </AppText>
      </View>
      <StageList job={job} />
      {timedOut ? (
        <Notice tone="warning" title="This is taking longer than usual" body="Your input is safe. Check again, or stop and enter the details step by step.">
          <Button label="Check again" variant="secondary" onPress={onRefresh} />
        </Notice>
      ) : null}
      {actionError ? <ErrorNotice error={actionError} /> : null}
    </Screen>
  );
}

function StageList({ job }: { job: AgentJobView }) {
  const { colors } = useTheme();
  // Show the latest status per stage, in the order stages first appeared.
  const stages = useMemo(() => {
    const latest = new Map<string, AgentJobView['events'][number]>();
    for (const event of job.events) latest.set(event.stage, event);
    return [...latest.values()];
  }, [job.events]);
  if (stages.length === 0) {
    return (
      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        Waiting to start…
      </AppText>
    );
  }
  return (
    <Card>
      {stages.map((event) => {
        const Icon = event.status === 'completed' ? CheckCircle2 : event.status === 'failed' ? XCircle : event.status === 'skipped' ? MinusCircle : Circle;
        const tint = event.status === 'completed' ? colors.primary : event.status === 'failed' ? colors.danger : colors.textMuted;
        return (
          <View key={event.stage} style={{ flexDirection: 'row', gap: space(3), alignItems: 'flex-start' }} accessible accessibilityLabel={`${STAGE_LABEL[event.stage] ?? event.stage}: ${event.status}. ${event.summary}`}>
            <Icon size={20} color={tint} />
            <View style={{ flex: 1 }}>
              <AppText variant="label">{STAGE_LABEL[event.stage] ?? event.stage}</AppText>
              <AppText variant="caption" muted>
                {event.summary}
              </AppText>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

// ---- A step that needs the user ----------------------------------------------------------------

function Step({ job, caseId }: { job: AgentJobView; caseId: string }) {
  const api = useApi();
  const questions = questionsOf(job.questions);
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(questions));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const confirmations = questions.filter((q) => q.inputType === 'fact_review');
  const asks = questions.filter((q) => q.inputType !== 'fact_review');
  const notices = (job.questions?.blocks ?? []).filter((b): b is Extract<UiBlock, { type: 'notice' }> => b.type === 'notice');

  const set = (questionId: string, draft: Draft) => {
    setDrafts((current) => ({ ...current, [questionId]: draft }));
    setProblems((current) => {
      const { [questionId]: _cleared, ...rest } = current;
      return rest;
    });
  };

  const submit = async () => {
    if (busy) return;
    const built = buildAnswers(questions, drafts, job.caseRevision);
    if (!built.ok) {
      setProblems(Object.fromEntries(built.problems.map((p) => [p.questionId, p.message])));
      AccessibilityInfo.announceForAccessibility(`${built.problems.length} ${built.problems.length === 1 ? 'answer needs' : 'answers need'} attention.`);
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const { jobId } = await api.answerJob(job.jobId, built.request);
      router.setParams({ jobId });
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  const declined = confirmations.filter((q) => drafts[q.questionId]?.kind === 'confirm' && (drafts[q.questionId] as { value: boolean }).value === false).length;
  const cta = confirmations.length > 0 && asks.length === 0 ? (declined > 0 ? 'Use the rest and continue' : 'Looks right — continue') : 'Continue';

  return (
    <Screen
      footer={
        <>
          <Button label={cta} onPress={submit} loading={busy} />
          <Button label="Finish later" variant="ghost" onPress={() => router.replace({ pathname: '/case/[caseId]/facts', params: { caseId } })} />
        </>
      }
    >
      {notices.map((n) => (
        <AssistantMessage key={n.id} title={n.title} body={n.body} />
      ))}

      {confirmations.length > 0 ? (
        <View style={{ gap: space(3) }}>
          <AppText variant="heading">Here’s what I understood</AppText>
          <AppText variant="caption" muted>
            Tap “Not right” on anything that’s wrong — I’ll leave it out and you can add it yourself.
          </AppText>
          {confirmations.map((q) => (
            <UnderstoodCard key={q.questionId} block={q} draft={drafts[q.questionId]} onChange={(d) => set(q.questionId, d)} />
          ))}
        </View>
      ) : null}

      {asks.map((q) => (
        <QuestionCard key={q.questionId} block={q} draft={drafts[q.questionId]} problem={problems[q.questionId]} onChange={(d) => set(q.questionId, d)} />
      ))}

      {failure ? <ErrorNotice error={failure} onRetry={submit} /> : null}
    </Screen>
  );
}

function AssistantMessage({ title, body }: { title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space(3), alignItems: 'flex-start' }} accessible accessibilityLabel={`Assistant: ${title}. ${body}`}>
      <AgentOrb size={40} mode="idle" />
      <View style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: layout.radius, borderTopLeftRadius: 4, padding: space(3.5), gap: space(1) }}>
        <AppText variant="label" style={{ fontFamily: fonts.semibold }}>
          {title}
        </AppText>
        {body ? (
          <AppText variant="caption" muted>
            {body}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function UnderstoodCard({ block, draft, onChange }: { block: MissingFieldBlock; draft: Draft | undefined; onChange: (d: Draft) => void }) {
  const { colors } = useTheme();
  const accepted = draft?.kind === 'confirm' ? draft.value : true;
  const fromDocument = block.reason.startsWith('From your document');
  const quote = block.reason.replace(/^From your (description|document):\s*/, '');
  const option = (value: boolean, label: string) => {
    const selected = accepted === value;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
        onPress={() => onChange({ kind: 'confirm', value })}
        style={{
          flex: 1,
          minHeight: layout.minHitArea,
          borderRadius: 999,
          borderWidth: 1.5,
          alignItems: 'center',
          justifyContent: 'center',
          borderColor: selected ? (value ? colors.primary : colors.danger) : colors.border,
          backgroundColor: selected ? (value ? colors.primarySoft : colors.dangerSoft) : colors.surface,
        }}
      >
        <AppText variant="label" color={selected ? (value ? colors.primary : colors.danger) : colors.text} style={{ fontFamily: fonts.semibold }}>
          {label}
        </AppText>
      </Pressable>
    );
  };
  return (
    <Card tone={accepted ? 'default' : 'muted'}>
      <AppText variant="caption" muted>
        {block.label.replace(/^Is this right\?\s*/, '')}
      </AppText>
      <AppText variant="body" style={{ fontFamily: fonts.semibold, opacity: accepted ? 1 : 0.6 }}>
        {String(block.candidateValue ?? '')}
      </AppText>
      <AppText variant="caption" muted style={{ fontStyle: 'italic' }}>
        {fromDocument ? 'From the document' : 'From your words'}: {quote}
      </AppText>
      <View style={{ flexDirection: 'row', gap: space(2) }} accessibilityRole="radiogroup" accessibilityLabel={`Is this right? ${String(block.candidateValue ?? '')}`}>
        {option(true, 'Yes')}
        {option(false, 'Not right')}
      </View>
    </Card>
  );
}

function QuestionCard({ block, draft, problem, onChange }: { block: MissingFieldBlock; draft: Draft | undefined; problem: string | undefined; onChange: (d: Draft) => void }) {
  const unknown = draft?.kind === 'unknown';
  return (
    <Card>
      <AppText variant="heading">{block.label}</AppText>
      <AppText variant="caption" muted>
        {block.reason}
      </AppText>
      {block.inputType === 'single_select' ? (
        <>
          <RadioCards
            label={block.label}
            options={block.options.map((o) => ({ id: o.id, label: o.label }))}
            value={draft?.kind === 'choice' ? draft.optionId : null}
            onChange={(id) => onChange({ kind: 'choice', optionId: id })}
          />
          {block.allowUnknown ? <Button label={unknown ? '✓ I don’t know' : 'I don’t know'} variant={unknown ? 'secondary' : 'ghost'} onPress={() => onChange({ kind: 'unknown' })} /> : null}
        </>
      ) : null}
      {block.inputType === 'currency' ? (
        <MoneyField
          label="Amount in US dollars"
          text={draft?.kind === 'text' ? draft.text : ''}
          unknown={unknown}
          onChange={(next) => onChange(next.unknown ? { kind: 'unknown' } : { kind: 'text', text: next.text })}
        />
      ) : null}
      {block.inputType === 'date' ? (
        <>
          <TextField
            label="Date (YYYY-MM-DD)"
            value={draft?.kind === 'text' ? draft.text : ''}
            onChangeText={(text) => onChange({ kind: 'text', text })}
            placeholder="2026-11-12"
            keyboardType="numbers-and-punctuation"
          />
          <Button label={unknown ? '✓ I don’t know' : 'I don’t know'} variant={unknown ? 'secondary' : 'ghost'} onPress={() => onChange({ kind: 'unknown' })} />
        </>
      ) : null}
      {problem ? <Notice tone="danger" title={problem} /> : null}
    </Card>
  );
}

// ---- Finished ----------------------------------------------------------------------------------

function Finished({ job, caseId }: { job: AgentJobView; caseId: string }) {
  const blocks = job.resultBlocks?.blocks ?? [];
  const hasEstimate = blocks.some((b) => b.type === 'cost_summary');
  const notices = blocks.filter((b): b is Extract<UiBlock, { type: 'notice' }> => b.type === 'notice');
  const nextStep = blocks.find((b): b is Extract<UiBlock, { type: 'next_step' }> => b.type === 'next_step');

  return (
    <Screen
      footer={
        <>
          {hasEstimate ? (
            <Button label="See your options" onPress={() => router.replace({ pathname: '/case/[caseId]/options', params: { caseId } })} />
          ) : (
            <Button label="Check your details" onPress={() => router.replace({ pathname: '/case/[caseId]/facts', params: { caseId } })} />
          )}
          <Button label="Back to home" variant="ghost" onPress={() => router.replace('/')} />
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: space(2), paddingTop: space(2) }}>
        <AgentOrb size={96} mode={hasEstimate ? 'success' : 'alert'} />
        <AppText variant="title" style={{ textAlign: 'center' }}>
          {hasEstimate ? 'Your estimate is ready' : 'Almost there'}
        </AppText>
      </View>
      {hasEstimate ? <EstimateSummary caseId={caseId} revision={job.caseRevision} /> : null}
      {notices.map((n) => (
        <AssistantMessage key={n.id} title={n.title} body={n.body} />
      ))}
      {nextStep ? <NextSteps block={nextStep} /> : null}
    </Screen>
  );
}

/** Numbers come from the calculator for this exact revision — never from the assistant's text. */
function EstimateSummary({ caseId, revision }: { caseId: string; revision: number }) {
  const api = useApi();
  const [data, setData] = useState<{ estimate: EstimateResult; scenarios: ScenarioComparisonResult } | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const load = async () => {
    setFailure(null);
    try {
      const [estimate, scenarios] = await Promise.all([api.estimate(caseId, revision), api.scenarios(caseId, revision)]);
      setData({ estimate, scenarios });
    } catch (caught) {
      setFailure(asApiError(caught));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, revision]);

  if (failure) return <ErrorNotice error={failure} onRetry={load} />;
  if (!data) return <AppText muted>Loading the calculator’s numbers…</AppText>;
  if (data.estimate.status !== 'estimated') return <Notice tone="info" title="Open your options to see the details." />;
  const alternative = data.scenarios.status === 'estimated' ? data.scenarios.alternatives[0] : undefined;
  return (
    <Card tone="highlight">
      <AppText variant="label" muted>
        Doing everything as planned, you would pay about
      </AppText>
      <AppText variant="money">{formatCents(data.estimate.totals.patientPaysCents)}</AppText>
      <Row label="Your plan pays (estimated)" value={formatCents(data.estimate.totals.insurerPaysCents)} />
      {alternative ? (
        <>
          <Row label="With a permitted timing change" value={formatCents(alternative.estimate.totals.patientPaysCents)} strong />
          <Row label="Estimated difference" value={formatCents(alternative.differenceFromBaselineCents)} />
          {alternative.conditional ? <Badge label="Depends on next year’s coverage staying the same" tone="warning" /> : null}
        </>
      ) : null}
      <AppText variant="caption" muted>
        Estimates from your plan’s rules — not a guarantee of payment.
      </AppText>
    </Card>
  );
}

function NextSteps({ block }: { block: Extract<UiBlock, { type: 'next_step' }> }) {
  const [copied, setCopied] = useState(false);
  const { colors } = useTheme();
  const text = block.items.map((item) => `• (${item.audience === 'self' ? 'You' : item.audience === 'dentist' ? 'Dentist' : 'Insurer'}) ${item.text}`).join('\n');
  return (
    <Card>
      <AppText variant="heading">{block.title}</AppText>
      {block.items.map((item) => (
        <View key={item.id} style={{ flexDirection: 'row', gap: space(2) }}>
          <Badge label={item.audience === 'self' ? 'You' : item.audience === 'dentist' ? 'Dentist' : 'Insurer'} tone="neutral" />
          <AppText variant="caption" style={{ flex: 1 }}>
            {item.text}
          </AppText>
        </View>
      ))}
      <Button
        label={copied ? 'Copied' : 'Copy these questions'}
        variant="secondary"
        icon={<ClipboardCopy size={18} color={colors.primary} />}
        onPress={async () => {
          await Clipboard.setStringAsync(`${block.title}\n${text}`);
          setCopied(true);
          AccessibilityInfo.announceForAccessibility('Questions copied');
        }}
      />
      <AppText variant="caption" muted>
        Copying doesn’t send anything. You choose who to share it with.
      </AppText>
    </Card>
  );
}

// ---- Failed ------------------------------------------------------------------------------------

function Failed({ job, caseId, onRetried }: { job: AgentJobView; caseId: string; onRetried: () => void }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const retry = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await api.retryJob(job.jobId);
      onRetried();
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      footer={
        <>
          {job.error?.retryable ? <Button label="Try again" onPress={retry} loading={busy} /> : null}
          <Button label="Answer questions instead" variant={job.error?.retryable ? 'ghost' : 'primary'} onPress={() => router.replace({ pathname: '/case/[caseId]/questions', params: { caseId } })} />
        </>
      }
    >
      <View style={{ alignItems: 'center', paddingTop: space(4) }}>
        <AgentOrb size={96} mode="alert" />
      </View>
      <Notice tone="warning" title={job.error?.message ?? 'The assistant could not finish.'} body={`Your case is unchanged.${job.error?.requestId ? ` Reference: ${job.error.requestId}` : ''}`} />
      {failure ? <ErrorNotice error={failure} /> : null}
    </Screen>
  );
}
