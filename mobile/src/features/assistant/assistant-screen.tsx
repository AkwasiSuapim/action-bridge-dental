import { jobSteps, termFor, type AgentJobView, type EstimateResult, type MissingFieldBlock, type ScenarioComparisonResult, type UiBlock } from '@actionbridge/contracts';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, ClipboardCopy, MinusCircle, XCircle } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, View } from 'react-native';
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
import { ListenButton } from '../../components/listen';
import { useAutoRead } from '../../lib/voice';

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

// ---- Working: a checklist of real steps, no fake progress ------------------------------------

function Working({ job, timedOut, onCancel, onRefresh, actionError }: { job: AgentJobView; timedOut: boolean; onCancel: () => void; onRefresh: () => void; actionError: ApiError | null }) {
  const { colors } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const steps = useMemo(() => jobSteps(job.events), [job.events]);
  const seconds = (from: string) => Math.max(0, Math.round((now - new Date(from).getTime()) / 1000));

  return (
    <Screen footer={<Button label="Stop" variant="ghost" onPress={onCancel} />}>
      <View style={{ alignItems: 'center', gap: space(3), paddingTop: space(4) }}>
        <AgentOrb size={130} mode="active" />
        <AppText variant="title" style={{ textAlign: 'center' }}>
          Working on it
        </AppText>
        <AppText variant="caption" muted accessibilityRole="text">
          {seconds(job.createdAt)} seconds so far · nothing changes until you confirm
        </AppText>
      </View>
      {steps.length === 0 ? (
        <AppText variant="caption" muted style={{ textAlign: 'center' }}>
          Starting…
        </AppText>
      ) : (
        <Card>
          {steps.map((step) => {
            const done = step.status === 'done';
            const Icon = done ? CheckCircle2 : step.status === 'failed' ? XCircle : step.status === 'skipped' ? MinusCircle : null;
            const detail = step.status === 'active' ? `${seconds(step.startedAt)}s${step.hint ? ` · ${step.hint}` : ''}` : (step.result ?? 'Done');
            return (
              <View key={step.key} style={{ flexDirection: 'row', gap: space(3), alignItems: 'flex-start' }} accessible accessibilityLabel={`${step.label}: ${detail}`}>
                {Icon ? <Icon size={20} color={done ? colors.primary : colors.textMuted} /> : <ActivityIndicator size="small" color={colors.primary} />}
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{step.label}</AppText>
                  <AppText variant="caption" muted>
                    {detail}
                  </AppText>
                </View>
              </View>
            );
          })}
        </Card>
      )}
      {timedOut ? (
        <Notice tone="warning" title="This is taking longer than usual" body="Your input is safe. Check again, or stop and enter the details step by step.">
          <Button label="Check again" variant="secondary" onPress={onRefresh} />
        </Notice>
      ) : null}
      {actionError ? <ErrorNotice error={actionError} /> : null}
    </Screen>
  );
}

// ---- A step that needs the user: one item at a time, then a summary -------------------------

function Step({ job, caseId }: { job: AgentJobView; caseId: string }) {
  const api = useApi();
  const questions = questionsOf(job.questions);
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(questions));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const notices = (job.questions?.blocks ?? []).filter((b): b is Extract<UiBlock, { type: 'notice' }> => b.type === 'notice');
  const current = questions[index];
  const reviewing = index >= questions.length;
  // Voice guidance reads the key words of each item as it appears; answers are tapped.
  useAutoRead(
    api,
    current
      ? current.inputType === 'fact_review'
        ? `${index === 0 ? `I found ${questions.length} things to check. ` : ''}${current.label.replace(/^Is this right\?\s*/, '')}: ${String(current.candidateValue ?? '')}. Is this right?`
        : `${current.label} ${current.options.length ? `Options: ${current.options.map((o) => o.label).join(', or ')}.` : ''}`
      : `Check before I use these. Tap continue to use them, or tap an item to change it.`,
  );

  const set = (questionId: string, draft: Draft) => {
    setDrafts((existing) => ({ ...existing, [questionId]: draft }));
    setProblems((existing) => {
      const { [questionId]: _cleared, ...rest } = existing;
      return rest;
    });
  };
  /** Checks only this item before moving on. */
  const next = () => {
    if (!current) return;
    const built = buildAnswers([current], drafts, job.caseRevision);
    if (!built.ok) {
      setProblems({ [current.questionId]: built.problems[0]!.message });
      AccessibilityInfo.announceForAccessibility(built.problems[0]!.message);
      return;
    }
    setIndex((i) => i + 1);
  };
  const submit = async () => {
    if (busy) return;
    const built = buildAnswers(questions, drafts, job.caseRevision);
    if (!built.ok) {
      setProblems(Object.fromEntries(built.problems.map((p) => [p.questionId, p.message])));
      setIndex(questions.findIndex((q) => q.questionId === built.problems[0]!.questionId));
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

  const footer = reviewing ? (
    <>
      <Button label="Continue" onPress={submit} loading={busy} />
      <Button label="Back" variant="ghost" onPress={() => setIndex(questions.length - 1)} />
    </>
  ) : current && current.inputType !== 'fact_review' ? (
    <>
      <Button label="Next" onPress={next} />
      <Button label={index > 0 ? 'Back' : 'Finish later'} variant="ghost" onPress={() => (index > 0 ? setIndex(index - 1) : router.replace({ pathname: '/case/[caseId]/facts', params: { caseId } }))} />
    </>
  ) : (
    <Button
      label={index > 0 ? 'Back' : 'Finish later'}
      variant="ghost"
      onPress={() => (index > 0 ? setIndex(index - 1) : router.replace({ pathname: '/case/[caseId]/facts', params: { caseId } }))}
    />
  );

  return (
    <Screen footer={footer}>
      {index === 0 ? notices.map((n) => <AssistantMessage key={n.id} title={n.title} body={n.body} />) : null}
      <StepBar count={questions.length + 1} current={index} />
      {current && !reviewing ? (
        <>
          <AppText variant="label" muted>
            {current.inputType === 'fact_review' ? 'Is this right?' : 'A quick question'} · {index + 1} of {questions.length}
          </AppText>
          {current.inputType === 'fact_review' ? (
            <UnderstoodCard
              key={current.questionId}
              block={current}
              draft={drafts[current.questionId]}
              onChange={(d) => {
                set(current.questionId, d);
                // A tap answers it; move straight on.
                setTimeout(() => setIndex((i) => i + 1), 180);
              }}
            />
          ) : (
            <QuestionCard key={current.questionId} block={current} draft={drafts[current.questionId]} problem={problems[current.questionId]} onChange={(d) => set(current.questionId, d)} />
          )}
        </>
      ) : (
        <>
          <View style={{ gap: space(1) }}>
            <AppText variant="title">Check before I use these</AppText>
            <AppText variant="caption" muted>
              Tap any item to change it. Nothing is used until you continue.
            </AppText>
          </View>
          <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
            {questions.map((q, i) => (
              <SummaryRow key={q.questionId} first={i === 0} title={q.inputType === 'fact_review' ? String(q.candidateValue ?? '') : q.label} answer={answerLabel(q, drafts[q.questionId])} onPress={() => setIndex(i)} />
            ))}
          </Card>
          {failure ? <ErrorNotice error={failure} onRetry={submit} /> : null}
        </>
      )}
    </Screen>
  );
}

function answerLabel(q: MissingFieldBlock, draft: Draft | undefined): string {
  if (!draft) return 'Not answered';
  if (draft.kind === 'unknown') return 'I don’t know — added to your questions';
  if (draft.kind === 'confirm') return draft.value ? '✓ Yes, use this' : '✗ Not right — left out';
  if (draft.kind === 'choice') return q.options.find((o) => o.id === draft.optionId)?.label ?? 'Chosen';
  return q.inputType === 'currency' ? `$${draft.text.replace(/^\$/, '')}` : draft.text;
}

function StepBar({ count, current }: { count: number; current: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space(1.5) }} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= current ? colors.primary : colors.border }} />
      ))}
    </View>
  );
}

