import {
  Camera,
  FileText,
  Mic,
  RotateCcw,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Field,
  FooterActions,
  Notice,
  Orb,
  PageHeading,
  Row,
} from '../../components/ui';
import { sampleTranscript, type Attachment } from '../../domain/model';
import { useDemo } from '../../state/demo-store';
import { useJob } from '../../state/job-store';

export function TypePage() {
  const { state, addInput } = useDemo();
  const navigate = useNavigate();
  const [text, setText] = useState(state.transcript);
  const [error, setError] = useState('');
  return (
    <div className="page narrow">
      <PageHeading
        title="Describe your treatment"
        description="What did your dentist recommend, and what would you like to know?"
      />
      <form
        className="stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!text.trim()) {
            setError(
              'Add your treatment notes, or use the sample description.',
            );
            return;
          }
          addInput(text.trim());
          navigate('/facts');
        }}
      >
        <Field label="Your notes" error={error}>
          <textarea
            rows={7}
            maxLength={3000}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            placeholder="For example: my dentist recommended two fillings and a crown…"
          />
        </Field>
        <Notice>
          Your text stays in this tab. This demo uses Jordan's fictional
          treatment for comparison; it does not analyze arbitrary treatment
          details.
        </Notice>
        <div className="actions">
          <Button variant="secondary" onClick={() => setText(sampleTranscript)}>
            Use sample description
          </Button>
          <span className="small muted">{text.length}/3000</span>
        </div>
        <FooterActions>
          <Button variant="secondary" onClick={() => navigate('/')}>
            Cancel
          </Button>
          <Button type="submit">Save and continue</Button>
        </FooterActions>
      </form>
    </div>
  );
}
export function SpeakPage() {
  const { addInput } = useDemo();
  const { controls, setControl } = useJob();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'recording' | 'processing' | 'transcript'>(
    'recording',
  );
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState(sampleTranscript);
  const [error, setError] = useState('');
  useEffect(() => {
    if (phase !== 'recording' || controls.denyVoice) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase, controls.denyVoice]);
  useEffect(() => {
    if (phase !== 'processing') return;
    const timer = setTimeout(() => setPhase('transcript'), 700);
    return () => clearTimeout(timer);
  }, [phase]);
  if (controls.denyVoice)
    return (
      <div className="page narrow centered">
        <Orb size={170} alert />
        <h2>Microphone access is blocked</h2>
        <p className="muted">
          Simulated permission state. Your existing information is safe. You can
          type or upload instead.
        </p>
        <div className="actions">
          <Button onClick={() => navigate('/intake/type')}>Type instead</Button>
          <Button
            variant="secondary"
            onClick={() => setControl('denyVoice', false)}
          >
            Try sample voice
          </Button>
          <Button variant="ghost" onClick={() => navigate('/')}>
            Cancel
          </Button>
        </div>
      </div>
    );
  return (
    <div className="page narrow voice-page">
      <Badge>Sample voice interaction</Badge>
      {phase !== 'transcript' ? (
        <>
          <Orb size={230} active />
          <h2 className="recording-time">
            {phase === 'recording'
              ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
              : 'Preparing sample transcript…'}
          </h2>
          <p className="muted">
            {phase === 'recording'
              ? 'Listening · simulated'
              : 'No audio was recorded or sent.'}
          </p>
          <p className="small muted">
            The microphone isn't used. This preview demonstrates the voice flow.
          </p>
          <div className="actions">
            {phase === 'recording' && (
              <Button icon={Square} onClick={() => setPhase('processing')}>
                Stop
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/')}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <Card className="full stack">
          <PageHeading
            title="Here's what we heard"
            description="Check the sample transcript and edit anything you want to clarify."
          />
          <Field label="Sample transcript" error={error}>
            <textarea
              rows={4}
              maxLength={3000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <Notice>
            Sample transcript. Analysis uses the fictional sample case.
          </Notice>
          <div className="actions">
            <Button
              onClick={() => {
                if (!text.trim()) {
                  setError('Add a description before continuing.');
                  return;
                }
                addInput(text.trim());
                navigate('/facts');
              }}
            >
              Use this transcript
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSeconds(0);
                setPhase('recording');
              }}
            >
              Record again
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
export function SampleDocument() {
  return (
    <div className="sample-document">
      <div className="paper-heading">
        <strong>Sample Dental Studio</strong>
        <small>Oct 2, 2026</small>
      </div>
      <p className="eyebrow">Treatment estimate · fictional</p>
      <p>Prepared for Jordan</p>
      <div className="paper-lines">
        <Row label="Filling one" value="$250" />
        <Row label="Filling two" value="$250" />
        <Row label="Crown" value="$1,000" />
        <Row label="Total" value="$1,500" strong />
      </div>
      <p className="paper-foot">Sample document for demonstration only.</p>
    </div>
  );
}
export function UploadPage() {
  const { state, addInput, removeAttachment } = useDemo();
  const navigate = useNavigate();
  const picker = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(
    state.attachments[0] ?? null,
  );
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  const accept = (file?: File) => {
    if (!file) return;
    if (
      !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(
        file.type,
      )
    ) {
      setError('Choose a PDF, JPG, PNG or WebP image.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('This file is too large. Choose a file smaller than 15 MB.');
      return;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const preview = file.type.startsWith('image/')
      ? URL.createObjectURL(file)
      : undefined;
    previewRef.current = preview ?? null;
    setAttachment({
      name: file.name,
      kind: 'file',
      ...(preview ? { preview } : {}),
    });
    setError('');
  };
  const commit = (voice = false) => {
    if (!attachment) {
      setError('Choose a document or use the sample estimate.');
      return;
    }
    addInput(undefined, { name: attachment.name, kind: attachment.kind });
    navigate(voice ? '/intake/speak' : '/facts');
  };
  return (
    <div className="page">
      <PageHeading
        title="Add your estimate or statement"
        description="A treatment estimate, benefits summary or explanation of benefits. Files stay in this browser tab."
      />
      <div className="two-columns intake-columns">
        <div className="stack">
          <input
            ref={picker}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            aria-label="Choose a treatment document"
            className="visually-hidden"
            onChange={(e) => {
              accept(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {!attachment ? (
            <div
              className={`dropzone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                accept(e.dataTransfer.files[0]);
              }}
            >
              <div className="icon-tile">
                <Upload size={28} />
              </div>
              <h3>Drag a file here</h3>
              <p className="small muted">PDF, JPG, PNG or WebP · Up to 15 MB</p>
              <Button
                variant="secondary"
                onClick={() => picker.current?.click()}
              >
                Choose file
              </Button>
            </div>
          ) : (
            <Card className="attachment-preview">
              {attachment.preview ? (
                <img src={attachment.preview} alt="Local document preview" />
              ) : attachment.kind !== 'file' ? (
                <SampleDocument />
              ) : (
                <div className="file-preview">
                  <FileText size={56} />
                  <span>PDF document</span>
                </div>
              )}
              <div className="stack">
                <strong className="break-word">{attachment.name}</strong>
                <Badge>
                  {attachment.kind === 'file'
                    ? 'Local file · Not analyzed'
                    : 'Sample document'}
                </Badge>
                <div className="actions">
                  <Button
                    variant="secondary"
                    onClick={() => picker.current?.click()}
                  >
                    Replace
                  </Button>
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    onClick={() => {
                      removeAttachment(attachment.name);
                      setAttachment(null);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="actions">
            <Button
              variant="secondary"
              icon={FileText}
              onClick={() => {
                setAttachment({
                  name: 'Jordan-treatment-estimate.pdf',
                  kind: 'sample',
                });
                setError('');
              }}
            >
              Use sample estimate
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              Cancel
            </Button>
          </div>
        </div>
        <Card className="stack">
          <h3>What happens next</h3>
          <p className="muted">
            We'll show the treatment, plan rules and timing used in the sample.
            You'll review the important details before comparing costs.
          </p>
          <Notice>
            Files never leave this browser. For any file you choose, analysis
            uses sample content and does not extract the actual document.
          </Notice>
          <div className="actions">
            <Button onClick={() => commit()}>Review information</Button>
            <Button variant="secondary" icon={Mic} onClick={() => commit(true)}>
              Add a voice note
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
export function PhotoPage() {
  const { addInput } = useDemo();
  const { controls, setControl } = useJob();
  const navigate = useNavigate();
  const [captured, setCaptured] = useState(false);
  if (controls.denyCamera)
    return (
      <div className="page narrow centered">
        <Orb alert size={160} />
        <h2>Camera unavailable</h2>
        <p className="muted">
          Simulated unavailable state. Upload a file instead, or try the sample
          camera. Your existing input is preserved.
        </p>
        <div className="actions">
          <Button onClick={() => navigate('/intake/upload')}>
            Upload instead
          </Button>
          <Button
            variant="secondary"
            onClick={() => setControl('denyCamera', false)}
          >
            Try again
          </Button>
          <Button variant="ghost" onClick={() => navigate('/')}>
            Cancel
          </Button>
        </div>
      </div>
    );
  return (
    <div className="page medium">
      <PageHeading
        title="Take a photo of your document"
        description="Line up the whole page inside the frame."
      />
      <div className={`camera-preview ${captured ? 'captured' : ''}`}>
        <span className="camera-label">
          <Badge>Sample camera preview</Badge>
        </span>
        {captured && (
          <span className="captured-label">
            <Badge tone="green">Captured</Badge>
          </span>
        )}
        <SampleDocument />
        <div className="camera-corners" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="actions center">
        {captured ? (
          <>
            <Button
              variant="secondary"
              icon={RotateCcw}
              onClick={() => setCaptured(false)}
            >
              Retake
            </Button>
            <Button
              icon={Camera}
              onClick={() => {
                addInput(undefined, {
                  name: 'Sample-estimate-photo.jpg',
                  kind: 'photo',
                });
                navigate('/facts');
              }}
            >
              Use photo
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Cancel
            </Button>
            <button
              className="shutter"
              aria-label="Capture"
              onClick={() => setCaptured(true)}
            >
              <span />
            </button>
          </>
        )}
      </div>
      <p className="small muted text-center">
        Simulated camera. No camera access is requested; this attaches the
        fictional sample document.
      </p>
    </div>
  );
}
