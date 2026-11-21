import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Nest crashed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="app-shell items-center justify-center p-4">
        <div className="surface card-glow w-full max-w-md p-6 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <p className="eyebrow">Something slipped</p>
          <h1 className="mt-1.5 font-display text-xl leading-tight">This screen hit a snag</h1>
          <p className="mx-auto mt-2 max-w-xs text-[12px] leading-relaxed text-[var(--text-muted)]">
            Nothing was lost — your memories are safe on the server. Reload to pick up where you left off.
          </p>

          {this.state.error?.message && (
            <pre className="mt-4 max-h-24 overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-left font-mono text-[10px] leading-relaxed text-[var(--text-muted)]">
              {this.state.error.message}
            </pre>
          )}

          <div className="mt-5 flex items-center justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className="btn btn-primary btn-sm">
              <RefreshCw className="h-3.5 w-3.5" /> Reload app
            </button>
            <button type="button" onClick={() => this.setState({ hasError: false })} className="btn btn-soft btn-sm">
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
