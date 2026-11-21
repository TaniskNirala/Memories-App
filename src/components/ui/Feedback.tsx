import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/* ---------------------------------------------------------------------------
   Toasts + confirm dialog primitives used by the redesigned chrome.
   Lightweight, dependency-free, and safe to call from anywhere in the tree.
   --------------------------------------------------------------------------- */

export type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
}

interface FeedbackContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue>({
  toast: () => {},
  confirm: async () => false,
});

let toastSeq = 0;

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setPending({ options, resolve }));
  }, []);

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false);
      if (e.key === 'Enter') settle(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {/* Toast stack */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border px-4 py-2.5 text-xs font-semibold shadow-2xl backdrop-blur-xl fade-in ${
              t.tone === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : t.tone === 'error'
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                  : 'border-[var(--border-color)] bg-[var(--bg-card)]/95 text-[var(--text-primary)]'
            }`}
            role="status"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                t.tone === 'success' ? 'bg-emerald-400' : t.tone === 'error' ? 'bg-rose-400' : 'bg-amber-400'
              }`}
            />
            <span className="line-clamp-2">{t.message}</span>
          </div>
        ))}
      </div>

      {/* Confirm sheet */}
      {pending && (
        <div
          className="scrim z-[130]"
          onClick={(e) => {
            if (e.target === e.currentTarget) settle(false);
          }}
        >
          <div className="modal-panel max-w-sm p-5" role="dialog" aria-modal="true" aria-label={pending.options.title}>
            <h3 className="font-display text-lg leading-snug">{pending.options.title}</h3>
            {pending.options.body && (
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{pending.options.body}</p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => settle(false)}>
                {pending.options.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                autoFocus
                className={`btn btn-sm ${pending.options.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => settle(true)}
              >
                {pending.options.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => useContext(FeedbackContext);
