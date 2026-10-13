// Dashboard sidebar, built from the view registry and the client's pipeline.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, KeyRound, LogOut, X } from 'lucide-react';
import { STAGE_BY_ID, STAGE_GROUPS } from '../config/index.js';
import BrandMark from '../components/BrandMark';
import { viewLabel, viewsInGroup } from './views.js';

const SECTION_HEADING = 'px-3 pt-4 pb-1 text-[10px] uppercase font-bold text-stone-500 tracking-widest';

function NavButton({ icon: Icon, label, count, redBadge, active, onClick }) {
    return (
        <button
            type="button" aria-current={active ? 'page' : undefined} onClick={onClick}
            className={`w-full min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold mb-0.5 transition-colors cursor-pointer ${active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
        >
            <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left truncate">{label}</span>
            {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full min-w-[20px] text-center font-bold ${active ? 'bg-white/20 text-white' : redBadge ? 'bg-red-100 text-red-500' : 'bg-stone-100 text-stone-500'}`}>
                    {count}
                </span>
            )}
        </button>
    );
}

function SidebarGroup({ id, label, active, children }) {
    const [open, setOpen] = useState(active);
    useEffect(() => { if (active) setOpen(true); }, [active]);
    const panelId = `nav-${id}`;
    return (
        <div className="pt-2">
            <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-3 rounded-lg text-xs font-semibold text-left hover:bg-stone-100 ${active ? 'text-[#ff8a00]' : 'text-stone-600'}`}>
                <span>{label}{!open && active && <span className="ml-2 text-[#ff8a00]" aria-hidden="true">•</span>}</span>
                <ChevronDown aria-hidden="true" className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            <div id={panelId} hidden={!open} className="ml-2 pl-1 border-l border-stone-200">{children}</div>
        </div>
    );
}

// On phones the open sidebar is a modal panel: focus stays inside, Esc closes it.
function useDrawerFocus(open, panelRef, onClose) {
    useEffect(() => {
        if (!open || window.matchMedia('(min-width: 768px)').matches) return;
        const panel = panelRef.current;
        const previousFocus = document.activeElement;
        const main = panel.parentElement.querySelector('main');
        main?.setAttribute('inert', '');
        const controls = () => [...panel.querySelectorAll('button, a[href], [tabindex]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
        controls()[0]?.focus();
        const onKeyDown = event => {
            if (event.key === 'Escape') { event.preventDefault(); onClose(); }
            if (event.key !== 'Tab') return;
            const items = controls(), first = items[0], last = items.at(-1);
            if (!panel.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        const onResize = () => { if (window.matchMedia('(min-width: 768px)').matches) onClose(); };
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onResize);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', onResize);
            main?.removeAttribute('inert');
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [open, panelRef, onClose]);
}

/**
 * ctx: the same object the views get (counts read metrics and trashCount).
 * onOpenView(id) / onOpenStage(stageId) navigate; the sidebar closes itself on phones.
 */
export default function Sidebar({ user, ctx, currentView, selectedStage, stageCounts, open, onClose, onOpenView, onOpenStage, onLogout, onChangePassword }) {
    const panelRef = useRef(null);
    useDrawerFocus(open, panelRef, onClose);

    const isAdmin = user.userType === 'admin';
    const go = id => { onOpenView(id); onClose(); };
    const renderView = view => (
        <NavButton key={view.id} icon={view.icon} label={viewLabel(view, user)} count={view.count?.(ctx) || 0}
            redBadge={view.redBadge} active={currentView === view.id} onClick={() => go(view.id)} />
    );
    const main = viewsInGroup('main', user);
    const tracking = viewsInGroup('tracking', user);
    const team = viewsInGroup('team', user);
    const admin = viewsInGroup('admin', user);
    const activeIn = views => views.some(view => view.id === currentView);

    return (
        <>
            {open && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={onClose} aria-hidden="true" />}
            <aside ref={panelRef} role={open ? 'dialog' : undefined} aria-modal={open || undefined} aria-label="Main navigation"
                className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white border-r border-stone-100 flex-col h-screen max-h-screen overflow-hidden ${open ? 'flex' : 'hidden'} md:flex`}>
                <div className="p-5 border-b border-stone-100 flex justify-between items-center shrink-0">
                    <BrandMark size="md" />
                    <button type="button" aria-label="Close navigation" className="md:hidden flex h-11 w-11 items-center justify-center text-stone-400" onClick={onClose}><X className="w-5 h-5" /></button>
                </div>

                <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-0.5">
                    {main.map(renderView)}

                    {tracking.length > 0 && (
                        <SidebarGroup id="tracking" label="Tracking & logistics" active={activeIn(tracking)}>{tracking.map(renderView)}</SidebarGroup>
                    )}

                    <p className={SECTION_HEADING}>Project workflow</p>
                    {STAGE_GROUPS.map(group => {
                        const stages = group.stages.map(id => STAGE_BY_ID[id]).filter(Boolean);
                        return (
                            <SidebarGroup key={group.id} id={`stages-${group.id}`} label={group.label}
                                active={currentView === 'stages' && group.stages.includes(selectedStage)}>
                                {stages.map(stage => (
                                    <NavButton key={stage.id} icon={stage.icon} label={stage.label} count={stageCounts[stage.id] || 0}
                                        active={currentView === 'stages' && selectedStage === stage.id}
                                        onClick={() => { onOpenStage(stage.id); onClose(); }} />
                                ))}
                            </SidebarGroup>
                        );
                    })}

                    {isAdmin && (team.length > 0 || admin.length > 0) && (
                        <div className="pt-2">
                            <p className={SECTION_HEADING}>Systems</p>
                            {team.length > 0 && <SidebarGroup id="team" label="Team & administration" active={activeIn(team)}>{team.map(renderView)}</SidebarGroup>}
                            {admin.map(renderView)}
                        </div>
                    )}
                    {!isAdmin && team.length > 0 && (
                        <div className="pt-2">
                            <p className={SECTION_HEADING}>Self service</p>
                            {team.map(renderView)}
                        </div>
                    )}
                    {!isAdmin && admin.length > 0 && (
                        <div className="pt-2">
                            <p className={SECTION_HEADING}>Partner office</p>
                            {admin.map(renderView)}
                        </div>
                    )}
                </nav>

                <div className="p-3 border-t border-stone-100 shrink-0 bg-white">
                    <div className="flex items-center gap-3 px-3 py-2 mb-1">
                        <div className="w-8 h-8 bg-stone-900 rounded-full flex items-center justify-center text-white text-xs font-bold" aria-hidden="true">
                            {user.name?.split(' ').map(part => part[0]).join('').slice(0, 2) || 'A'}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-stone-700 truncate">{user.name}</p>
                            <p className="text-[10px] text-stone-500 truncate">{user.role}</p>
                        </div>
                    </div>
                    {onChangePassword && (
                        <button type="button" onClick={() => { onClose(); onChangePassword(); }}
                            className="w-full min-h-11 flex items-center gap-2 px-3 py-2 text-stone-600 hover:bg-stone-100 rounded-xl text-xs font-semibold transition-colors cursor-pointer">
                            <KeyRound className="w-4 h-4" aria-hidden="true" /> Change password
                        </button>
                    )}
                    <button type="button" onClick={onLogout}
                        className="w-full min-h-11 flex items-center gap-2 px-3 py-2 text-red-500 hover:bg-red-50 rounded-xl text-xs font-semibold transition-colors cursor-pointer">
                        <LogOut className="w-4 h-4" aria-hidden="true" /> Logout
                    </button>
                </div>
            </aside>
        </>
    );
}

