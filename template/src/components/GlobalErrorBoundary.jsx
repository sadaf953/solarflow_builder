import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { reportError } from '../utils/globalErrors';

const RELOAD_FLAG = 'chunk_auto_reload_done';
// Without sessionStorage we cannot tell whether we already reloaded, so never reload.
function reloadOnce() {
    try {
        if (window.sessionStorage.getItem(RELOAD_FLAG) === 'true') return false;
        window.sessionStorage.setItem(RELOAD_FLAG, 'true');
    } catch {
        return false;
    }
    window.location.reload();
    return true;
}

export default class GlobalErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            copied: false,
        };
    }

    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error, errorInfo) {
        console.error('GLOBAL REACT ERROR:', error);
        console.error('COMPONENT STACK:', errorInfo?.componentStack);

        // Auto-recover if browser tries to load an old chunk after a deployment
        const errorMsg = String(error?.message || '');
        if (
            errorMsg.includes('Failed to fetch dynamically imported module') ||
            errorMsg.includes('Importing a module script failed') ||
            errorMsg.includes('error loading dynamically imported module')
        ) {
            if (reloadOnce()) return;
        }

        this.setState({
            error,
            errorInfo,
        });

        // Report to centralized error logging
        reportError(error, {
            source: 'GlobalErrorBoundary',
            componentStack: errorInfo?.componentStack,
        });
    }

    handleReload = () => {
        window.location.reload();
    };

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            copied: false,
        });
    };

    handleCopy = () => {
        const isDev = import.meta.env.DEV;
        let payload = `Error: ${this.state.error?.message || 'Unknown'}`;
        if (isDev) {
            payload += `\n\nStack:\n${this.state.error?.stack || 'No stack'}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || 'No component stack'}`;
        }
        navigator.clipboard.writeText(payload).then(() => {
            this.setState({ copied: true });
            setTimeout(() => this.setState({ copied: false }), 2000);
        }).catch(() => {});
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const error = this.state.error;
        const errorInfo = this.state.errorInfo;

        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4 sm:p-6 font-sans">
                <div className="w-full max-w-3xl bg-white border border-red-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in duration-200">
                    
                    {/* Header */}
                    <div className="px-6 py-5 border-b border-red-100 bg-red-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shadow-sm">
                                <AlertTriangle size={20} aria-hidden="true" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-red-950">
                                    Something went wrong
                                </h1>
                                <p className="text-xs text-red-700 font-medium mt-0.5">
                                    This screen hit an unexpected error. Reload to carry on; your saved work is safe.
                                </p>
                            </div>
                        </div>
                        <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-red-100 text-red-800 font-medium">
                            {new Date().toLocaleTimeString()}
                        </span>
                    </div>

                    {/* Body */}
                    <div className="p-6 space-y-5">
                        
                        {/* Error Message */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                                    Error Message
                                </span>
                                <button
                                    onClick={this.handleCopy}
                                    className="min-h-11 px-2 text-xs text-stone-500 hover:text-stone-900 font-medium flex items-center gap-1 transition-colors"
                                >
                                    {this.state.copied ? 'Copied' : 'Copy error details'}
                                </button>
                            </div>
                            <div className="bg-stone-950 text-red-300 rounded-xl p-4 overflow-x-auto border border-stone-800 shadow-inner font-mono text-xs leading-relaxed">
                                <p className="font-semibold text-red-400 mb-1">{error?.name || 'Error'}:</p>
                                <pre className="whitespace-pre-wrap break-words">{error?.message || 'Unknown error occurred.'}</pre>
                            </div>
                        </div>

                        {/* Component Stack (Dev only) */}
                        {import.meta.env.DEV && errorInfo?.componentStack && (
                            <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5 block">
                                    Component Stack
                                </span>
                                <div className="bg-stone-100 text-stone-700 rounded-xl p-4 overflow-y-auto max-h-48 border border-stone-200 font-mono text-[11px] leading-relaxed">
                                    <pre className="whitespace-pre-wrap break-words">{errorInfo.componentStack}</pre>
                                </div>
                            </div>
                        )}

                        {/* Technical Stack Trace (Dev only) */}
                        {import.meta.env.DEV && error?.stack && (
                            <details className="group">
                                <summary className="cursor-pointer text-xs font-semibold text-stone-600 hover:text-stone-900 select-none py-1 flex items-center gap-1.5">
                                    <span className="transition-transform group-open:rotate-90 text-[10px]">▶</span>
                                    <span>View Full Technical Stack Trace</span>
                                </summary>
                                <div className="mt-2 bg-stone-100 text-stone-600 rounded-xl p-4 overflow-y-auto max-h-56 border border-stone-200 font-mono text-[11px] leading-relaxed">
                                    <pre className="whitespace-pre-wrap break-words">{error.stack}</pre>
                                </div>
                            </details>
                        )}

                        {/* Actions */}
                        <div className="pt-3 border-t border-stone-100 flex flex-wrap gap-3">
                            <button
                                onClick={this.handleReload}
                                className="min-h-11 px-5 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 active:scale-[0.99] transition shadow-sm"
                            >
                                Reload
                            </button>
                            <button
                                onClick={this.handleReset}
                                className="min-h-11 px-5 py-2.5 rounded-xl bg-stone-100 text-stone-700 hover:bg-stone-200 text-xs font-semibold border border-stone-200 transition"
                            >
                                Try again
                            </button>
                            <button
                                onClick={() => window.location.href = window.location.origin}
                                className="min-h-11 px-5 py-2.5 rounded-xl bg-white text-stone-600 hover:bg-stone-50 text-xs font-medium border border-stone-200 transition ml-auto"
                            >
                                Go to home
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        );
    }
}
