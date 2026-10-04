import {
  Camera,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Mic,
  Paperclip,
  RotateCcw,
  Square,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Disclosure, Notice, Orb } from '../../components/ui';
import {
  addAttachment,
  analyseState,
  appendTranscript,
  attachmentName,
  documentTypeOf,
  jobInput,
  markFailed,
  markRetrying,
  markUploaded,
  MAX_ATTACHMENTS,
  MAX_TEXT_LENGTH,
  removeAttachment,
  type Attachment,
} from '../../domain/composer';
import { emptyCaseRequest } from '../../domain/sample';
import { asApiError, uploadToSlot, type ApiError } from '../../services/api';
import { useApi } from '../../state/auth';
import { useCase } from '../../state/case-store';
import { useVoiceNote, MAX_VOICE_SECONDS } from './use-voice-note';

/** Explicitly fictional, matching the shared regression fixture. Always labeled as sample data. */
export const SAMPLE_DESCRIPTION = `I have dental insurance. My benefit year runs 2026-01-01 to 2026-12-31. The annual maximum is $800 and insurance already paid $500 this year. My deductible is $50 and I haven't met it yet.
The plan pays 80% for basic services and the deductible applies. It pays 50% for major services and the deductible applies.
My dentist recommends two fillings at $250 each and a crown at $1,000. The office is in network, and the allowed amounts equal the charges.
The fillings are planned for 2026-11-10 and 2026-11-11 and the crown for 2026-11-12.`;

const WHAT_TO_MENTION = [
  'What your dentist recommended, and what each part costs',
  'What your plan pays: percentages, annual maximum, deductible',
  'What insurance has already paid this year',
  'When the dentist says it can be done',
];

type Mode = 'speak' | 'upload' | 'photo' | 'type';

/**
 * The composer (same flow as the phone): speak, type and attach up to three pages as a draft,
 * then Analyse once. Pages upload to private storage as they are added, but nothing is analysed
 * until the user asks. The assistant then shows what it understood before anything is used.
 */
