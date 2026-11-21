import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Search } from 'lucide-react';
import { initials, avatarGradient } from '../../lib/format.ts';

/* ---------------------------------------------------------------------------
   UI kit — one consistent set of surfaces, overlays and controls.
   Every component is theme-token driven, so light/dark switch instantly.
   --------------------------------------------------------------------------- */

type Tone = 'amber' | 'coral' | 'mint' | 'indigo' | 'neutral';

const toneVar: Record<Tone, string> = {
  amber: 'var(--accent-amber)',
  coral: 'var(--accent-coral)',
  mint: 'var(--accent-teal)',
  indigo: 'var(--accent-indigo)',
  neutral: 'var(--text-muted)',
};

/* ----------------------------------------------------------------- Avatar */

export const Avatar: React.FC<{
  name?: string;
  color?: string;
  /** Uploaded profile photo — takes over from the initials when present */
  src?: string;
  size?: number;
  ring?: boolean;
  className?: string;
  title?: string;
}> = ({ name, color, src, size = 34, ring = false, className = '', title }) => {
  const label = initials(name);
  const bg = avatarGradient(color, name);
  return (
    <span
      title={title || name}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold uppercase tracking-tight text-white ${
        ring ? 'avatar-ring' : ''
      } ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: bg, boxShadow: '0 1px 0 rgba(255,255,255,0.28) inset' }}
      />
      {src ? (
        <img
          src={src}
          alt={name || 'avatar'}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ borderRadius: 999 }}
          /* a missing/corrupt file must fall back to the colour initials */
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <span className="relative z-10 leading-none">{label}</span>
      )}
    </span>
  );
};

/* ----------------------------------------------------------------- Badge */

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}> = ({ children, tone = 'neutral', dot = false, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.08em] ${className}`}
    style={{
      color: tone === 'neutral' ? 'var(--text-secondary)' : toneVar[tone],
      borderColor: `color-mix(in oklab, ${toneVar[tone]} 32%, transparent)`,
      background: `color-mix(in oklab, ${toneVar[tone]} 12%, transparent)`,
    }}
  >
    {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneVar[tone] }} />}
    {children}
  </span>
);

/* ----------------------------------------------------------------- Modal */

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  label?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  panelClassName?: string;
  showClose?: boolean;
}> = ({ open, onClose, children, label, size = 'md', panelClassName = '', showClose = false }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  };

  return createPortal(
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`modal-panel ${widths[size]} max-h-[92dvh] overflow-y-auto ${panelClassName}`}
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-icon absolute right-3 top-3 z-20 !h-8 !w-8"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
};

export const ModalHeader: React.FC<{
  icon?: React.ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  right?: React.ReactNode;
}> = ({ icon, eyebrow, title, subtitle, onClose, right }) => (
  <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
    <div className="flex min-w-0 items-start gap-3">
      {icon && (
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--accent-amber)]">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="truncate font-display text-lg leading-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-1.5">
      {right}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className="btn-icon !h-8 !w-8">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  </div>
);

/* --------------------------------------------------------------- Segmented */

export const Segmented = <T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T;
  onChange: (next: T) => void;
  options: { id: T; label: string; icon?: React.ReactNode }[];
  className?: string;
}) => (
  <div
    className={`inline-flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)]/70 p-1 backdrop-blur-md ${className}`}
  >
    {options.map((o) => {
      const active = o.id === value;
      return (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={active}
          className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
            active
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.6)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {active && (
            <span
              className="absolute inset-x-2 -bottom-px h-px"
              style={{ background: 'linear-gradient(90deg, transparent, var(--accent-amber), transparent)' }}
            />
          )}
          {o.icon}
          {o.label}
        </button>
      );
    })}
  </div>
);

/* --------------------------------------------------------------- Dropdown */

export const Dropdown: React.FC<{
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (props: { close: () => void }) => React.ReactNode;
  align?: 'left' | 'right';
  width?: number;
  className?: string;
}> = ({ trigger, children, align = 'right', width = 240, className = '' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          style={{ width }}
          className={`absolute z-[70] mt-2 overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]/97 p-1.5 shadow-[var(--shadow-float)] backdrop-blur-2xl fade-in ${
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
          }`}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ Items */

export const MenuItem: React.FC<{
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'accent';
  active?: boolean;
}> = ({ icon, label, hint, onClick, tone = 'default', active = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] font-medium transition ${
      tone === 'danger'
        ? 'text-rose-400 hover:bg-rose-500/10'
        : tone === 'accent'
          ? 'text-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/10'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
    } ${active ? 'bg-[var(--bg-surface)]' : ''}`}
  >
    {icon && <span className="shrink-0 opacity-90">{icon}</span>}
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {hint && <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{hint}</span>}
  </button>
);

