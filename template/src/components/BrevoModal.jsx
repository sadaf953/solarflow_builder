import { useState } from 'react';
import { 
    Mail, MessageSquare, Send, CheckCircle2, ShieldCheck, 
    Key, Sliders, Smartphone, AlertCircle, Sparkles, Copy, Check, ExternalLink, X, Terminal, Save
} from 'lucide-react';
import BrandMark from './BrandMark';

export default function BrevoModal({ isOpen, onClose, defaultUser = null }) {
    const [activeTab, setActiveTab] = useState('templates'); // 'overview' | 'config' | 'templates' | 'simulator'
    const [copied, setCopied] = useState(false);
    
    // Config state
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('solarflow_brevo_api_key') || 'xkeysib-demo-sample-key-848392019482');
    const [senderEmail, setSenderEmail] = useState(() => localStorage.getItem('solarflow_brevo_sender_email') || 'notifications@solarflow.in');
    const [senderName, setSenderName] = useState(() => localStorage.getItem('solarflow_brevo_sender_name') || 'SolarFlow Team');
    const [smsSenderId, setSmsSenderId] = useState(() => localStorage.getItem('solarflow_brevo_sms_sender') || 'SOLARF');
    const [configSaved, setConfigSaved] = useState(false);

    // Simulator state
    const [selectedChannel, setSelectedChannel] = useState('email'); // 'email' | 'sms' | 'whatsapp'
    const [recipient, setRecipient] = useState(defaultUser?.email || defaultUser?.phone || 'ravi.patel@solarflow.in');
    const [recipientPhone, setRecipientPhone] = useState(defaultUser?.phone_number || '+91 98250 12345');
    const [templateType, setTemplateType] = useState('welcome');
    const [isSending, setIsSending] = useState(false);
    const [dispatchLogs, setDispatchLogs] = useState([
        { id: 1, time: '11:20 AM', channel: 'Email', recipient: 'nikhil.patel@solarflow.in', template: 'New User Credentials', status: 'Delivered' },
        { id: 2, time: '10:45 AM', channel: 'SMS', recipient: '+91 98250 99881', template: 'Vendor Dispatch Notice', status: 'Delivered' },
        { id: 3, time: '09:15 AM', channel: 'WhatsApp', recipient: '+91 98790 44321', template: 'Customer Stage Update', status: 'Delivered' }
    ]);

    const handleSaveConfig = () => {
        localStorage.setItem('solarflow_brevo_api_key', apiKey);
        localStorage.setItem('solarflow_brevo_sender_email', senderEmail);
        localStorage.setItem('solarflow_brevo_sender_name', senderName);
        localStorage.setItem('solarflow_brevo_sms_sender', smsSenderId);
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 2500);
    };

    const handleSendSimulated = (e) => {
        e.preventDefault();
        setIsSending(true);
        setTimeout(() => {
            setIsSending(false);
            const target = selectedChannel === 'email' ? recipient : recipientPhone;
            setDispatchLogs(prev => [
                {
                    id: Date.now(),
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    channel: selectedChannel === 'email' ? 'Email' : selectedChannel === 'sms' ? 'SMS' : 'WhatsApp',
                    recipient: target,
                    template: templateType === 'welcome' ? 'User Welcome Credentials' : templateType === 'reset' ? 'Password Reset' : 'Operations Alert',
                    status: 'Delivered (Simulated)'
                },
                ...prev
            ]);
        }, 600);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between border-b border-stone-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                            <Mail className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold">Brevo Messaging & User Management</h3>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    Email + SMS + WhatsApp
                                </span>
                            </div>
                            <p className="text-xs text-stone-400">
                                Transactional email credentials, password recovery & instant phone notifications
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-2 px-6 pt-3 border-b border-stone-200 bg-stone-50 shrink-0">
                    {[
                        { id: 'templates', label: 'Message Templates', icon: Mail },
                        { id: 'simulator', label: 'Dispatch Simulator', icon: Send },
                        { id: 'config', label: 'API & Credentials', icon: Key },
                        { id: 'overview', label: 'Can we send SMS / WhatsApp?', icon: Smartphone },
                    ].map(tab => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                                    active 
                                        ? 'border-amber-600 text-amber-900 bg-white rounded-t-lg shadow-xs' 
                                        : 'border-transparent text-stone-600 hover:text-stone-900'
                                }`}
                            >
                                <Icon className={`w-3.5 h-3.5 ${active ? 'text-amber-600' : 'text-stone-400'}`} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">

                    {/* OVERVIEW / Q&A TAB */}
                    {activeTab === 'overview' && (
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                                <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-amber-700" />
                                    Can we use Brevo to send messages?
                                </h4>
                                <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                                    <strong>Yes, absolutely!</strong> Brevo (formerly Sendinblue) provides a multi-channel unified API. In SolarFlow, Brevo handles:
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                                    <div className="p-3 bg-white rounded-lg border border-amber-200/80 shadow-xs">
                                        <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs">
                                            <Mail className="w-3.5 h-3.5" /> 1. Transactional Email
                                        </div>
                                        <p className="text-[11px] text-stone-600 mt-1">
                                            New staff login credentials, password reset tokens, and customer BOM quotation PDFs.
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white rounded-lg border border-amber-200/80 shadow-xs">
                                        <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs">
                                            <MessageSquare className="w-3.5 h-3.5" /> 2. Transactional SMS
                                        </div>
                                        <p className="text-[11px] text-stone-600 mt-1">
                                            Direct SMS alerts to Indian (+91) phone numbers for project stage moves and truck dispatches.
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white rounded-lg border border-amber-200/80 shadow-xs">
                                        <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs">
                                            <Smartphone className="w-3.5 h-3.5" /> 3. WhatsApp Business
                                        </div>
                                        <p className="text-[11px] text-stone-600 mt-1">
                                            Official WhatsApp messages with PDF attachments for client proposals and vendor work orders.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 space-y-2">
                                <h5 className="text-xs font-bold text-stone-800 uppercase tracking-wider">How to deploy Brevo in production</h5>
                                <ol className="list-decimal list-inside text-xs text-stone-600 space-y-1.5">
                                    <li>Create an account at <strong>Brevo.com</strong> and generate an API key in <em>SMTP & API</em>.</li>
                                    <li>Verify your company sending domain (e.g. <code>solarflow.in</code>) with SPF/DKIM records.</li>
                                    <li>Add your Brevo API key to your Supabase Edge Function environment: <code>BREVO_API_KEY=xkeysib-...</code></li>
                                    <li>When you click <strong>Create User</strong> or <strong>Reset Password</strong> in User Management, SolarFlow automatically dispatches via Brevo.</li>
                                </ol>
                            </div>
                        </div>
                    )}

                    {/* CONFIG TAB */}
                    {activeTab === 'config' && (
                        <div className="space-y-4">
                            <div className="p-3.5 rounded-xl bg-stone-100 border border-stone-200 text-xs text-stone-600 flex items-start gap-2.5">
                                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-semibold text-stone-900">Demo Isolation Active:</span> Keys configured here are stored safely in local browser memory. To protect live sending limits, mock delivery simulation is active until connected to your dedicated backend.
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-stone-700 mb-1">Brevo API Key (v3)</label>
                                    <input 
                                        type="password"
                                        value={apiKey}
                                        onChange={e => setApiKey(e.target.value)}
                                        placeholder="xkeysib-..."
                                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                                    />
                                    <p className="text-[11px] text-stone-400 mt-0.5">Found in Brevo Dashboard → SMTP & API → Generate a new API key</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-stone-700 mb-1">Sender Email</label>
                                        <input 
                                            type="email"
                                            value={senderEmail}
                                            onChange={e => setSenderEmail(e.target.value)}
                                            placeholder="no-reply@yourcompany.com"
                                            className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-stone-700 mb-1">Sender Name</label>
                                        <input 
                                            type="text"
                                            value={senderName}
                                            onChange={e => setSenderName(e.target.value)}
                                            placeholder="SolarFlow Notifications"
                                            className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-stone-700 mb-1">SMS Sender ID (DLT Registered)</label>
                                    <input 
                                        type="text"
                                        value={smsSenderId}
                                        onChange={e => setSmsSenderId(e.target.value)}
                                        placeholder="SOLARF"
                                        maxLength={6}
                                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                                    />
                                    <p className="text-[11px] text-stone-400 mt-0.5">6-character DLT sender header for Indian SMS delivery</p>
                                </div>

                                <div className="pt-2 flex items-center justify-between">
                                    <button
                                        type="button"
                                        onClick={handleSaveConfig}
                                        className="px-4 py-2 bg-stone-900 text-white rounded-lg text-xs font-bold hover:bg-stone-800 transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
                                    >
                                        <Save className="w-3.5 h-3.5" /> Save Configuration
                                    </button>
                                    {configSaved && (
                                        <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 animate-in fade-in">
                                            <CheckCircle2 className="w-4 h-4" /> Configuration saved!
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TEMPLATES PREVIEW TAB */}
                    {activeTab === 'templates' && (
                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setTemplateType('welcome')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                                        templateType === 'welcome' 
                                            ? 'bg-amber-100 border-amber-300 text-amber-900' 
                                            : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                                    }`}
                                >
                                    1. User Onboarding Credentials
                                </button>
                                <button
                                    onClick={() => setTemplateType('reset')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                                        templateType === 'reset' 
                                            ? 'bg-amber-100 border-amber-300 text-amber-900' 
                                            : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                                    }`}
                                >
                                    2. Password Reset
                                </button>
                                <button
                                    onClick={() => setTemplateType('sms')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                                        templateType === 'sms' 
                                            ? 'bg-amber-100 border-amber-300 text-amber-900' 
                                            : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                                    }`}
                                >
                                    3. SMS / WhatsApp Dispatch Alert
                                </button>
                            </div>

                            {templateType === 'welcome' && (
                                <div className="border border-stone-200 rounded-xl overflow-hidden shadow-xs">
                                    <div className="px-4 py-2.5 bg-stone-100 border-b border-stone-200 text-xs text-stone-600 flex justify-between">
                                        <span><strong>Subject:</strong> Welcome to SolarFlow — Your Account Credentials</span>
                                        <span className="text-stone-400">Brevo Template ID #101</span>
                                    </div>
                                    <div className="p-5 bg-white space-y-3 font-sans text-xs text-stone-800">
                                        <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                                            <BrandMark className="h-6 w-auto" />
                                            <span className="font-bold text-stone-900 text-sm">SolarFlow CRM</span>
                                        </div>
                                        <p>Dear <strong>{defaultUser?.name || 'Ravi Patel'}</strong>,</p>
                                        <p>Your team account has been set up on SolarFlow. Below are your login credentials:</p>
                                        <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-1 font-mono text-[11px]">
                                            <div><strong>Portal URL:</strong> https://app.solarflow.in</div>
                                            <div><strong>Login Email:</strong> {defaultUser?.email || 'ravi.patel@solarflow.in'}</div>
                                            <div><strong>Temporary Password:</strong> SolarFlow@2026!</div>
                                            <div><strong>Assigned Role:</strong> {defaultUser?.role || 'Channel Partner Office'}</div>
                                        </div>
                                        <p className="text-stone-500 text-[11px]">
                                            Please change your password after logging in for the first time.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {templateType === 'reset' && (
                                <div className="border border-stone-200 rounded-xl overflow-hidden shadow-xs">
                                    <div className="px-4 py-2.5 bg-stone-100 border-b border-stone-200 text-xs text-stone-600 flex justify-between">
                                        <span><strong>Subject:</strong> Reset Your SolarFlow Password</span>
                                        <span className="text-stone-400">Brevo Template ID #102</span>
                                    </div>
                                    <div className="p-5 bg-white space-y-3 font-sans text-xs text-stone-800">
                                        <p>Hello <strong>{defaultUser?.name || 'Team Member'}</strong>,</p>
                                        <p>A password reset was requested for your account. Click the button below to choose a new password:</p>
                                        <div className="py-2">
                                            <a href="#reset" className="px-4 py-2 bg-amber-600 text-white font-bold rounded-lg inline-block text-xs">
                                                Reset My Password
                                            </a>
                                        </div>
                                        <p className="text-[11px] text-stone-400">
                                            This link will expire in 24 hours. If you did not request this, you can safely ignore this email.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {templateType === 'sms' && (
                                <div className="space-y-3">
                                    <div className="border border-stone-200 rounded-xl p-4 bg-stone-50">
                                        <span className="text-[10px] font-bold uppercase text-stone-500">Transactional SMS Preview</span>
                                        <div className="p-3 bg-white rounded-lg border border-stone-200 font-mono text-xs text-stone-800 mt-2">
                                            [SOLARF] Dear Ramesh Patel, your 5.0 kWp solar materials have been dispatched on Truck VEHICLE-001. Driver: Driver 1 (9825000001). Track in SolarFlow.
                                        </div>
                                    </div>
                                    <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/50">
                                        <span className="text-[10px] font-bold uppercase text-emerald-700">WhatsApp Business Notification Preview</span>
                                        <div className="p-3 bg-white rounded-lg border border-emerald-200 text-xs text-stone-800 mt-2 space-y-1">
                                            <div className="font-bold text-emerald-900">☀️ SolarFlow Dispatch Update</div>
                                            <p>Hello Vendor 1, a new installation job has been assigned for customer <strong>Ramesh Patel</strong> (Ahmedabad Plot 14). Delivery Date: <strong>2026-09-22</strong>.</p>
                                            <div className="text-[11px] text-stone-400 pt-1">Reply ACCEPT to confirm schedule.</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SIMULATOR TAB */}
                    {activeTab === 'simulator' && (
                        <div className="space-y-4">
                            <form onSubmit={handleSendSimulated} className="p-4 rounded-xl border border-stone-200 bg-stone-50 space-y-3">
                                <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">Send Test Transactional Message</h4>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedChannel('email')}
                                        className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                            selectedChannel === 'email' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                                        }`}
                                    >
                                        <Mail className="w-3.5 h-3.5" /> Email
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedChannel('sms')}
                                        className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                            selectedChannel === 'sms' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                                        }`}
                                    >
                                        <MessageSquare className="w-3.5 h-3.5" /> SMS (India)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedChannel('whatsapp')}
                                        className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                            selectedChannel === 'whatsapp' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                                        }`}
                                    >
                                        <Smartphone className="w-3.5 h-3.5" /> WhatsApp
                                    </button>
                                </div>

                                {selectedChannel === 'email' ? (
                                    <div>
                                        <label className="block text-xs font-bold text-stone-700 mb-1">Recipient Email</label>
                                        <input 
                                            type="email"
                                            value={recipient}
                                            onChange={e => setRecipient(e.target.value)}
                                            required
                                            className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white"
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-bold text-stone-700 mb-1">Recipient Mobile (+91)</label>
                                        <input 
                                            type="tel"
                                            value={recipientPhone}
                                            onChange={e => setRecipientPhone(e.target.value)}
                                            required
                                            className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white"
                                        />
                                    </div>
                                )}

                                <div className="flex justify-end pt-1">
                                    <button
                                        type="submit"
                                        disabled={isSending}
                                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                        <Send className="w-3.5 h-3.5" />
                                        {isSending ? 'Simulating Brevo Dispatch...' : 'Dispatch Test via Brevo'}
                                    </button>
                                </div>
                            </form>

                            {/* Recent Logs */}
                            <div className="space-y-2">
                                <h5 className="text-xs font-bold text-stone-600 uppercase tracking-wider flex items-center gap-1.5">
                                    <Terminal className="w-3.5 h-3.5" /> Recent Brevo Transmissions
                                </h5>
                                <div className="border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100">
                                    {dispatchLogs.map(log => (
                                        <div key={log.id} className="p-3 text-xs flex items-center justify-between hover:bg-stone-50">
                                            <div className="flex items-center gap-3">
                                                <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-stone-100 text-stone-700 border border-stone-200">
                                                    {log.channel}
                                                </span>
                                                <div>
                                                    <div className="font-semibold text-stone-900">{log.template}</div>
                                                    <div className="text-[11px] text-stone-400">{log.recipient}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                                                    <CheckCircle2 className="w-3 h-3" /> {log.status}
                                                </span>
                                                <div className="text-[10px] text-stone-400">{log.time}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="px-6 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500 shrink-0">
                    <div>
                        For production API setup or Brevo webhook integration, contact <strong className="text-stone-800">enquiry@deeprootsystems.in</strong>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-lg transition-colors cursor-pointer"
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
}
