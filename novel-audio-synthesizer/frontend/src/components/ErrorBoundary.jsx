import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[SyncTone ErrorBoundary]', error, info);
  }

  componentDidUpdate(prevProps) {
    // Automatically reset error boundary if navigation location or resetKey changed
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    if (typeof this.props.onRetry === 'function') {
      try {
        this.props.onRetry();
      } catch (_) {}
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8 text-center animate-fadeIn" role="alert">
            <div className="w-12 h-12 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] flex items-center justify-center text-2xl shadow-sm">
              📖
            </div>
            <h2 className="text-base font-bold theme-heading uppercase tracking-wide">
              Something went wrong
            </h2>
            <p className="text-sm theme-muted max-w-md leading-relaxed">
              {this.props.friendlyMessage || 'We encountered an unexpected issue in this section. Please try again.'}
            </p>
            {this.state.error?.message && (
              <details className="text-left text-[11px] font-mono text-[var(--text-sub)] mt-1 max-w-md w-full p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl">
                <summary className="cursor-pointer select-none font-bold">Diagnostic info</summary>
                <p className="mt-1 text-[var(--danger)] whitespace-pre-wrap break-words">{this.state.error.message}</p>
              </details>
            )}
            <div className="flex items-center justify-center gap-3 pt-3 flex-wrap">
              <button
                type="button"
                onClick={this.handleRetry}
                className="px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] text-xs font-mono uppercase font-bold rounded-full shadow-md hover:scale-[1.03] active:scale-[0.96] transition-all cursor-pointer"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') window.location.href = '/';
                }}
                className="px-5 py-2.5 border border-[var(--border-strong)] hover:border-[var(--text-main)] text-[var(--text-main)] text-xs font-mono uppercase rounded-full shadow-xs hover:scale-[1.03] active:scale-[0.96] transition-all cursor-pointer"
              >
                Return to Library
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
