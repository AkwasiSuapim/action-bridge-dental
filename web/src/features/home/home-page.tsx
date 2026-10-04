import {
  ArrowRight,
  Camera,
  ClipboardList,
  FileText,
  Keyboard,
  Mic,
  PencilLine,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Notice, Orb } from '../../components/ui';
import { treatmentTitle } from '../../domain/model';
import { isSampleCase } from '../../domain/provenance';
import { sampleCaseRequest } from '../../domain/sample';
import { asApiError, type ApiError } from '../../services/api';
import { useAuth } from '../../state/auth';
import { useCase } from '../../state/case-store';

/** Every way in opens the same composer; nothing is analysed until the user chooses Analyse. */
export function HomePage() {
  const { session } = useAuth();
  const { record, saved, create } = useCase();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);

  const trySample = async () => {
    if (starting) return;
    setStarting(true);
    setFailure(null);
    try {
      await create(sampleCaseRequest());
      navigate('/facts');
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setStarting(false);
    }
  };

  const status = !record
    ? null
    : saved && saved.caseRevision === record.caseRevision
      ? 'Your plan is saved'
      : record.procedures.length === 0
        ? 'Add your treatment details'
        : 'Review your information';

  return (
    <div className="page home-page">
      <div className="home-hero">
        <div className="home-intro">
          <p className="eyebrow">Hi, {session?.name.split(' ')[0]}</p>
          <h2>Let's make sense of your dental costs.</h2>
          <p className="home-description muted">
            Tell me about your treatment or add an estimate. I'll ask only for
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
                Upload
              </Button>
              <Button
                variant="secondary"
                icon={Camera}
                onClick={() => navigate('/intake/photo')}
              >
                Photo
              </Button>
              <Button
                variant="secondary"
                icon={Keyboard}
                onClick={() => navigate('/intake/type')}
              >
                Type
              </Button>
            </div>
          </Card>
          <div className="sample-start">
            <Button
              variant="ghost"
              icon={PencilLine}
              onClick={() => navigate('/intake/manual')}
            >
              Prefer a form? Enter details step by step
            </Button>
            <Button
              variant="ghost"
              icon={FileText}
              busy={starting}
              onClick={() => void trySample()}
            >
              {starting ? 'Starting the sample…' : 'Try a sample case'}
            </Button>
            <p className="small muted">
              Jordan's fictional estimate, labeled as sample data.
            </p>
          </div>
          {failure && (
            <Notice tone="danger">
              {failure.message}
              {failure.options.requestId
                ? ` Reference: ${failure.options.requestId}`
                : ''}
            </Notice>
          )}
        </div>
        <div className="home-orb">
          <Orb size={300} />
          <p className="small muted">Clarity before treatment.</p>
        </div>
      </div>
      {record && record.procedures.length > 0 && (
        <button
          className="resume-card"
          onClick={() =>
            navigate(
              saved && saved.caseRevision === record.caseRevision
                ? '/saved'
                : '/facts',
            )
          }
        >
          <span className="icon-tile">
            <ClipboardList size={24} />
          </span>
          <span>
            <small className="muted">
              Continue your plan{isSampleCase(record) ? ' · Sample data' : ''}
            </small>
            <strong>{treatmentTitle(record)}</strong>
            <small className="accent">{status}</small>
          </span>
          <span className="resume-cta">
            Continue <ArrowRight size={20} />
          </span>
        </button>
      )}
      <ol className="how-it-works">
        {[
          ['Tell me', 'Speak, type or add a page.'],
          ['Check', 'Confirm what I found and answer what’s missing.'],
          ['Compare', 'See costs by timing, then save a plan.'],
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
