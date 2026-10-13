import { useEffect, useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import CustomizationEnquiryForm from './CustomizationEnquiryForm';
import { readPreparedBriefId } from '../enquiries/brief';
import { readSubmittedEnquiryId } from '../enquiries/reopen';

const OPTIONS = [
    {
        title: 'Simple customer tracking', label: 'Option 1 · Small teams', team: 'For teams of 4–9 people',
        description: 'A simple workspace to keep your customers and daily follow-ups organised.',
        features: [
            'Each customer card has 4–5 dedicated tabs for their details and progress.',
            'Move a client easily from one stage to the next.',
            'Keep everyday work clear and manageable for a small team.',
            'Export your customer data whenever you need it.'
        ]
    },
    {
        title: 'Detailed operations', label: 'Option 2 · Larger teams', team: 'For teams of 30+ people',
        description: 'A detailed workspace for teams managing projects, materials and multiple offices.',
        features: [
            'A dedicated customer card tab for each stage, with detailed information and tracking.',
            'Inventory, BOM, gate passes and warranty tracking.',
            'Separate logins for vendors, stamp staff and technicians.',
            'Installation and operations pages, with dealer-based filtering.',
            'Commission views for installations, vendors and channel partners.',
            'Quotation and bill makers, delivery challans, delivery truck tally checklists and feasibility document automation.',
            'Upload MIS files to automatically update project information.',
            'Track requirements with checklists or upload documents to keep them on record.',
            'Manage branches, dealers, channel partner offices (CPOs) and their staff.'
        ]
    },
    {
        title: 'A mix that fits your team', label: 'Your own setup', team: 'For teams in between',
        description: 'Most clients need a little from Option 1 and a little from Option 2.',
        features: [
            'Start with simple customer tracking and add the tools you need.',
            'Choose features around your workflow, team and offices.',
            'Fill out the form below so we can understand your needs.'
        ]
    }
];

const isAdminView = hash => new URLSearchParams(hash.split('?')[1] || '').get('admin') === '1';

export default function PricingView() {
    const [enquiryChoice, setEnquiryChoice] = useState(null);
    const [preparedBriefId, setPreparedBriefId] = useState(() => readPreparedBriefId(window.location.hash));
    const [submittedEnquiryId, setSubmittedEnquiryId] = useState(() => readSubmittedEnquiryId(window.location.hash));
    const [adminView, setAdminView] = useState(() => isAdminView(window.location.hash));
    useEffect(() => {
        const update = () => {setPreparedBriefId(readPreparedBriefId(window.location.hash));setSubmittedEnquiryId(readSubmittedEnquiryId(window.location.hash));setAdminView(isAdminView(window.location.hash));};
        window.addEventListener('hashchange', update);
        return () => window.removeEventListener('hashchange', update);
    }, []);
    const choices = ['Option 1: Small team setup', 'Option 2: Detailed operations', 'A mix of both options'];
    if (preparedBriefId || submittedEnquiryId) return (
        <main className="mx-auto max-w-2xl py-5 sm:py-10 pb-16 space-y-5">
            <header className="px-1 sm:px-0">
                <a href="#/plans?admin=1" className="mb-5 inline-flex min-h-11 items-center rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-800">Admin access</a>
                <p className="sf-kicker">Your custom SolarFlow quotation</p>
                <h1 className="mt-2 text-2xl sm:text-3xl font-black leading-tight text-stone-900">Tell us what your team needs</h1>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">We’ve started this form with the details shared with us. Enter the code, review the answers, and choose anything else you need. We’ll use your responses to prepare a quotation for you.</p>
            </header>
            <CustomizationEnquiryForm key={preparedBriefId || submittedEnquiryId} preparedBriefId={preparedBriefId} submittedEnquiryId={submittedEnquiryId}/>
        </main>
    );
    if (adminView) return (
        <main className="mx-auto max-w-2xl py-5 sm:py-10 pb-16 space-y-5">
            <header className="px-1 sm:px-0">
                <a href="#/plans" className="mb-5 inline-flex min-h-11 items-center text-sm font-bold text-orange-700 underline">← Back to pricing</a>
                <p className="sf-kicker">SolarFlow form management</p>
                <h1 className="mt-2 text-2xl sm:text-3xl font-black text-stone-900">Admin access</h1>
                <p className="mt-2 text-sm text-stone-600">Open your saved forms, prepare a new one, and share a client link.</p>
            </header>
            <CustomizationEnquiryForm key="admin" startInPrepareMode/>
        </main>
    );
    return (
        <div className="max-w-7xl mx-auto py-8 md:py-12 space-y-8">
            <header className="max-w-3xl space-y-3">
                <a href="#/plans?admin=1" className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-800">Admin access</a>
                <p className="sf-kicker">SolarFlow for your team</p>
                <h1 className="text-3xl md:text-4xl font-black text-stone-900">Choose the setup that fits your business</h1>
                <p className="text-sm leading-relaxed text-stone-600">Simple customer tracking or detailed operations — tell us what your team needs and we’ll help you find the right mix.</p>
                {!preparedBriefId && <button type="button" onClick={() => document.getElementById('setup-enquiry')?.scrollIntoView({behavior:'smooth', block:'start'})} className="sm:hidden mt-2 w-full min-h-12 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-stone-950">Fill the quick form <ArrowRight className="inline w-4 h-4 ml-1"/></button>}
            </header>
            <div className="grid gap-5 lg:grid-cols-3">
                {OPTIONS.map((option, index) => (
                    <article key={option.title} className={`rounded-3xl p-4 sm:p-6 flex flex-col border ${index === 1 ? 'bg-stone-900 text-white border-stone-900 shadow-lg' : 'bg-white text-stone-900 border-stone-200'}`}>
                        <p className={`text-xs font-bold ${index === 1 ? 'text-amber-300' : 'text-orange-700'}`}>{option.label}</p>
                        <h2 className="mt-3 text-xl font-black">{option.title}</h2>
                        <p className={`mt-2 text-xs font-bold ${index === 1 ? 'text-amber-300' : 'text-stone-700'}`}>{option.team}</p>
                        <p className={`mt-3 text-sm leading-relaxed ${index === 1 ? 'text-stone-300' : 'text-stone-500'}`}>{option.description}</p>
                        <ul className="my-6 space-y-3 flex-1">
                            {option.features.map(feature => (
                                <li key={feature} className="flex gap-2 text-xs leading-relaxed">
                                    <Check className={`w-4 h-4 shrink-0 mt-0.5 ${index === 1 ? 'text-amber-400' : 'text-emerald-600'}`} />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>
                        <button type="button" onClick={() => setEnquiryChoice(choices[index])} className={`min-h-11 rounded-xl px-4 py-3 text-xs font-bold text-center ${index === 1 ? 'bg-amber-500 text-stone-950' : 'bg-stone-100 text-stone-900'}`}>Interested in this <ArrowRight className="inline w-4 h-4 ml-1" /></button>
                    </article>
                ))}
            </div>
            <section className="rounded-3xl border border-orange-200 bg-orange-50 p-4 sm:p-6 md:p-8 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
                <div className="max-w-2xl">
                    <p className="sf-kicker">Tools only</p>
                    <h2 className="mt-2 text-xl font-black text-stone-900">Don’t need a CRM? Choose just the tools.</h2>
                    <p className="mt-2 text-sm leading-relaxed text-stone-600">Quotation maker, BOM, delivery truck tally checklist, feasibility documents, MIS upload auto updater and more. Tell us which tools you’re interested in.</p>
                </div>
                <button type="button" onClick={() => setEnquiryChoice('Tools only — no CRM')} className="sf-btn-primary min-h-11 w-full sm:w-auto shrink-0">Interested in tools <ArrowRight className="w-4 h-4 inline ml-1"/></button>
            </section>
            <div id="setup-enquiry" className="scroll-mt-24 max-w-4xl mx-auto">
                <CustomizationEnquiryForm key="standard" allowPrepare/>
            </div>
            {enquiryChoice !== null && <CustomizationEnquiryForm key={enquiryChoice} isModal selectedInterest={enquiryChoice} onClose={() => setEnquiryChoice(null)}/>}
        </div>
    );
}
