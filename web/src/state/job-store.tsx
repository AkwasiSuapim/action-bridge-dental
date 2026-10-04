import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { dentalService } from '../services/dental-service';
import { useDemo } from './demo-store';

export const stages = [
  'Reading sample information',
  'Identifying procedures',
  'Checking confirmed details',
  'Preparing sample calculations',
  'Comparing permitted schedules',
];
type Job = {
  status: 'idle' | 'running' | 'completed' | 'failed';
  stage: number;
  revision: number;
  error?: string;
};
type Controls = {
  failSave: boolean;
  failAnalysis: boolean;
  denyVoice: boolean;
  denyCamera: boolean;
};
type JobStore = {
  job: Job;
  controls: Controls;
  setControl: (key: keyof Controls, value: boolean) => void;
  start: () => void;
  cancel: () => void;
  skip: () => void;
};
const Context = createContext<JobStore | null>(null);
export function JobProvider({ children }: { children: ReactNode }) {
  const demo = useDemo();
  const latest = useRef(demo);
  latest.current = demo;
  const [job, setJob] = useState<Job>({
    status: 'idle',
    stage: 0,
    revision: 0,
  });
  const [controls, setControls] = useState<Controls>({
    failSave: false,
    failAnalysis: false,
    denyVoice: false,
    denyCamera: false,
  });
  const controlRef = useRef(controls);
  controlRef.current = controls;
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const generation = useRef(0);
  const cancel = () => {
    clearInterval(timer.current);
    generation.current++;
    setJob({ status: 'idle', stage: 0, revision: 0 });
  };
  const finish = (revision: number, token: number) => {
    clearInterval(timer.current);
    if (
      token !== generation.current ||
      latest.current.state.input?.caseRevision !== revision ||
      !latest.current.state.confirmed
    )
      return;
    try {
      dentalService.compare(latest.current.state.input);
      latest.current.markCompared(revision);
      setJob({ status: 'completed', stage: stages.length, revision });
    } catch (e) {
      setJob({
        status: 'failed',
        stage: 3,
        revision,
        error: e instanceof Error ? e.message : 'Please review your details.',
      });
    }
  };
  const start = () => {
    const input = latest.current.state.input;
    if (!input || !latest.current.state.confirmed) return;
    clearInterval(timer.current);
    const token = ++generation.current;
    let stage = 0;
    setJob({ status: 'running', stage, revision: input.caseRevision });
    timer.current = setInterval(() => {
      if (++stage === 3 && controlRef.current.failAnalysis) {
        clearInterval(timer.current);
        setJob({
          status: 'failed',
          stage,
          revision: input.caseRevision,
          error:
            'Sample analysis was interrupted. Your confirmed information is still here.',
        });
        return;
      }
      if (stage >= stages.length) finish(input.caseRevision, token);
      else setJob({ status: 'running', stage, revision: input.caseRevision });
    }, 850);
  };
  useEffect(() => {
    cancel();
  }, [
    demo.state.input?.caseRevision,
    demo.state.session?.email,
    demo.state.caseId,
  ]);
  useEffect(() => () => clearInterval(timer.current), []);
  return (
    <Context.Provider
      value={{
        job,
        controls,
        setControl: (key, value) =>
          setControls((c) => ({ ...c, [key]: value })),
        start,
        cancel,
        skip: () => {
          if (job.status === 'running') {
            if (controlRef.current.failAnalysis) {
              clearInterval(timer.current);
              setJob({
                ...job,
                status: 'failed',
                error:
                  'Sample analysis was interrupted. Turn off the failure simulation and retry.',
              });
            } else finish(job.revision, generation.current);
          }
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useJob() {
  const context = useContext(Context);
  if (!context) throw new Error('Missing job provider');
  return context;
}