export function ComposerPage() {
  const api = useApi();
  const { create } = useCase();
  const navigate = useNavigate();
  const { mode } = useParams<{ mode: Mode }>();
  const [text, setText] = useState('');
  const [isSample, setIsSample] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const created = useRef<Promise<{
    caseId: string;
    caseRevision: number;
  }> | null>(null);
  const nextId = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const cameraPicker = useRef<HTMLInputElement>(null);

  /** One case per visit, created on first use and shared by voice, pages and text. */
  const ensureCase = () => {
    created.current ??= create(emptyCaseRequest()).catch((error: unknown) => {
      created.current = null;
      throw error;
    });
    return created.current;
  };

  const voice = useVoiceNote({
    ensureCase,
    onTranscript: (heard) => {
      setIsSample(false);
      setText((current) => appendTranscript(current, heard));
    },
  });

  const upload = async (attachment: Attachment) => {
    try {
      const { caseId } = await ensureCase();
      const slot = await api.createUpload(caseId, {
        kind: 'document',
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      });
      await uploadToSlot(
        slot,
        new Blob([attachment.file], { type: attachment.mimeType }),
      );
      setAttachments((list) =>
        markUploaded(list, attachment.localId, slot.uploadId),
      );
    } catch (caught) {
      setAttachments((list) =>
        markFailed(list, attachment.localId, asApiError(caught).message),
      );
    }
  };

  const attach = (
    files: FileList | File[] | null,
    kind: Attachment['kind'],
  ) => {
    setFileProblem(null);
    let list = attachments;
    for (const file of Array.from(files ?? [])) {
      const mimeType = documentTypeOf(file.name, file.type);
      if (!mimeType) {
        setFileProblem('Please choose a PDF, JPEG or PNG.');
        continue;
      }
      const added = addAttachment(list, {
        localId: `att-${++nextId.current}`,
        name: attachmentName(
          kind,
          kind === 'document' ? file.name : null,
          list,
        ),
        kind,
        file,
        mimeType,
        sizeBytes: file.size,
      });
      if (!added.ok) {
        setFileProblem(added.problem);
        break;
      }
      list = added.list;
      const attachment = list[list.length - 1];
      if (attachment) void upload(attachment);
    }
    setAttachments(list);
  };

  // Home's buttons say what the user wants to do first; do it on arrival, once.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const timer = setTimeout(() => {
      if (mode === 'speak') voice.start();
      else if (mode === 'upload') filePicker.current?.click();
      else if (mode === 'photo') cameraPicker.current?.click();
      else input.current?.focus();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readiness = analyseState(text, attachments);
  const analyse = async () => {
    if (busy || readiness !== 'ready') return;
    setBusy(true);
    setFailure(null);
    try {
      const { caseId, caseRevision } = await ensureCase();
      const { jobId } = await api.createJob(caseId, {
        expectedRevision: caseRevision,
        operation: 'interpret',
        input: jobInput(text, attachments),
      });
      navigate(`/assistant/${jobId}`, { replace: true });
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  const uploading = attachments.some((a) => a.state === 'uploading');
  const problem = Boolean(
    fileProblem ||
    failure ||
    (voice.message && voice.message.tone !== 'info') ||
    attachments.some((a) => a.state === 'failed'),
  );
  const canAttach =
    attachments.length < MAX_ATTACHMENTS && voice.phase !== 'recording';
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (canAttach) attach(e.dataTransfer.files, 'document');
  };

  return (
    <div
      className={`page medium composer ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (canAttach) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="composer-heading">
        <Orb
          size={128}
          active={voice.phase !== 'idle' || uploading || busy}
          alert={!(voice.phase !== 'idle' || uploading || busy) && problem}
        />
        <h2>Tell me about your treatment</h2>
        <p className="muted">
          Speak, type or add a page. I’ll show you what I understood before
          anything is used.
        </p>
      </div>

      {voice.phase !== 'idle' && (
        <div
          className={`composer-status ${voice.phase === 'recording' ? 'recording' : ''}`}
          role="status"
        >
          {voice.phase === 'recording' ? (
            <span className="record-dot" aria-hidden="true" />
          ) : (
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
          )}
          <span>
            {voice.phase === 'recording'
              ? `Listening · ${voice.seconds}s of ${MAX_VOICE_SECONDS}s. Select Stop when you’re done.`
              : voice.phase === 'uploading'
                ? 'Sending your recording securely…'
                : 'Turning your words into text…'}
          </span>
        </div>
      )}
      {voice.message && (
        <Notice tone={voice.message.tone}>
          <strong>{voice.message.title}</strong>
          {voice.message.body ? (
            <span className="block">{voice.message.body}</span>
          ) : null}
        </Notice>
      )}

      <div className="composer-box">
        {isSample && <Badge>Sample data — fictional</Badge>}
        <label className="visually-hidden" htmlFor="composer-text">
          Describe your treatment and your plan
        </label>
        <textarea
          id="composer-text"
          ref={input}
          rows={7}
          maxLength={MAX_TEXT_LENGTH}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setIsSample(false);
          }}
          placeholder="For example: My dentist recommends a crown for $1,000. My plan pays 50% for major services…"
        />
        {attachments.length > 0 && (
          <ul
            className="attachment-list"
            aria-label={`${attachments.length} of ${MAX_ATTACHMENTS} pages added`}
          >
            {attachments.map((a) => (
              <AttachmentRow
                key={a.localId}
                attachment={a}
                onRemove={() =>
                  setAttachments((list) => removeAttachment(list, a.localId))
                }
                onRetry={() => {
                  setAttachments((list) => markRetrying(list, a.localId));
                  void upload(a);
                }}
              />
            ))}
          </ul>
        )}
        <div className="composer-bar">
          <div className="composer-tools">
            <Button
              variant={voice.phase === 'recording' ? 'danger' : 'secondary'}
              icon={
                voice.busy
                  ? undefined
                  : voice.phase === 'recording'
                    ? Square
                    : Mic
              }
              busy={voice.busy}
              disabled={!voice.supported}
              onClick={voice.toggle}
              aria-label={
                voice.phase === 'recording'
                  ? `Stop recording, ${voice.seconds} seconds`
                  : 'Record a voice note'
              }
            >
              <span className="tool-label">
                {voice.phase === 'recording' ? 'Stop' : 'Speak'}
              </span>
            </Button>
            <Button
              variant="secondary"
              icon={Paperclip}
              disabled={!canAttach}
              onClick={() => filePicker.current?.click()}
              aria-label="Attach a PDF or image"
            >
              <span className="tool-label">Attach</span>
            </Button>
            <Button
              variant="secondary"
              icon={Camera}
              disabled={!canAttach}
              onClick={() => cameraPicker.current?.click()}
              aria-label="Take a photo of a document"
            >
              <span className="tool-label">Photo</span>
            </Button>
          </div>
          <Button
            busy={busy || readiness === 'waiting'}
            disabled={readiness === 'empty' || voice.phase !== 'idle'}
            onClick={() => void analyse()}
          >
            {busy
              ? 'Starting…'
              : readiness === 'waiting'
                ? 'Finishing upload…'
                : 'Analyse'}
          </Button>
        </div>
        <input
          ref={filePicker}
          type="file"
          hidden
          multiple
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => {
            attach(e.target.files, 'document');
            e.target.value = '';
          }}
        />
        <input
          ref={cameraPicker}
          type="file"
          hidden
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={(e) => {
            attach(e.target.files, 'photo');
            e.target.value = '';
          }}
        />
      </div>
      {!voice.supported && (
        <p className="small muted">
          Voice notes aren’t available in this browser. Type instead — it works
          the same way.
        </p>
      )}
      {fileProblem && <Notice tone="warning">{fileProblem}</Notice>}
      {failure && (
        <Notice tone="danger">
          {failure.message}
          {failure.options.requestId
            ? ` Reference: ${failure.options.requestId}`
            : ''}
        </Notice>
      )}

      <Disclosure title="What should I mention?">
        <ul className="hint-list">
          {WHAT_TO_MENTION.map((item) => (
            <li key={item} className="small muted">
              {item}
            </li>
          ))}
        </ul>
        <p className="small muted">
          Anything you leave out, I’ll ask about. Photos are for documents like
          estimates, not your teeth — up to {MAX_ATTACHMENTS} files; for long
          PDFs I read the first 5 pages. You can also drop files onto this page.
        </p>
      </Disclosure>
      <div className="actions">
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setText(SAMPLE_DESCRIPTION);
            setIsSample(true);
          }}
        >
          Use a sample description
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => navigate('/intake/manual')}
        >
          Prefer a form? Enter details step by step
        </button>
      </div>
      <p className="small muted text-center">
        Demo: use made-up details — no names, member IDs or health history. I
        read plan and cost details only and never decide what treatment you
        need.
      </p>
    </div>
  );
}

function AttachmentRow({
  attachment,
  onRemove,
  onRetry,
}: {
  attachment: Attachment;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const Icon = attachment.mimeType.startsWith('image/') ? ImageIcon : FileText;
  const status =
    attachment.state === 'uploading'
      ? 'Uploading…'
      : attachment.state === 'ready'
        ? 'Ready'
        : (attachment.problem ?? 'Upload failed');
  return (
    <li className={`attachment-row ${attachment.state}`}>
      <Icon size={20} aria-hidden="true" />
      <div>
        <strong className="break-word">{attachment.name}</strong>
        <span className="small muted">{status}</span>
      </div>
      {attachment.state === 'uploading' && (
        <LoaderCircle className="spin" size={18} aria-label="Uploading" />
      )}
      {attachment.state === 'failed' && (
        <Button
          variant="ghost"
          icon={RotateCcw}
          aria-label={`Try uploading ${attachment.name} again`}
          onClick={onRetry}
        />
      )}
      <Button
        variant="ghost"
        icon={X}
        aria-label={`Remove ${attachment.name}`}
        onClick={onRemove}
      />
    </li>
  );
}
