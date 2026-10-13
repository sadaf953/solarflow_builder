import { useState, useEffect, useRef, useMemo } from 'react';
import { 
    MessageSquare, Send, X, Users, AlertCircle, Sparkles, 
    Tag, Bell, Check, Shield, Flame, CheckCircle2, ChevronDown, Minimize2, RotateCcw
} from 'lucide-react';
import { supabase } from '../supabase';

const STORAGE_KEY = 'solarflow_team_chat_messages';

const formatTime = (d) => {
    try {
        const date = d instanceof Date ? d : new Date(d);
        return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
        return '';
    }
};

// Dynamic starter updates relative to current time
const getInitialMessages = () => {
    const now = new Date();
    const fmt = (d, timeStr) => `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${timeStr}`;
    const d0 = new Date(now);
    const d1 = new Date(now); d1.setDate(d1.getDate() - 1);
    const d2 = new Date(now); d2.setDate(d2.getDate() - 3);

    return [
        {
            id: 'msg-1',
            senderName: 'Operations Admin',
            senderRole: 'Admin',
            userType: 'admin',
            text: 'Welcome to the SolarFlow Operations channel. All dispatches, site installation updates, and DISCOM submissions can be announced here for full team visibility.',
            tag: 'General',
            timestamp: d2.toISOString(),
            timeFormatted: fmt(d2, '09:30 AM')
        },
        {
            id: 'msg-2',
            senderName: 'Channel Partner Office',
            senderRole: 'CPO',
            userType: 'channel_partner_office',
            text: 'Submitted 12 new residential proposals for East cluster. 8 have opted for Jan Samarth bank loan financing.',
            tag: 'General',
            timestamp: d1.toISOString(),
            timeFormatted: fmt(d1, '02:15 PM')
        },
        {
            id: 'msg-3',
            senderName: 'Inventory & Logistics',
            senderRole: 'Admin',
            userType: 'admin',
            text: 'Warehouse stock of bifacial solar modules replenished in godown. Ready for delivery batch allocation.',
            tag: 'Dispatch',
            timestamp: d0.toISOString(),
            timeFormatted: fmt(d0, '10:00 AM')
        },
        {
            id: 'msg-4',
            senderName: 'Site Installation Lead',
            senderRole: 'Vendor',
            userType: 'vendor',
            text: 'Completed rooftop mounting structure and inverter wiring for consumer Ramesh Patel. Geo-tag photos submitted.',
            tag: 'Installation',
            timestamp: d0.toISOString(),
            timeFormatted: fmt(d0, '11:45 AM')
        },
        {
            id: 'msg-5',
            senderName: 'Document & Stamp Executive',
            senderRole: 'Stamp Maker',
            userType: 'stamp',
            text: 'Executed and uploaded stamped DISCOM agreements for batch 22. All returned to admin queue for final review.',
            tag: 'Discom',
            timestamp: d0.toISOString(),
            timeFormatted: fmt(d0, '01:20 PM')
        }
    ];
};

