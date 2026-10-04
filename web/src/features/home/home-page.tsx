import {
  ArrowRight,
  Camera,
  ClipboardList,
  FileText,
  Keyboard,
  Mic,
  Upload,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Orb } from '../../components/ui';
import { useDemo } from '../../state/demo-store';
import { useJob } from '../../state/job-store';
export function HomePage() {
  const { state, startSample } = useDemo();
  const { job, cancel } = useJob();
  const navigate = useNavigate();
  const resume = () =>
    navigate(
      job.status === 'running'
        ? '/working'
        : state.comparedRevision === state.input?.caseRevision
          ? '/options'
          : '/facts',
    );
  return (
    <div className="page home-page">
      <div className="home-hero">
        <div className="home-intro">
          <p className="eyebrow">Hi, {state.session?.name.split(' ')[0]}</p>
          <h2>Let's make sense of your dental costs.</h2>
          <p className="home-description muted">
            Tell us about your treatment or add an estimate. We'll ask only for
            what's missing.
          </p>
          <Card className="input-methods">
            <Button
              icon={Mic}
              className="full speak-button"
              onClick={() => navigate('/intake/speak')}
            >
              Speak
            </Button>
            <div className="method-grid">
              <Button
                variant="secondary"
                icon={Upload}
                onClick={() => navigate('/intake/upload')}
              >
                Upload document
              </Button>
              <Button
                variant="secondary"
                icon={Camera}
                onClick={() => navigate('/intake/photo')}
              >
                Take a photo
              </Button>
              <Button
                variant="secondary"
                icon={Keyboard}
                onClick={() => navigate('/intake/type')}
              >
                Type
              </Button>
            </div>
            <p className="small muted">
              Photos are for documents like estimates and statements, not your
              teeth.
            </p>
          </Card>
          <div className="sample-start">
            <Button
              variant="secondary"
              icon={FileText}
              onClick={() => {
                cancel();
                startSample();
                navigate('/facts');
              }}
            >
              Try a sample case
            </Button>
            <p className="small muted">
              Jordan's fictional estimate.
              <br />
              Nothing leaves this browser.
            </p>
          </div>
        </div>
        <div className="home-orb">
          <Orb size={300} />
          <p className="small muted">Clarity before treatment.</p>
        </div>
      </div>
      {state.input && (
        <button className="resume-card" onClick={resume}>
          <span className="icon-tile">
            <ClipboardList size={24} />
          </span>
          <span>
            <small className="muted">Continue your plan</small>
            <strong>Two fillings and a crown</strong>
            <small className="accent">
              {job.status === 'running'
                ? 'Sample analysis in progress'
                : state.comparedRevision === state.input.caseRevision
                  ? 'Your comparison is ready'
                  : 'Review your information'}
            </small>
          </span>
          <span className="resume-cta">
            Continue <ArrowRight size={20} />
          </span>
        </button>
      )}
      <ol className="how-it-works">
        {[
          ['Add what you have', 'Speak, upload, snap or type.'],
          ["Answer what's missing", 'Usually one or two quick choices.'],
          [
            'Compare and save a plan',
            'See costs by timing, then ask your dentist.',
          ],
        ].map(([title, detail], i) => (
          <li key={title}>
            <span className="step-number">{i + 1}</span>
            <div>
              <strong>{title}</strong>
              <p className="small muted">{detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
