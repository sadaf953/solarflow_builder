import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, MessageSquare, Send, Trash2, Users, X } from 'lucide-react';
import { supabase } from '../supabase';
import { formatDate } from '../lib/format.js';
import { ErrorBanner, Spinner } from '../ui/index.js';
import { useGlobalPopup } from './GlobalPopup';

const TAGS = ['General', 'Dispatch', 'Installation', 'Discom', 'Urgent'];
const PRESETS = ['Dispatch on the way', 'Site work finished', 'Site inspection delayed'];
const HISTORY = 200;
const COLUMNS = 'id, sender_id, sender_name, sender_role, user_type, text, tag, created_at';

export default function TeamChatDrawer({ currentUser }) {
    const { showConfirm } = useGlobalPopup();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filterTag, setFilterTag] = useState('All');
    const [draft, setDraft] = useState('');
    const [tag, setTag] = useState('General');
    const [sending, setSending] = useState(false);
    const [unread, setUnread] = useState(0);
    const openRef = useRef(false);
    const endRef = useRef(null);
    const inputRef = useRef(null);
    const launcherRef = useRef(null);
    const myId = currentUser?.id;
    const canDeleteAny = currentUser?.userType === 'admin';

    const addMessage = useCallback(row => {
        setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]));
    }, []);

    useEffect(() => {
        let active = true;
        supabase.from('team_chat_messages').select(COLUMNS).order('created_at', { ascending: false }).limit(HISTORY)
            .then(({ data, error: loadError }) => {
                if (!active) return;
                if (loadError) {
                    console.error('Could not load team chat:', loadError);
                    setError('Messages could not be loaded.');
                } else {
                    setMessages((data || []).reverse());
                }
                setLoading(false);
            });
        const channel = supabase.channel('team-chat-messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_chat_messages' }, ({ new: row }) => {
                if (!row?.id) return;
                addMessage(row);
                if (!openRef.current && row.sender_id !== myId) setUnread(count => count + 1);
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'team_chat_messages' }, ({ old }) => {
                if (old?.id) setMessages(prev => prev.filter(m => m.id !== old.id));
            })
            .subscribe();
        return () => { active = false; supabase.removeChannel(channel); };
    }, [addMessage, myId]);

    useEffect(() => {
        openRef.current = isOpen;
        if (!isOpen) return;
        setUnread(0);
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [isOpen, messages.length]);

    const close = useCallback(() => {
        setIsOpen(false);
        launcherRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        inputRef.current?.focus();
        const onKey = event => { if (event.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, close]);

    async function send(event) {
        event?.preventDefault();
        const text = draft.trim();
        if (!text || !myId) return;
        setSending(true);
        setError('');
        const { data, error: sendError } = await supabase.from('team_chat_messages').insert({
            sender_id: myId,
            sender_name: currentUser.name || currentUser.email || 'Team member',
            sender_role: currentUser.role || 'Team member',
            user_type: currentUser.userType,
            text,
            tag,
        }).select(COLUMNS).single();
        setSending(false);
        if (sendError) {
            console.error('Could not send message:', sendError);
            setError('Your message was not sent. Try again.');
            return;
        }
        setDraft('');
        addMessage(data);
    }

    async function remove(message) {
        const ok = await showConfirm('Delete this message for everyone?', { title: 'Delete message', confirmLabel: 'Delete', type: 'danger' });
        if (!ok) return;
        const { data, error: deleteError } = await supabase.from('team_chat_messages').delete().eq('id', message.id).select('id');
        if (deleteError || !data?.length) {
            setError('The message could not be deleted.');
            return;
        }
        setMessages(prev => prev.filter(m => m.id !== message.id));
    }

    const shown = useMemo(() => (filterTag === 'All' ? messages : messages.filter(m => m.tag === filterTag)), [messages, filterTag]);

    return (
        <>
            <div className="team-chat-launcher fixed bottom-20 right-4 z-40 sm:bottom-5 sm:right-5">
                <button ref={launcherRef} type="button" onClick={() => setIsOpen(open => !open)} aria-expanded={isOpen}
                    aria-label={unread ? `Team chat, ${unread} new` : 'Team chat'}
                    className="flex min-h-11 items-center gap-2 rounded-full border border-stone-700 bg-stone-900 px-4 text-white shadow-2xl hover:bg-stone-800">
                    <span className="relative">
                        <MessageSquare size={16} className="text-orange-400" aria-hidden="true" />
                        {unread > 0 && (
                            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white" aria-hidden="true">
                                {unread > 99 ? '99+' : unread}
                            </span>
                        )}
                    </span>
                    <span className="text-xs font-bold">Team chat</span>
                </button>
            </div>

            {isOpen && (
                <div role="dialog" aria-modal="false" aria-labelledby="team-chat-title"
                    className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-2xl">
                    <div className="flex shrink-0 items-center justify-between gap-3 bg-stone-900 py-2 pl-4 pr-2 text-white">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/20 text-orange-300"><Users size={16} aria-hidden="true" /></span>
                            <div>
                                <h2 id="team-chat-title" className="text-sm font-bold">Team chat</h2>
                                <p className="text-[11px] text-stone-300">Everyone who signs in can read these messages.</p>
                            </div>
                        </div>
                        <button type="button" onClick={close} aria-label="Close team chat"
                            className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-300 hover:bg-stone-800 hover:text-white">
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>

                    <div role="group" aria-label="Filter by topic" className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-stone-200 bg-stone-50 px-4 py-2">
                        {['All', ...TAGS].map(name => (
                            <button key={name} type="button" onClick={() => setFilterTag(name)} aria-pressed={filterTag === name}
                                className={`min-h-9 whitespace-nowrap rounded-full px-3 text-[11px] font-bold ${filterTag === name ? 'bg-stone-800 text-white' : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'}`}>
                                {name}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto bg-stone-50/50 p-4" aria-live="polite">
                        {loading ? (
                            <p className="flex items-center justify-center gap-2 py-12 text-xs text-stone-500"><Spinner size={14} /> Loading messages…</p>
                        ) : shown.length === 0 ? (
                            <p className="py-12 text-center text-xs text-stone-500">
                                {filterTag === 'All' ? 'No messages yet. Post the first update for the team.' : `No ${filterTag} messages.`}
                            </p>
                        ) : shown.map(message => {
                            const mine = message.sender_id && message.sender_id === myId;
                            return (
                                <article key={message.id} className={`rounded-2xl border p-3 ${mine ? 'ml-6 border-orange-200 bg-orange-50/60' : 'mr-6 border-stone-200 bg-white'}`}>
                                    <div className="flex items-start justify-between gap-2 border-b border-stone-100 pb-1">
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-bold text-stone-900">{message.sender_name}</p>
                                            <p className="truncate text-[11px] text-stone-500">
                                                {[message.sender_role, formatDate(message.created_at, 'datetime'), message.tag && `#${message.tag}`].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                        {(mine || canDeleteAny) && (
                                            <button type="button" onClick={() => remove(message)} aria-label="Delete message"
                                                className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-700">
                                                <Trash2 size={14} aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                    <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-stone-800">{message.text}</p>
                                </article>
                            );
                        })}
                        <div ref={endRef} />
                    </div>

                    <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-stone-100 bg-white px-3 pb-1 pt-2">
                        {PRESETS.map(preset => (
                            <button key={preset} type="button" onClick={() => { setDraft(preset); inputRef.current?.focus(); }}
                                className="min-h-9 whitespace-nowrap rounded-lg border border-stone-200 bg-stone-100 px-2.5 text-[11px] text-stone-700 hover:bg-orange-100">
                                {preset}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={send} className="shrink-0 space-y-2 border-t border-stone-200 bg-white p-3">
                        {error && <ErrorBanner>{error}</ErrorBanner>}
                        <div className="flex items-center gap-2">
                            <label htmlFor="team-chat-tag" className="text-[11px] font-bold text-stone-600">Topic</label>
                            <select id="team-chat-tag" value={tag} onChange={e => setTag(e.target.value)}
                                className="min-h-9 rounded-lg border border-stone-200 bg-stone-50 px-2 text-xs font-bold">
                                {TAGS.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                            {tag === 'Urgent' && <AlertCircle size={14} className="text-rose-600" aria-hidden="true" />}
                        </div>
                        <div className="flex items-center gap-2">
                            <input ref={inputRef} type="text" value={draft} maxLength={1000} onChange={e => setDraft(e.target.value)}
                                aria-label="Message" placeholder="Post an update for the team…" className="sf-input min-h-11 flex-1" />
                            <button type="submit" disabled={!draft.trim() || sending || !myId} aria-label="Send message"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-40">
                                {sending ? <Spinner size={16} /> : <Send size={16} aria-hidden="true" />}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}
