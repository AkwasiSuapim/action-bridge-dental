import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  DentalCaseInputSchema,
  ScenarioSchema,
  type DentalCaseInput,
  type Scenario,
} from '@actionbridge/contracts';
import {
  initialState,
  type Attachment,
  type DemoState,
  type Session,
  type CaseSnapshot,
} from '../domain/model';
import { sampleInput } from '../services/dental-service';
import { fieldLabel, inputFacts } from '../domain/case-fields';

export function snapshot(s: DemoState): CaseSnapshot {
  const {
    caseId,
    input,
    confirmed,
    comparedRevision,
    selectedId,
    saved,
    quote,
    reminder,
    provenance,
    origin,
    documentNeeded,
    documentDeclined,
    deductibleConflict,
  } = s;
  return {
    caseId,
    input,
    confirmed,
    comparedRevision,
    selectedId,
    saved,
    quote,
    reminder,
    provenance,
    origin,
    documentNeeded,
    documentDeclined,
    deductibleConflict,
    updatedAt:
      s.events.find((e) => e.caseId === caseId)?.timestamp ??
      new Date().toISOString(),
  };
}
export function recentCases(s: DemoState): CaseSnapshot[] {
  return (
    s.input
      ? [snapshot(s), ...s.cases.filter((c) => c.caseId !== s.caseId)]
      : s.cases
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function archive(s: DemoState) {
  return s.input
    ? [snapshot(s), ...s.cases.filter((c) => c.caseId !== s.caseId)].slice(
        0,
        20,
      )
    : s.cases;
}

const KEY = 'actionbridge.web.demo.v1';
function read(): DemoState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || raw.version !== 1) return initialState();
    const data = raw.data as DemoState;
    if (
      !data.session ||
      typeof data.session.name !== 'string' ||
      typeof data.session.email !== 'string' ||
      !Array.isArray(data.events)
    )
      return initialState();
    if (data.input) DentalCaseInputSchema.parse(data.input);
    if (data.saved) {
      ScenarioSchema.parse(data.saved.scenario);
      DentalCaseInputSchema.parse(data.saved.input);
      data.saved.provenance ??= {};
    }
    for (const c of data.cases ?? []) {
      if (!c.caseId || !c.input) return initialState();
      DentalCaseInputSchema.parse(c.input);
      if (c.saved) {
        ScenarioSchema.parse(c.saved.scenario);
        DentalCaseInputSchema.parse(c.saved.input);
        c.saved.provenance ??= {};
      }
    }
    return {
      ...initialState(),
      ...data,
      caseId: data.caseId ?? (data.input ? 'legacy-demo' : null),
      attachments: [],
    };
  } catch {
    return initialState();
  }
}
type Store = {
  state: DemoState;
  signIn: (session: Session) => void;
  signOut: () => void;
  startSample: () => void;
  addInput: (text?: string, attachment?: Attachment) => void;
  removeAttachment: (name: string) => void;
  edit: (mutate: (input: DentalCaseInput) => void) => void;
  confirm: () => void;
  select: (id: string) => void;
  markCompared: (revision: number) => void;
  save: (scenario: Scenario) => void;
  reset: () => void;
  setQuote: (quote: DemoState['quote']) => void;
  setReminder: (date: string | null) => void;
  rename: (name: string) => void;
  createCase: (input: DentalCaseInput) => void;
  openCase: (id: string) => void;
  setCaseFlags: (
    flags: Partial<
      Pick<
        DemoState,
        'documentNeeded' | 'documentDeclined' | 'deductibleConflict'
      >
    >,
  ) => void;
};
const Context = createContext<Store | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(read);
  const change = (fn: (s: DemoState) => DemoState) => setState((s) => fn(s));
  const event = (s: DemoState, title: string, detail: string): DemoState => ({
    ...s,
    events: [
      {
        id: crypto.randomUUID(),
        title,
        detail,
        timestamp: new Date().toISOString(),
        caseId: s.caseId ?? undefined,
        routine:
          title === 'Case details updated' || title === 'Details confirmed',
      },
      ...s.events,
    ].slice(0, 100),
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          version: 1,
          data: { ...state, attachments: [], transcript: '' },
        }),
      );
    } catch {
      /* A blocked storage environment uses memory. */
    }
  }, [state]);
  const store: Store = {
    state,
    signIn: (session) =>
      change((s) => ({
        ...(s.session?.email === session.email ? s : initialState()),
        session,
      })),
    signOut: () => change(() => initialState()),
    createCase: (input) =>
      change((s) => {
        const next = {
          ...initialState(),
          session: s.session,
          events: s.events,
          cases: archive(s),
          caseId: crypto.randomUUID(),
          input: structuredClone(input),
          origin: 'manual' as const,
          documentNeeded: true,
        };
        const now = new Date().toISOString();
        for (const [path, value] of Object.entries(inputFacts(input)))
          if (value !== 'Not answered' && value !== 'Not sure')
            next.provenance[path] = {
              label: fieldLabel(input, path),
              value,
              recordedAt: now,
            };
        return event(
          next,
          'Estimate started',
          'Manual demo treatment entered. No information sent to a server.',
        );
      }),
    openCase: (id) =>
      change((s) => {
        if (id === s.caseId) return s;
        const found = s.cases.find((c) => c.caseId === id);
        if (!found) return s;
        return {
          ...s,
          ...found,
          cases: archive(s).filter((c) => c.caseId !== id),
          transcript: '',
          attachments: [],
        };
      }),
    setCaseFlags: (flags) =>
      change((s) => ({
        ...s,
        ...flags,
        confirmed: false,
        comparedRevision: null,
      })),
    startSample: () =>
      change((s) =>
        event(
          {
            ...initialState(),
            session: s.session,
            events: s.events,
            cases: archive(s),
            caseId: crypto.randomUUID(),
            input: sampleInput(),
            attachments: [
              { name: 'Jordan-treatment-estimate.pdf', kind: 'sample' },
            ],
            confirmed: false,
            comparedRevision: null,
            selectedId: 'baseline',
          },
          'Sample case started',
          'Fictional estimate: two fillings and a crown.',
        ),
      ),
    addInput: (text, attachment) =>
      change((s) =>
        event(
          {
            ...s,
            input: s.input
              ? { ...s.input, caseRevision: s.input.caseRevision + 1 }
              : sampleInput(),
            caseId: s.caseId ?? crypto.randomUUID(),
            documentNeeded: attachment
              ? false
              : s.documentNeeded || (!!text && s.attachments.length === 0),
            transcript: text ?? s.transcript,
            attachments: attachment
              ? [
                  ...s.attachments.filter((a) => a.name !== attachment.name),
                  attachment,
                ]
              : s.attachments,
            confirmed: false,
            comparedRevision: null,
          },
          attachment ? 'Document added' : 'Treatment description added',
          attachment
            ? `${attachment.name}. Analysis will use fictional sample content.`
            : 'Description confirmed for sample analysis.',
        ),
      ),
    removeAttachment: (name) =>
      change((s) =>
        event(
          { ...s, attachments: s.attachments.filter((a) => a.name !== name) },
          'Document removed',
          name,
        ),
      ),
    edit: (mutate) =>
      change((s) => {
        if (!s.input) return s;
        const input = structuredClone(s.input);
        mutate(input);
        const before = inputFacts(s.input);
        const after = inputFacts(input);
        const provenance = { ...s.provenance };
        for (const [path, value] of Object.entries(after))
          if (before[path] !== value)
            provenance[path] = {
              label: fieldLabel(input, path),
              value,
              recordedAt: new Date().toISOString(),
            };
        for (const path of Object.keys(provenance))
          if (!(path in after)) delete provenance[path];
        input.caseRevision = s.input.caseRevision + 1;
        for (const [id, y] of Object.entries(input.planYears))
          if (
            Object.keys(after).some(
              (path) =>
                path.startsWith(`planYears.${id}.`) &&
                before[path] !== after[path],
            )
          )
            y.sourceStatus = 'user_entered';
        const scopeChanged =
          s.input.procedures
            .map((p) => `${p.id}:${p.label}:${p.category}`)
            .join('|') !==
          input.procedures
            .map((p) => `${p.id}:${p.label}:${p.category}`)
            .join('|');
        return event(
          {
            ...s,
            input,
            provenance,
            quote: scopeChanged ? null : s.quote,
            confirmed: false,
            comparedRevision: null,
          },
          'Case details updated',
          `Revision ${input.caseRevision}. Previous estimates need recalculation.`,
        );
      }),
    confirm: () =>
      change((s) =>
        s.confirmed
          ? s
          : event(
              { ...s, confirmed: true },
              'Details confirmed',
              'Treatment, benefits and dentist-supplied sample timing reviewed.',
            ),
      ),
    select: (selectedId) => change((s) => ({ ...s, selectedId })),
    markCompared: (revision) =>
      change((s) =>
        !s.input ||
        s.input.caseRevision !== revision ||
        s.comparedRevision === revision
          ? s
          : event(
              { ...s, comparedRevision: revision },
              'Options compared',
              `Engine-calculated sample options for revision ${revision}.`,
            ),
      ),
    save: (scenario) =>
      change((s) => {
        if (
          !s.input ||
          !s.confirmed ||
          scenario.estimate.caseRevision !== s.input.caseRevision ||
          s.comparedRevision !== s.input.caseRevision
        )
          return s;
        if (
          s.saved?.scenario.scenarioId === scenario.scenarioId &&
          s.saved.input.caseRevision === s.input.caseRevision
        )
          return s;
        return event(
          {
            ...s,
            saved: {
              scenario: structuredClone(scenario),
              input: structuredClone(s.input),
              savedAt: new Date().toISOString(),
              provenance: structuredClone(s.provenance),
            },
          },
          'Plan saved',
          'Selected estimate stored locally. No benefits consumed; no appointment booked.',
        );
      }),
    reset: () => change((s) => ({ ...initialState(), session: s.session })),
    setQuote: (quote) =>
      change((s) =>
        event(
          { ...s, quote },
          quote ? 'Self-pay quote added' : 'Self-pay quote removed',
          quote
            ? 'Same procedure scope; treatment costs only.'
            : 'Cash comparison is unavailable until a quote is added.',
        ),
      ),
    setReminder: (reminder) =>
      change((s) =>
        event(
          { ...s, reminder },
          reminder ? 'Demo reminder saved' : 'Demo reminder removed',
          reminder
            ? `${reminder}. Simulated only; no notification will be sent.`
            : 'Local demo reminder cleared.',
        ),
      ),
    rename: (name) =>
      change((s) => ({
        ...s,
        session: s.session ? { ...s.session, name } : null,
      })),
  };
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useDemo() {
  const store = useContext(Context);
  if (!store) throw new Error('Missing demo provider');
  return store;
}
