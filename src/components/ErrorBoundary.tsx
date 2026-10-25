import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react';
import { tr } from '../lib/i18n';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  handleCopy = () => {
    const errorDetails = `Error: ${this.state.error?.message}\n\nStack:\n${this.state.error?.stack || 'N/A'}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || 'N/A'}`;
    navigator.clipboard?.writeText(errorDetails).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || tr('Something went wrong');
      const errorMessage = this.state.error?.message || tr('An unexpected error occurred.');

      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center select-text">
          <div className="max-w-md w-full bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-2xl text-left">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white tracking-wide">{title}</h3>
                <p className="text-xs text-white/50">{tr('The application caught an issue instead of crashing.')}</p>
              </div>
            </div>

            <div className="bg-black/40 border border-white/5 rounded-xl p-3 mb-4 max-h-40 overflow-y-auto">
              <p className="text-xs font-mono text-red-300 break-words">{errorMessage}</p>
              {this.state.error?.stack && (
                <pre className="text-[10px] font-mono text-white/40 mt-2 whitespace-pre-wrap leading-tight">
                  {this.state.error.stack.split('\n').slice(0, 6).join('\n')}
                </pre>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs tracking-wider transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw size={14} />
                {tr('Try Again')}
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="py-2 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-xs tracking-wider transition-colors"
              >
                {tr('Reload Page')}
              </button>
              <button
                type="button"
                onClick={this.handleCopy}
                className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-medium text-xs transition-colors flex items-center gap-1.5"
                title={tr('Copy error details')}
              >
                {this.state.copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {this.state.copied ? tr('Copied') : tr('Copy')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