function SummaryRow({ title, answer, first, onPress }: { title: string; answer: string; first: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${answer}. Change`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(4), borderTopWidth: first ? 0 : 1, borderTopColor: colors.border, backgroundColor: pressed ? colors.surfaceMuted : 'transparent' })}
    >
      <View style={{ flex: 1, gap: space(0.5) }}>
        <AppText variant="label" style={{ fontFamily: fonts.semibold }}>
          {title}
        </AppText>
        <AppText variant="caption" muted>
          {answer}
        </AppText>
      </View>
      <AppText variant="caption" color={colors.primary} style={{ fontFamily: fonts.semibold }}>
        Change
      </AppText>
    </Pressable>
  );
}

/** One line saying what a term means, for the fields people find confusing. */
function Meaning({ fieldPath }: { fieldPath: string }) {
  const term = termFor(fieldPath);
  if (!term) return null;
  return (
    <AppText variant="caption" muted>
      <AppText variant="caption" style={{ fontFamily: fonts.semibold }}>
        {term.term}:
      </AppText>{' '}
      {term.definition}
    </AppText>
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
  const answered = draft?.kind === 'confirm' ? draft.value : null;
  const fromDocument = block.reason.startsWith('From your document');
  const quote = block.reason.replace(/^From your (description|document):\s*/, '');
  return (
    <Card>
      <AppText variant="caption" muted>
        {block.label.replace(/^Is this right\?\s*/, '')}
      </AppText>
      <AppText variant="heading" style={{ fontSize: 20, lineHeight: 27 }}>
        {String(block.candidateValue ?? '')}
      </AppText>
      <AppText variant="caption" muted style={{ fontStyle: 'italic' }}>
        {fromDocument ? 'From the document' : 'From your words'}: {quote}
      </AppText>
      <Meaning fieldPath={block.fieldPath} />
      <ListenButton text={[block.label.replace(/^Is this right\?\s*/, ''), String(block.candidateValue ?? ''), quote ? 'From what you shared: ' + quote : '', termFor(block.fieldPath)?.definition ?? '', 'Is this right?'].filter(Boolean).join('. ')} />
      <View style={{ gap: space(2), marginTop: space(1) }} accessibilityRole="radiogroup" accessibilityLabel={`Is this right? ${String(block.candidateValue ?? '')}`}>
        <Button label="Yes, that’s right" variant={answered === true ? 'primary' : 'secondary'} onPress={() => onChange({ kind: 'confirm', value: true })} />
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: answered === false }}
          accessibilityLabel="Not right"
          onPress={() => onChange({ kind: 'confirm', value: false })}
          style={{ minHeight: layout.minHitArea + 8, borderRadius: layout.radius, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', borderColor: answered === false ? colors.danger : colors.border, backgroundColor: answered === false ? colors.dangerSoft : colors.surface }}
        >
          <AppText variant="label" color={answered === false ? colors.danger : colors.text} style={{ fontFamily: fonts.semibold, fontSize: 16 }}>
            Not right
          </AppText>
        </Pressable>
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
      <Meaning fieldPath={block.fieldPath} />
      <ListenButton text={[block.label, block.reason, termFor(block.fieldPath)?.definition ?? ''].filter(Boolean).join(' ')} />
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
