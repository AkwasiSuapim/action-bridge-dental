import { Check, Circle, LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Notice,
  Orb,
  PageHeading,
} from '../../components/ui';
import { useDemo } from '../../state/demo-store';
import { stages, useJob } from '../../state/job-store';
export function WorkingPage() {
  const { state } = useDemo();
  const { job, start, cancel, skip, controls, setControl } = useJob();
  const navigate = useNavigate();
  useEffect(() => {
    if (state.input && state.confirmed && job.status === 'idle') start();
  }, [job.status, state.confirmed, state.input?.caseRevision]);
  useEffect(() => {
    if (
      job.status === 'completed' &&
      state.input?.caseRevision === job.revision
    )
      navigate('/options', { replace: true });
  }, [job.status, job.revision, state.input?.caseRevision, navigate]);
  if (!state.input || !state.confirmed)
    return (
      <div className="page narrow">
        <Card>
          <h2>Review your information first</h2>
          <p className="muted">
            Confirm the details before starting the sample calculation.
          </p>
          <Button onClick={() => navigate(state.input ? '/facts' : '/')}>
            Review information
          </Button>
        </Card>
      </div>
    );
  return (
    <div className="page working-layout">
      <div className="working-intro">
        <Badge>Local sample analysis</Badge>
        <Orb
          size={260}
          active={job.status !== 'failed'}
          alert={job.status === 'failed'}
        />
        <PageHeading
          title={
            job.status === 'failed'
              ? "Let's try that again"
              : 'A clearer picture is taking shape.'
          }
          description={
            job.status === 'failed'
              ? 'Your information is preserved. You can retry or return to the details.'
              : 'Checking your fictional treatment against the sample plan and permitted dates.'
          }
        />
      </div>
      <Card className="working-stages">
        <p className="eyebrow">
          {job.status === 'failed'
            ? 'Sample analysis interrupted'
            : 'Working with your confirmed details'}
        </p>
        <ol className="stage-list" aria-live="polite">
          {stages.map((stage, i) => (
            <li
              className={
                i < job.stage ? 'done' : i === job.stage ? 'current' : ''
              }
              key={stage}
            >
              {i < job.stage ? (
                <Check size={20} />
              ) : i === job.stage && job.status === 'running' ? (
                <LoaderCircle size={20} className="spin" />
              ) : (
                <Circle size={18} />
              )}
              <div>
                <strong>{stage}</strong>
                <small>
                  {i < job.stage
                    ? 'Sample stage complete'
                    : i === job.stage && job.status === 'running'
                      ? 'In progress · simulated preview'
                      : 'Pending'}
                </small>
              </div>
            </li>
          ))}
        </ol>
        {job.status === 'failed' ? (
          <>
            <Notice tone="warning">{job.error}</Notice>
            <div className="actions">
              <Button
                onClick={() => {
                  if (controls.failAnalysis) setControl('failAnalysis', false);
                  start();
                }}
              >
                Retry analysis
              </Button>
              <Button variant="secondary" onClick={() => navigate('/facts')}>
                Review details
              </Button>
            </div>
          </>
        ) : (
          <div className="actions">
            <Button variant="secondary" onClick={skip}>
              Skip preview
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              Continue in background
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                cancel();
                navigate('/facts');
              }}
            >
              Cancel
            </Button>
          </div>
        )}
        <p className="small muted">
          Stages are a local timed demonstration. Financial results come from
          the shared calculation engine.
        </p>
      </Card>
    </div>
  );
}