const TAG_OPTIONS = [
    { label: 'General', color: 'bg-stone-100 text-stone-700 border-stone-200' },
    { label: 'Dispatch', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    { label: 'Installation', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    { label: 'Discom', color: 'bg-amber-50 text-amber-800 border-amber-200' },
    { label: 'Urgent', color: 'bg-rose-50 text-rose-700 border-rose-200' },
];

const ROLE_BADGES = {
    admin: { label: 'Admin', color: 'bg-stone-900 text-amber-400 border-stone-800' },
    channel_partner_office: { label: 'CPO', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    office2: { label: 'CPO Manager', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    agent: { label: 'Dealer', color: 'bg-amber-100 text-amber-900 border-amber-300' },
    agent2: { label: 'Dealer', color: 'bg-amber-100 text-amber-900 border-amber-300' },
    vendor: { label: 'Vendor', color: 'bg-orange-100 text-orange-900 border-orange-300' },
    stamp: { label: 'Stamp Maker', color: 'bg-yellow-100 text-yellow-900 border-yellow-300' },
    sales: { label: 'Staff', color: 'bg-stone-100 text-stone-800 border-stone-200' }
};

export default function TeamChatDrawer({ currentUser }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState(() => {
        if (typeof window === 'undefined') return getInitialMessages();
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : getInitialMessages();
        } catch {
            return getInitialMessages();
        }
    });

    const [filterTag, setFilterTag] = useState('All');
    const [inputMessage, setInputMessage] = useState('');
    const [selectedTag, setSelectedTag] = useState('General');
    const [unreadCount, setUnreadCount] = useState(0);

    const messagesEndRef = useRef(null);

    // Save and broadcast across tabs
    const broadcastChannelRef = useRef(null);

    useEffect(() => {
        let isMounted = true;

        if (typeof window !== 'undefined' && window.BroadcastChannel) {
            broadcastChannelRef.current = new BroadcastChannel('solarflow_team_chat');
            broadcastChannelRef.current.onmessage = (event) => {
                if (event.data?.type === 'NEW_MESSAGE') {
                    setMessages(prev => {
                        if (prev.some(m => m.id === event.data.message.id)) return prev;
                        return [...prev, event.data.message];
                    });
                    if (!isOpen) {
                        setUnreadCount(c => c + 1);
                    }
                } else if (event.data?.type === 'RESET_MESSAGES') {
                    setMessages(event.data.messages || []);
                }
            };
        }

        // Fetch messages from Supabase
        async function loadSupabaseChat() {
            try {
                const { data, error } = await supabase
                    .from('team_chat_messages')
                    .select('*')
                    .order('created_at', { ascending: true })
                    .limit(200);

                if (!error && data && data.length > 0 && isMounted) {
                    const mapped = data.map(r => ({
                        id: r.id,
                        senderName: r.sender_name,
                        senderRole: r.sender_role,
                        userType: r.user_type,
                        text: r.text,
                        tag: r.tag || 'General',
                        timestamp: r.created_at,
                        timeFormatted: formatTime(r.created_at)
                    }));
                    setMessages(mapped);
                    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped)); } catch { /* Storage may be unavailable in private browsing. */ }
                } else if (!error && data && data.length === 0 && isMounted) {
                    // Seed initial announcements
                    const starters = getInitialMessages();
                    setMessages(starters);
                    const rows = starters.map(m => ({
                        sender_name: m.senderName,
                        sender_role: m.senderRole,
                        user_type: m.userType,
                        text: m.text,
                        tag: m.tag,
                        created_at: m.timestamp
                    }));
                    supabase.from('team_chat_messages').insert(rows).catch(() => {});
                }
            } catch (err) {
                console.warn('Notice loading Supabase team chat:', err);
            }
        }

        loadSupabaseChat();

        // Subscribe to Supabase Realtime for live cross-device messaging
        const realtimeChannel = supabase.channel('realtime:team_chat_messages')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'team_chat_messages' },
                (payload) => {
                    const row = payload.new;
                    if (!row?.id) return;
                    const newMsg = {
                        id: row.id,
                        senderName: row.sender_name,
                        senderRole: row.sender_role,
                        userType: row.user_type,
                        text: row.text,
                        tag: row.tag || 'General',
                        timestamp: row.created_at,
                        timeFormatted: formatTime(row.created_at)
                    };
                    setMessages(prev => {
                        if (prev.some(m => m.id === newMsg.id || (m.timestamp === newMsg.timestamp && m.text === newMsg.text && m.senderName === newMsg.senderName))) {
                            return prev.map(m => (m.text === newMsg.text && m.senderName === newMsg.senderName ? newMsg : m));
                        }
                        return [...prev, newMsg];
                    });
                    if (!isOpen) {
                        setUnreadCount(c => c + 1);
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'team_chat_messages' },
                (payload) => {
                    if (payload.old?.id) {
                        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
                    } else {
                        setMessages([]);
                    }
                }
            )
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(realtimeChannel);
            if (broadcastChannelRef.current) {
                broadcastChannelRef.current.close();
            }
        };
    }, [isOpen]);

    const handleResetChat = async () => {
        const fresh = getInitialMessages();
        setMessages(fresh);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
            if (broadcastChannelRef.current) {
                broadcastChannelRef.current.postMessage({ type: 'RESET_MESSAGES', messages: fresh });
            }
            await supabase.from('team_chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            const rows = fresh.map(m => ({
                sender_name: m.senderName,
                sender_role: m.senderRole,
                user_type: m.userType,
                text: m.text,
                tag: m.tag,
                created_at: m.timestamp
            }));
            await supabase.from('team_chat_messages').insert(rows);
        } catch { /* ignore */ }
    };

    useEffect(() => {
        if (isOpen) {
            setUnreadCount(0);
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [isOpen, messages]);

    const handleSendMessage = async (e) => {
        e?.preventDefault();
        const text = inputMessage.trim();
        if (!text) return;

        const roleKey = currentUser?.userType || 'admin';
        const roleConfig = ROLE_BADGES[roleKey] || { label: 'Team Member', color: 'bg-stone-100 text-stone-800' };

        const now = new Date();
        const timeFormatted = formatTime(now);
        const tempId = `temp-${Date.now()}`;

        const newMsg = {
            id: tempId,
            senderName: currentUser?.name || 'Staff Member',
            senderRole: roleConfig.label,
            userType: roleKey,
            text,
            tag: selectedTag,
            timestamp: now.toISOString(),
            timeFormatted
        };

        const updated = [...messages, newMsg];
        setMessages(updated);
        setInputMessage('');

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            if (broadcastChannelRef.current) {
                broadcastChannelRef.current.postMessage({ type: 'NEW_MESSAGE', message: newMsg });
            }
        } catch (err) {
            console.error('Failed to store team chat message locally:', err);
        }

        try {
            const { data, error } = await supabase.from('team_chat_messages').insert({
                sender_id: currentUser?.id || null,
                sender_name: newMsg.senderName,
                sender_role: newMsg.senderRole,
                user_type: newMsg.userType,
                text: newMsg.text,
                tag: newMsg.tag,
                created_at: newMsg.timestamp
            }).select().maybeSingle();

            if (!error && data?.id) {
                setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id } : m));
            }
        } catch (err) {
            console.warn('Notice saving message to Supabase backend:', err);
        }
    };

    const filteredMessages = useMemo(() => {
        if (filterTag === 'All') return messages;
        return messages.filter(m => m.tag === filterTag);
    }, [messages, filterTag]);

    return (
        <>
            {/* Floating Chat Trigger Button (Visible on all portals) */}
            <div className="team-chat-launcher fixed bottom-20 right-4 sm:bottom-5 sm:right-5 z-40">
                <button
                    onClick={() => setIsOpen(prev => !prev)}
                    className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 bg-stone-900/95 hover:bg-stone-800 text-white rounded-full shadow-2xl border border-stone-700 transition-all transform hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-xs"
                    title="Open Team Operations Chat (For All)"
                >
                    <div className="relative">
                        <MessageSquare className="w-4 h-4 text-amber-400" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center animate-pulse">
                                {unreadCount}
                            </span>
                        )}
                    </div>
                    <span className="text-xs font-bold tracking-wide">Team Chat</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                </button>
            </div>

            {/* Slide-over Drawer */}
            {isOpen && (
                <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-stone-200 flex flex-col animate-in slide-in-from-right duration-250">
                    
                    {/* Header */}
                    <div className="p-4 bg-stone-900 text-white flex items-center justify-between border-b border-stone-800 shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                                <Users className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold">SolarFlow Team Channel</h3>
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        For All Roles
                                    </span>
                                </div>
                                <p className="text-[10px] text-stone-400">
                                    Shared bulletin: Admin, Partners, Vendors & Stamp Maker
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handleResetChat}
                                className="p-1.5 text-stone-400 hover:text-amber-400 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
                                title="Reset to Sample Updates"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer ml-1"
                                title="Close Chat"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Notice Banner: No Personal Messages */}
                    <div className="px-4 py-2 bg-amber-50/90 border-b border-amber-200 text-[11px] text-amber-900 flex items-center gap-2 shrink-0">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span><strong>Public Channel:</strong> All posts are visible to every team role. No private DMs.</span>
                    </div>

                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-1.5 px-4 py-2 bg-stone-50 border-b border-stone-200 overflow-x-auto shrink-0">
                        {['All', 'General', 'Dispatch', 'Installation', 'Discom', 'Urgent'].map(tag => (
                            <button
                                key={tag}
                                onClick={() => setFilterTag(tag)}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all cursor-pointer whitespace-nowrap ${
                                    filterTag === tag 
                                        ? 'bg-stone-800 text-white shadow-2xs' 
                                        : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                                }`}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>

                    {/* Message List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-stone-50/50">
                        {filteredMessages.length === 0 ? (
                            <div className="py-12 text-center text-stone-400 text-xs">
                                No messages in this category.
                            </div>
                        ) : (
                            filteredMessages.map(msg => {
                                const roleStyle = ROLE_BADGES[msg.userType] || { label: msg.senderRole, color: 'bg-stone-100 text-stone-800 border-stone-200' };
                                const isMe = currentUser?.name && msg.senderName.includes(currentUser.name);

                                return (
                                    <div 
                                        key={msg.id} 
                                        className={`p-3 rounded-2xl border shadow-2xs transition-all ${
                                            isMe ? 'bg-amber-50/50 border-amber-200/80 ml-3' : 'bg-white border-stone-200 mr-3'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2 pb-1 border-b border-stone-100/80">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-stone-900 truncate max-w-[150px]">
                                                    {msg.senderName}
                                                </span>
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${roleStyle.color}`}>
                                                    {roleStyle.label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className="text-[9px] font-semibold text-stone-400">
                                                    {msg.timeFormatted}
                                                </span>
                                                {msg.tag && (
                                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-stone-100 text-stone-600 border border-stone-200">
                                                        #{msg.tag}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <p className="text-xs text-stone-800 mt-2 leading-relaxed whitespace-pre-wrap">
                                            {msg.text}
                                        </p>
                                    </div>
                                );
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Presets */}
                    <div className="px-3 pt-2 pb-1 bg-white border-t border-stone-100 flex gap-1.5 overflow-x-auto shrink-0">
                        {[
                            '🚛 Dispatch En Route',
                            '✅ Site Work Finished',
                            '📄 Stamped Agreement Ready',
                            '⚠️ Site Inspection Delay'
                        ].map(preset => (
                            <button
                                key={preset}
                                onClick={() => setInputMessage(preset)}
                                className="text-[10px] bg-stone-100 hover:bg-amber-100 text-stone-700 px-2 py-0.5 rounded-md border border-stone-200 whitespace-nowrap cursor-pointer transition-colors"
                            >
                                {preset}
                            </button>
                        ))}
                    </div>

                    {/* Message Composer Form */}
                    <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-stone-200 space-y-2 shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase text-stone-400">Post As:</span>
                            <span className="text-xs font-bold text-stone-800">
                                {currentUser?.name || 'Staff'} ({currentUser?.userType || 'Admin'})
                            </span>
                            <div className="ml-auto flex items-center gap-1">
                                <span className="text-[10px] text-stone-400 font-bold">Tag:</span>
                                <select
                                    value={selectedTag}
                                    onChange={e => setSelectedTag(e.target.value)}
                                    className="text-[10px] font-bold px-2 py-0.5 rounded border border-stone-200 bg-stone-50 cursor-pointer"
                                >
                                    <option value="General">#General</option>
                                    <option value="Dispatch">#Dispatch</option>
                                    <option value="Installation">#Installation</option>
                                    <option value="Discom">#Discom</option>
                                    <option value="Urgent">#Urgent</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={inputMessage}
                                onChange={e => setInputMessage(e.target.value)}
                                placeholder="Post an update for all team members..."
                                className="flex-1 px-3 py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-stone-50"
                            />
                            <button
                                type="submit"
                                disabled={!inputMessage.trim()}
                                className="p-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white rounded-xl transition-colors cursor-pointer shadow-xs"
                                title="Send Message"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </form>

                </div>
            )}
        </>
    );
}
