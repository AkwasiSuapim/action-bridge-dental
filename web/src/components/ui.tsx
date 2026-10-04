import {
  ArrowRight,
  Check,
  ChevronDown,
  Info,
  LoaderCircle,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

export function Button({
  children,
  variant = 'primary',
  icon: Icon,
  busy,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: LucideIcon;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy}
      className={`button ${variant} ${className}`}
    >
      {busy ? (
        <LoaderCircle className="spin" size={18} aria-hidden="true" />
      ) : Icon ? (
        <Icon size={18} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'warning' | 'assumed';
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'danger';
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Info size={19} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const describe = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (node) => {
      if (!isValidElement<{ children?: ReactNode }>(node)) return node;
      if (
        typeof node.type === 'string' &&
        ['input', 'textarea', 'select'].includes(node.type)
      ) {
        return cloneElement(node, {
          id,
          'aria-describedby': error || hint ? `${id}-help` : undefined,
          'aria-invalid': !!error,
        } as Record<string, unknown>);
      }
      return node.props.children
        ? cloneElement(node, {}, describe(node.props.children))
        : node;
    });
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {describe(children)}
      {error ? (
        <span id={`${id}-help`} className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-help`} className="field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
export function Row({
  label,
  value,
  strong = false,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={`value-row ${strong ? 'strong' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
export function Disclosure({
  title,
  children,
  open,
}: {
  title: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="disclosure" open={open}>
      <summary>
        {title}
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description: string;
  action: ReactNode;
  icon: LucideIcon;
}) {
  return (
    <Card className="empty-state">
      <div className="icon-tile">
        <Icon size={28} aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {action}
    </Card>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  drawer = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    opener.current ??=
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    el?.showModal();
    return () => {
      el?.close();
      if (opener.current?.isConnected)
        opener.current.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={`dialog ${drawer ? 'drawer' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-heading">
        <h2 id={id}>{title}</h2>
        <Button
          variant="ghost"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>
      <div className="stack">{children}</div>
    </dialog>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <svg viewBox="0 0 40 40" width="31" height="31" aria-hidden="true">
        <path
          d="M19 24C11 24 5.5 18.5 5 9.5c8.5.2 14 5.2 14 14.5Z"
          fill="#69FFA5"
        />
        <path
          d="M21 24c0-9.3 5.5-14.3 14-14.5-.5 9-6 14.5-14 14.5Z"
          fill="#31E981"
        />
        <path
          d="M6 33.5c3.8-5 8.5-7.5 14-7.5s10.2 2.5 14 7.5"
          stroke="#31E981"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <div className={compact ? 'brand-text compact' : 'brand-text'}>
        <strong>ActionBridge</strong>
        <span>Dental</span>
      </div>
    </div>
  );
}
export function Orb({
  size = 260,
  active = false,
  success = false,
  alert = false,
}: {
  size?: number;
  active?: boolean;
  success?: boolean;
  alert?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const tint = alert ? '#FFC46B' : '#31E981';
  return (
    <div
      className={`orb ${active ? 'active' : ''} ${alert ? 'alert' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 200">
        <defs>
          <radialGradient id={`core${id}`}>
            <stop offset="0" stopColor={tint} stopOpacity=".24" />
            <stop offset="1" stopColor={tint} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`ring${id}`}>
            <stop stopColor="#B4FFD3" />
            <stop offset=".5" stopColor={tint} stopOpacity=".5" />
            <stop offset="1" stopColor={tint} />
          </linearGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r="99"
          fill={`url(#core${id})`}
          stroke={tint}
          strokeOpacity=".08"
        />
        <circle
          cx="100"
          cy="100"
          r="82"
          fill="none"
          stroke={tint}
          strokeOpacity=".1"
        />
        <g className="orb-rings">
          {[0, 60, 120].map((angle) => (
            <g key={angle} transform={`rotate(${angle} 100 100)`}>
              <ellipse
                cx="100"
                cy="100"
                rx="68"
                ry="40"
                fill="none"
                stroke={tint}
                strokeOpacity=".06"
                strokeWidth="12"
              />
              <ellipse
                cx="100"
                cy="100"
                rx="68"
                ry="40"
                fill="none"
                stroke={`url(#ring${id})`}
                strokeWidth="1.6"
              />
            </g>
          ))}
        </g>
        <g className="orb-rings reverse" opacity=".45">
          {[30, 90, 150].map((angle) => (
            <ellipse
              key={angle}
              transform={`rotate(${angle} 100 100)`}
              cx="100"
              cy="100"
              rx="58"
              ry="34"
              fill="none"
              stroke={`url(#ring${id})`}
              strokeWidth="1.3"
            />
          ))}
        </g>
      </svg>
      {success && <Check size={48} className="orb-symbol" />}
      {alert && <Info size={42} className="orb-symbol" />}
    </div>
  );
}
export function FooterActions({
  children,
  note,
}: {
  children: ReactNode;
  note?: string;
}) {
  return (
    <div className="footer-actions">
      {note && <p className="muted small">{note}</p>}
      <div className="actions">{children}</div>
    </div>
  );
}
export function ContinueButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button {...props}>
      {children}
      <ArrowRight size={18} aria-hidden="true" />
    </Button>
  );
}