/* ------------------------------------------------------------------ Empty */

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}> = ({ icon, title, body, action, compact = false, className = '' }) => (
  <div
    className={`relative overflow-hidden rounded-[26px] border border-dashed border-[var(--border-color)] bg-[var(--bg-card)]/60 text-center ${
      compact ? 'px-5 py-7' : 'px-6 py-12'
    } ${className}`}
  >
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-60"
      style={{
        background:
          'radial-gradient(420px 220px at 50% -30%, color-mix(in oklab, var(--accent-amber) 16%, transparent), transparent 70%)',
      }}
    />
    {icon && (
      <div className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--accent-amber)]">
        {icon}
      </div>
    )}
    <h3 className="relative font-display text-base">{title}</h3>
    {body && (
      <p className="relative mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-[var(--text-muted)]">{body}</p>
    )}
    {action && <div className="relative mt-4 flex justify-center gap-2">{action}</div>}
  </div>
);

/* ------------------------------------------------------------------ Stats */

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}> = ({ label, value, hint, tone = 'amber', icon }) => (
  <div className="surface relative overflow-hidden p-3.5">
    <div
      aria-hidden
      className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full blur-2xl"
      style={{ background: `color-mix(in oklab, ${toneVar[tone]} 28%, transparent)` }}
    />
    <div className="relative flex items-center justify-between">
      <span className="eyebrow">{label}</span>
      {icon && <span style={{ color: toneVar[tone] }}>{icon}</span>}
    </div>
    <p className="relative mt-1.5 font-display text-xl leading-none tabular-nums">{value}</p>
    {hint && <p className="relative mt-1 text-[10px] text-[var(--text-muted)]">{hint}</p>}
  </div>
);

/* -------------------------------------------------------------- Skeletons */

export const SkeletonCard: React.FC = () => (
  <div className="card overflow-hidden p-4">
    <div className="flex items-center gap-3">
      <div className="shimmer h-9 w-9 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="shimmer h-2.5 w-28 rounded-full" />
        <div className="shimmer h-2 w-40 rounded-full" />
      </div>
    </div>
    <div className="shimmer mt-4 aspect-16/9 w-full rounded-2xl" />
    <div className="mt-3 space-y-2">
      <div className="shimmer h-2.5 w-3/4 rounded-full" />
      <div className="shimmer h-2.5 w-1/3 rounded-full" />
    </div>
  </div>
);

/* --------------------------------------------------------------- SearchBox */

export const SearchBox: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search…', className = '' }) => (
  <div className={`relative ${className}`}>
    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="field !py-2.5 pl-10 pr-9 text-[12.5px]"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="Clear search"
        className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);

/* ------------------------------------------------------------- ScrollChips */

export const ScrollChips: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`scroll-x -mx-1 flex items-center gap-1.5 px-1 pb-0.5 ${className}`}>{children}</div>
);

/* ------------------------------------------------------------ ExpandToggle */

export const Collapsible: React.FC<{
  open: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ open, children, className = '' }) =>
  open ? <div className={`fade-in ${className}`}>{children}</div> : null;

/* ------------------------------------------------------------ SectionHead */

export const PageHero: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  accent?: Tone;
  aside?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, actions, accent = 'amber', aside }) => {
  const gradient = useMemo(
    () =>
      `radial-gradient(680px 240px at 4% -40%, color-mix(in oklab, ${toneVar[accent]} 22%, transparent), transparent 72%), radial-gradient(520px 220px at 92% -60%, color-mix(in oklab, ${
        accent === 'coral' ? toneVar.amber : toneVar.coral
      } 16%, transparent), transparent 70%)`,
    [accent]
  );

  const text = (
    <div className="min-w-0">
      {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
      <h1 className="font-display text-[1.6rem] leading-[1.12] tracking-tight sm:text-[2rem]">{title}</h1>
      {subtitle && (
        <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-[var(--text-secondary)]">{subtitle}</p>
      )}
    </div>
  );

  const cluster = (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {aside}
      {actions}
    </div>
  );

  return (
    <header className="relative overflow-hidden rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-card)]/70 px-5 py-5 backdrop-blur-xl sm:px-6 sm:py-6">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: gradient }} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, var(--border-color), transparent)' }}
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        {text}
        {cluster}
      </div>
    </header>
  );
};

/* --------------------------------------------------------------- Divider */

export const Dot: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span aria-hidden className={`inline-block h-1 w-1 rounded-full bg-[var(--text-muted)]/60 ${className}`} />
);

export const Chevron: React.FC<{ open?: boolean; className?: string }> = ({ open, className = '' }) => (
  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''} ${className}`} />
);
