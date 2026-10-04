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
} from '../domain/model';
import { sampleInput } from '../services/dental-service';

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
    }
    return { ...initialState(), ...data, attachments: [] };
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
    startSample: () =>
      change((s) =>
        event(
          {
            ...s,
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
        input.caseRevision += 1;
        return event(
          { ...s, input, confirmed: false, comparedRevision: null },
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
