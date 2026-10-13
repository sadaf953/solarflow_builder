// Shared frame for the phone-first portals (partner/dealer and installer):
// the sticky header with the account actions, and the dark welcome card.

import { KeyRound, LogOut, RefreshCw } from 'lucide-react';
import BrandMark from '../BrandMark';

const ICON_BUTTON = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50';

/**
 * "Change password" and "Log out". `onBeforeLeave` runs before logging out
 * and may return false to stay (for example after offering to save edits).
 */
export function AccountActions({ onLogout, onChangePassword, onBeforeLeave }) {
    const logout = async () => {
        if (onBeforeLeave && !(await onBeforeLeave())) return;
        onLogout?.();
    };
    return (
        <>
            {onChangePassword && (
                <button type="button" onClick={onChangePassword} className={ICON_BUTTON} aria-label="Change password" title="Change password">
                    <KeyRound size={16} aria-hidden="true" />
                </button>
            )}
            <button type="button" onClick={logout} className={`${ICON_BUTTON} hover:text-red-600`} aria-label="Log out" title="Log out">
                <LogOut size={16} aria-hidden="true" />
            </button>
        </>
    );
}

/**
 * Sticky portal header. `leading` replaces the brand mark (e.g. a menu button
 * and page title); `onRefresh` adds a refresh button that spins while `refreshing`.
 */
export function PortalHeader({
    label, leading, user, showEmail = false, onRefresh, refreshing = false, refreshLabel = 'Refresh',
    onLogout, onChangePassword, onBeforeLeave, className = '',
}) {
    return (
        <header className={`sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-stone-100 bg-white px-4 py-1.5 shadow-sm ${className}`}>
            <div className="flex min-w-0 items-center gap-3">{leading ?? <BrandMark label={label} />}</div>
            <div className="flex shrink-0 items-center gap-1">
                {user?.name && (
                    <div className="mr-1 hidden min-w-0 text-right min-[380px]:block">
                        <span className="block max-w-[140px] truncate text-xs font-bold text-stone-800">{user.name}</span>
                        {showEmail && user.email && <span className="block max-w-[140px] truncate text-[10px] font-medium text-stone-500">{user.email}</span>}
                    </div>
                )}
                {onRefresh && (
                    <button type="button" onClick={onRefresh} disabled={refreshing} className={ICON_BUTTON} aria-label={refreshLabel} title={refreshLabel}>
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
                    </button>
                )}
                <AccountActions onLogout={onLogout} onChangePassword={onChangePassword} onBeforeLeave={onBeforeLeave} />
            </div>
        </header>
    );
}

/** Full-page portal layout: header plus a centred, phone-width column. */
export function MobilePortalShell({ children, mainClassName = 'max-w-md', ...headerProps }) {
    return (
        <div className="flex min-h-screen flex-col bg-[#FCFBFA] pb-8 font-sans text-stone-800">
            <PortalHeader {...headerProps} />
            <main className={`mx-auto w-full flex-1 space-y-4 p-4 ${mainClassName}`}>{children}</main>
        </div>
    );
}

/** The dark welcome card at the top of a portal home screen. */
export function PortalHero({ kicker, title, aside, actions, children }) {
    return (
        <section className="relative overflow-hidden rounded-[24px] bg-stone-950 px-5 py-6 text-white shadow-lg shadow-stone-900/10">
            <div className="absolute -right-10 -top-12 h-52 w-52 rounded-full bg-amber-400/20 blur-2xl" aria-hidden="true" />
            <div className="absolute -bottom-16 right-24 h-40 w-40 rounded-full border-[18px] border-amber-400/10" aria-hidden="true" />
            <div className="relative">
                <div className="flex items-start justify-between gap-2">
                    {kicker && <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">{kicker}</p>}
                    {aside}
                </div>
                <h2 className="mt-2 break-words text-2xl font-black tracking-tight">{title}</h2>
                {children && <p className="mt-2 text-sm font-medium leading-relaxed text-stone-300">{children}</p>}
                {actions && <div className="mt-5 flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
        </section>
    );
}
