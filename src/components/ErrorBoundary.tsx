import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Nest uncaught application error:', error, errorInfo);
  }

  private handleReset = async () => {
    try {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      if (typeof window !== 'undefined' && 'caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) {
          await caches.delete(k);
        }
      }
    } catch {}
    this.setState({ hasError: false, error: null });
    window.location.href = window.location.origin + window.location.pathname + '?reload=' + Date.now();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0c0e1a] text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-[#17172e] border border-[#2b2b52] shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="font-bold text-xl text-white">Something went wrong</h2>
            <p className="text-xs text-neutral-400 leading-relaxed">
              We encountered an issue loading Nest. You can reload the application to restore your session.
            </p>
            {this.state.error?.message && (
              <pre className="p-3 rounded-xl bg-black/40 text-[10px] text-rose-300 font-mono text-left overflow-x-auto max-h-24">
                {this.state.error.message}
              </pre>
            )}
            <div className="pt-2">
              <button
                onClick={this.handleReset}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-95 text-white font-semibold text-xs transition flex items-center justify-center gap-2 mx-auto shadow-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reload Nest</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
