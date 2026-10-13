// ─── Global Error Handling & Reporting ─────────────────────────────────────────
import { supabase } from '../supabase';

/**
 * Sets up global browser listeners for uncaught errors and unhandled promise rejections.
 */
export function setupGlobalErrorHandling() {
    if (typeof window === 'undefined') return;

    // Window Error Listener (uncaught synchronous errors & resource errors)
    window.addEventListener('error', (event) => {
        console.error('🚨 GLOBAL JAVASCRIPT ERROR:', {
            message: event.message,
            filename: event.filename,
            line: event.lineno,
            column: event.colno,
            error: event.error,
            timestamp: new Date().toISOString(),
            url: window.location.href,
        });
    });

    // Unhandled Promise Rejection Listener (async / network / Supabase errors)
    window.addEventListener('unhandledrejection', (event) => {
        console.error('🚨 UNHANDLED PROMISE REJECTION:', {
            reason: event.reason,
            timestamp: new Date().toISOString(),
            url: window.location.href,
        });
    });
}

/**
 * Central error reporter to be used across components, hooks, and services.
 * 
 * @param {Error|string|any} error - The error object or message
 * @param {Object} [context={}] - Additional metadata (e.g. { action: 'customer_search', userId, page: 'CustomerDetails' })
 */
export function reportError(error, context = {}) {
    const errorDetails = {
        name: error?.name || 'Error',
        message: error?.message || String(error),
        stack: error?.stack || null,
        context,
        timestamp: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : '',
    };

    console.error('🚨 APP ERROR:', errorDetails);

    // Optional: Log to activity_log table if user_id is provided in context or localStorage
    try {
        let userId = context.userId || null;
        if (!userId && typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    try {
                        const parsed = JSON.parse(sessionStorage.getItem(key));
                        userId = parsed?.user?.id || null;
                        break;
                    } catch { /* not valid JSON, skip this key */ }
                }
            }
        }

        if (userId && supabase) {
            supabase.from('activity_log').insert({
                user_id: userId,
                action: 'error_occurred',
                message: `[${context.action || 'system'}] ${errorDetails.message}`.slice(0, 255),
                new_value: JSON.stringify({
                    error: errorDetails.message,
                    context,
                    stack: errorDetails.stack ? errorDetails.stack.slice(0, 1000) : null
                }),
                created_at: new Date().toISOString()
            }).then(({ error: dbErr }) => {
                if (dbErr) {
                    // Silent fail to avoid infinite error loop
                }
            }).catch(() => {});
        }
    } catch {
        // Silent catch for error logging failure
    }
}
