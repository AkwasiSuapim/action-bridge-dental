import { ClipboardList } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Orb } from '../../components/ui';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../state/auth';
import { useCase } from '../../state/case-store';
import { ApiNotice } from '../assistant/assistant-page';

/**
 * "A few details": asks the server what is still missing for the current revision. The engine
 * decides; the assistant groups the questions (at most four at a time) and offers "I don't know".
 */
export function QuestionsPage() {
  const api = useApi();
  const { record, loading } = useCase();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<ApiError | null>(null);
  const started = useRef<string | null>(null);

  const start = async () => {
    if (!record) return;
    setFailure(null);
    try {
      const { jobId } = await api.createJob(record.caseId, {
        expectedRevision: record.caseRevision,
        operation: 'interpret',
        input: {},
      });
      navigate(`/assistant/${jobId}`, { replace: true });
    } catch (caught) {
      setFailure(asApiError(caught));
    }
  };

  useEffect(() => {
    const key = record ? `${record.caseId}@${record.caseRevision}` : null;
    if (!key || started.current === key) return;
    started.current = key;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  if (!record && !loading)
    return (
      <div className="page">
        <EmptyState
          icon={ClipboardList}
          title="Nothing added yet"
          description="Start with a treatment description, a document, or the fictional sample case."
          action={<Button onClick={() => navigate('/')}>Start on Home</Button>}
        />
      </div>
    );
  return (
    <div className="page narrow centered">
      <Orb size={120} active={!failure} alert={!!failure} />
      {failure ? (
        <>
          <ApiNotice error={failure} onRetry={() => void start()} />
          <Button variant="secondary" onClick={() => navigate('/facts')}>
            Review your information
          </Button>
        </>
      ) : (
        <p className="muted" role="status">
          Checking what’s still needed…
        </p>
      )}
    </div>
  );
}
