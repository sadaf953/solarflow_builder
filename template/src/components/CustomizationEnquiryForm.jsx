import { useState, useRef, useEffect, useId, useCallback } from 'react';
import { CheckCircle2, ArrowRight, X, AlertCircle, LoaderCircle, Copy } from 'lucide-react';
import { supabase } from '../supabase';
import { useGlobalPopup } from './GlobalPopup';
import { enquiryPayload, saveEnquiryStep } from '../enquiries/submit';
import { CORE_DOCUMENT_OPTIONS, DATA_START_OPTIONS, OPTIONAL_DOCUMENT_OPTIONS, SOFTWARE_OPTIONS, TEAM_SIZE_OPTIONS, YES_NO_OPTIONS, createSavedBrief, findOwnedPreparedBriefs, preparedBriefLink, unlockSavedBrief } from '../enquiries/brief';
import { findSubmittedEnquiries, listAdminEnquiries, openSubmittedEnquiry, parseSubmittedEnquiryNotes, submittedEnquiryLink, updateSubmittedEnquiry } from '../enquiries/reopen';
import { readClientFormDraft, saveClientFormDraft } from '../enquiries/draft';

export const DEFAULT_BASIC_VERSION_URL = 'https://solarcrm.deeprootsystems.in';

const OTHER_INTEREST_OPTIONS = [
    'Inventory', 'Warranty tracking',
    'Installation view', 'Installation commission view', 'Vendor commission page',
    'Channel partner commission view', 'Attendance', 'Calendar', 'MIS upload auto updater'
];
const DOCUMENT_COPY = {
    'Feasibility document maker':['Bank feasibility document','Prepare the document for bank submission.'],
    'DISCOM submission document maker':['DISCOM submission document','Prepare the document for upload to the PM Surya Ghar portal.'],
    'Quotation maker':['Quotation maker','Create customer quotations.'],
    'BOM maker':['BOM maker','Generate the bill of materials.']
};
const STORAGE_PRICING = [
    {name:'Google personal account', price:'15 GB free; Google One paid plans vary by account', detail:'Uses the customer’s Google account.', href:'https://one.google.com/about/plans?hl=en_IN'},
    {name:'Google Workspace business account', price:'From ₹99/user/month on an annual plan; 20 GB pooled per user', detail:'Monthly billing starts at ₹120/user/month.', href:'https://workspace.google.com/intl/en_in/business/'},
    {name:'Supabase Storage', price:'1 GB free; Pro from $25/month with 100 GB included', detail:'Extra storage on Pro: $0.0213/GB/month.', href:'https://supabase.com/pricing'}
];
const DRAFT_TEXT_FIELDS = ['name','mobile','company','callDate','callTime','hasWebsite','teamSize',
    'customerCount','liveCustomerCount','otherSoftware','dataStart','fileStorage','storageProvider',
    'branches','partnerOffices','channelPartners','installationTeams','stampStaffLogin',
    'technicianLogin','customRequest'];
const normalizeDraftAnswers = values => ({
    ...Object.fromEntries(DRAFT_TEXT_FIELDS.map(key => [key, typeof values[key] === 'string' ? values[key] : ''])),
    interests:Array.isArray(values.interests) ? values.interests : [],
    software:Array.isArray(values.software) ? values.software : []
});


export default function CustomizationEnquiryForm({isModal = false, onClose = null, initialStoreFiles, selectedInterest = '', preparedBriefId = null, submittedEnquiryId = null, allowPrepare = false, startInPrepareMode = false}) {
    const [preparedBrief, setPreparedBrief] = useState(null);
    const [loadedEnquiry, setLoadedEnquiry] = useState(null);
    const [extraNoteLines, setExtraNoteLines] = useState([]);
    const initialAnswers = preparedBrief || {};
    const clientQuoteLink = Boolean(preparedBriefId || submittedEnquiryId);
    const needsUnlock = Boolean((preparedBriefId && !preparedBrief) || (submittedEnquiryId && !loadedEnquiry));
    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [company, setCompany] = useState('');
    const [callDate, setCallDate] = useState('');
    const [callTime, setCallTime] = useState('');
    const [interests, setInterests] = useState(() => selectedInterest ? [selectedInterest] : []);
    const [hasWebsite, setHasWebsite] = useState('');
    const [teamSize, setTeamSize] = useState('');
    const [customerCount, setCustomerCount] = useState('');
    const [liveCustomerCount, setLiveCustomerCount] = useState('');
    const [software, setSoftware] = useState([]);
    const [otherSoftware, setOtherSoftware] = useState('');
    const [dataStart, setDataStart] = useState('');
    const [fileStorage, setFileStorage] = useState(() => initialStoreFiles == null ? '' : initialStoreFiles ? 'Yes' : 'No');
    const [storageProvider, setStorageProvider] = useState('');
    const [branches, setBranches] = useState('');
    const [partnerOffices, setPartnerOffices] = useState('');
    const [channelPartners, setChannelPartners] = useState('');
    const [installationTeams, setInstallationTeams] = useState('');
    const [stampStaffLogin, setStampStaffLogin] = useState('');
    const [technicianLogin, setTechnicianLogin] = useState('');
    const [prepareMode, setPrepareMode] = useState(startInPrepareMode);
    const [prepareUnlocked, setPrepareUnlocked] = useState(false);
    const [adminScreen, setAdminScreen] = useState('list');
    const [adminCatalog, setAdminCatalog] = useState([]);
    const [adminFilter, setAdminFilter] = useState('all');
    const [adminSearch, setAdminSearch] = useState('');
    const [selectedAdminItem, setSelectedAdminItem] = useState(null);
    const [preparePin, setPreparePin] = useState('');
    const [savedMatches, setSavedMatches] = useState([]);
    const [shareLink, setShareLink] = useState('');
    const [shareCode, setShareCode] = useState('');
    const [linkCopied, setLinkCopied] = useState(false);
    const [inviteCopied, setInviteCopied] = useState(false);
    const [accessCode, setAccessCode] = useState('');
    const [remarks, setRemarks] = useState('');
    const [step, setStep] = useState('contact');
    const [draftAccess, setDraftAccess] = useState(null);
    const [draftStatus, setDraftStatus] = useState('saved');
    const [mobileQuestionStep, setMobileQuestionStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const identityRef = useRef(null);
    const savingRef = useRef(false);
    const lastSavedDraftRef = useRef('');
    const draftQueueRef = useRef(Promise.resolve());
    const detailsRef = useRef(null);
    const formSectionRef = useRef(null);
    const nameRef = useRef(null);
    const formId = useId();
    const {showConfirm} = useGlobalPopup();
    const optionalDirty = Boolean(company || callDate || callTime || remarks || hasWebsite || teamSize || customerCount || liveCustomerCount || software.length || (software.includes('Other third-party software') && otherSoftware) || dataStart || branches || partnerOffices || channelPartners || installationTeams || stampStaffLogin || technicianLogin || fileStorage || storageProvider || interests.join('|') !== selectedInterest);
    const draftAnswers = normalizeDraftAnswers({name, mobile, company, callDate, callTime, interests, hasWebsite, teamSize,
        customerCount, liveCustomerCount, software, otherSoftware, dataStart, fileStorage,
        storageProvider, branches, partnerOffices, channelPartners, installationTeams,
        stampStaffLogin, technicianLogin, customRequest:remarks});
    const draftSnapshot = JSON.stringify(draftAnswers);
    const dirty = draftAccess ? draftSnapshot !== lastSavedDraftRef.current : prepareMode ? Boolean(name || mobile || optionalDirty) : step === 'contact' ? Boolean(name || mobile) : step === 'details' && optionalDirty;
    const guidedMobile = Boolean(((preparedBriefId && preparedBrief) || (submittedEnquiryId && loadedEnquiry)) && step === 'details');
    const mobileSectionClass = index => guidedMobile && mobileQuestionStep !== index ? 'hidden sm:block' : '';
    const goToMobileQuestion = index => {
        setMobileQuestionStep(index);
        formSectionRef.current?.scrollIntoView({behavior:'smooth', block:'start'});
    };

    useEffect(() => {
        if (!isModal) return;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        nameRef.current?.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [isModal]);
    useEffect(() => {
        if (step === 'details') detailsRef.current?.focus();
    }, [step]);
    useEffect(() => {
        if (!dirty) return;
        const warn = event => {event.preventDefault(); event.returnValue = '';};
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const persistDraft = useCallback((snapshot = draftSnapshot) => {
        if (!draftAccess || snapshot === lastSavedDraftRef.current) return draftQueueRef.current;
        setDraftStatus('saving');
        const {kind, id, code} = draftAccess;
        const next = draftQueueRef.current.catch(() => {}).then(async () => {
            if (snapshot === lastSavedDraftRef.current) return;
            await saveClientFormDraft(supabase, kind, id, code, JSON.parse(snapshot));
            lastSavedDraftRef.current = snapshot;
            setDraftStatus('saved');
        }).catch(() => {setDraftStatus('error'); return false;});
        draftQueueRef.current = next;
        return next;
    }, [draftAccess, draftSnapshot]);
    useEffect(() => {
        if (!draftAccess || draftSnapshot === lastSavedDraftRef.current || step === 'done') return;
        setDraftStatus('saving');
        const timer = window.setTimeout(() => persistDraft(draftSnapshot), 550);
        return () => window.clearTimeout(timer);
    }, [draftAccess, draftSnapshot, step, persistDraft]);
    useEffect(() => {
        if (!draftAccess) return;
        const flush = () => {if (document.visibilityState === 'hidden') persistDraft();};
        document.addEventListener('visibilitychange', flush);
        return () => document.removeEventListener('visibilitychange', flush);
    }, [draftAccess, persistDraft]);

    const requestClose = async () => {
        if (savingRef.current) return;
        if (dirty && !draftAccess) {
            const message = prepareMode ? 'Your prepared answers have not been copied into a link.' : step === 'contact' ? 'Your name and phone number have not been saved.' : 'Your contact details are saved. These optional details have not been saved.';
            if (!await showConfirm(message, {title:'Close this form?', confirmLabel:'Close form', cancelLabel:'Keep editing', type:'warning'})) return;
        }
        onClose?.();
    };
    const handleSubmit = async event => {
        event.preventDefault();
        if (savingRef.current || step === 'done') return;
        setError('');
        if (!name.trim()) {setError('Please enter your name.'); return;}
        const contactOnly = step === 'contact';
        const storeFiles = contactOnly ? 'unspecified' : fileStorage === 'Yes' ? 'yes' : fileStorage === 'No' ? 'no' : 'unspecified';
        const chosenInterests = contactOnly ? selectedInterest ? [selectedInterest] : [] : interests;
        const modelType = loadedEnquiry?.version || (chosenInterests.includes('Option 1: Small team setup') && !chosenInterests.includes('Option 2: Detailed operations') && !chosenInterests.includes('A mix of both options') ? 'basic' : chosenInterests.includes('Option 2: Detailed operations') ? 'advance' : 'both');
        let payload;
        try {
            payload = enquiryPayload({name, mobile, modelType, storeFiles, storageProvider:storeFiles === 'yes' ? storageProvider : '', selectedInterest:loadedEnquiry?.selectedInterest || selectedInterest,
                company: contactOnly && !preparedBrief ? '' : company, remarks: contactOnly ? '' : remarks,
                callDate: contactOnly ? '' : callDate, callTime: contactOnly ? '' : callTime,
                interests: chosenInterests,
                businessDetails: contactOnly ? {} : {hasWebsite, teamSize, customerCount, liveCustomerCount, software, otherSoftware:software.includes('Other third-party software') ? otherSoftware : '', dataStart, branches, partnerOffices, channelPartners, installationTeams, stampStaffLogin, technicianLogin}});
        } catch (err) {setError(err.message); return;}
        if (!loadedEnquiry && !identityRef.current) identityRef.current = {id:crypto.randomUUID(), editToken:crypto.randomUUID()};
        savingRef.current = true;
        setSubmitting(true);
        try {
            if (draftAccess && await persistDraft() === false) throw new Error('Your changes could not be saved. Please check your connection and try again.');
            if (loadedEnquiry) await updateSubmittedEnquiry(supabase, loadedEnquiry, payload, extraNoteLines);
            else await saveEnquiryStep(supabase, payload, identityRef.current, {contactOnly});
            setStep(contactOnly ? 'details' : 'done');
        } catch (err) {
            setError(err.message?.startsWith('Your contact details are saved.') ? err.message : contactOnly ? 'We could not confirm your enquiry was saved. Please try again; your details are still here.' : 'Your contact details are saved, but we could not save these extra details. Please try again or skip this step.');
        } finally {savingRef.current = false; setSubmitting(false);}
    };
    const reset = () => {
        setName(initialAnswers.name || ''); setMobile(initialAnswers.mobile || ''); setCompany(initialAnswers.company || ''); setCallDate(''); setCallTime(''); setRemarks(initialAnswers.customRequest || '');
        setInterests([...new Set([...(initialAnswers.interests || []), ...(selectedInterest ? [selectedInterest] : [])])]);
        setHasWebsite(initialAnswers.hasWebsite || ''); setTeamSize(initialAnswers.teamSize || '');
        setCustomerCount(initialAnswers.customerCount || ''); setLiveCustomerCount(initialAnswers.liveCustomerCount || '');
        setSoftware(initialAnswers.software || []); setOtherSoftware(initialAnswers.otherSoftware || ''); setDataStart(initialAnswers.dataStart || ''); setBranches(initialAnswers.branches || '');
        setFileStorage(initialAnswers.fileStorage || (initialStoreFiles == null ? '' : initialStoreFiles ? 'Yes' : 'No')); setStorageProvider(initialAnswers.storageProvider || '');
        setPartnerOffices(initialAnswers.partnerOffices || ''); setChannelPartners(initialAnswers.channelPartners || '');
        setInstallationTeams(initialAnswers.installationTeams || ''); setStampStaffLogin(initialAnswers.stampStaffLogin || ''); setTechnicianLogin(initialAnswers.technicianLogin || '');
        setError(''); identityRef.current = null; setLoadedEnquiry(null); setExtraNoteLines([]); setMobileQuestionStep(0); setStep('contact');
        setDraftAccess(null); lastSavedDraftRef.current = '';
    };
    const applyBrief = (brief, access = null) => {
        const savedAnswers = normalizeDraftAnswers({...brief, interests:[...new Set([...(brief.interests || []), ...(selectedInterest ? [selectedInterest] : [])])]});
        setPreparedBrief(brief);
        setName(brief.name || ''); setMobile(brief.mobile || ''); setCompany(brief.company || '');
        setInterests(savedAnswers.interests);
        setHasWebsite(brief.hasWebsite || ''); setTeamSize(brief.teamSize || '');
        setCustomerCount(brief.customerCount || ''); setLiveCustomerCount(brief.liveCustomerCount || '');
        setSoftware(brief.software || []); setOtherSoftware(brief.otherSoftware || ''); setBranches(brief.branches || '');
        setDataStart(brief.dataStart || ''); setRemarks(brief.customRequest || '');
        setFileStorage(brief.fileStorage || ''); setStorageProvider(brief.storageProvider || '');
        setPartnerOffices(brief.partnerOffices || ''); setChannelPartners(brief.channelPartners || '');
        setInstallationTeams(brief.installationTeams || ''); setStampStaffLogin(brief.stampStaffLogin || ''); setTechnicianLogin(brief.technicianLogin || '');
        setCallDate(brief.callDate || ''); setCallTime(brief.callTime || '');
        lastSavedDraftRef.current = JSON.stringify(savedAnswers);
        setDraftAccess(access); setDraftStatus('saved');
        setPrepareMode(false); setPrepareUnlocked(false); setPreparePin(''); setSavedMatches([]); setAccessCode(''); setMobileQuestionStep(0);
    };
    const applyEnquiry = (enquiry, access = null) => {
        const parsed = parseSubmittedEnquiryNotes(enquiry.notes);
        const answers = {...parsed, name:enquiry.name, mobile:enquiry.mobile, company:enquiry.company || '', customRequest:parsed.remarks || '', ...(enquiry.draft || {})};
        const savedAnswers = normalizeDraftAnswers(answers);
        setPreparedBrief(null); setLoadedEnquiry({id:enquiry.id, suffix:access?.code || enquiry.mobile.slice(-4), version:enquiry.version, selectedInterest:parsed.selectedInterest || ''});
        setExtraNoteLines(parsed.extraLines); setName(answers.name || ''); setMobile(answers.mobile || ''); setCompany(answers.company || '');
        setCallDate(answers.callDate || ''); setCallTime(answers.callTime || ''); setInterests(answers.interests || []);
        setHasWebsite(answers.hasWebsite || ''); setTeamSize(answers.teamSize || '');
        setCustomerCount(answers.customerCount || ''); setLiveCustomerCount(answers.liveCustomerCount || '');
        setSoftware(answers.software || []); setOtherSoftware(answers.otherSoftware || ''); setDataStart(answers.dataStart || '');
        setFileStorage(answers.fileStorage || ''); setStorageProvider(answers.storageProvider || '');
        setBranches(answers.branches || ''); setPartnerOffices(answers.partnerOffices || ''); setChannelPartners(answers.channelPartners || '');
        setInstallationTeams(answers.installationTeams || ''); setStampStaffLogin(answers.stampStaffLogin || ''); setTechnicianLogin(answers.technicianLogin || '');
        setRemarks(answers.customRequest || ''); setPrepareMode(false); setPrepareUnlocked(false); setSavedMatches([]); setError(''); setStep('details');
        lastSavedDraftRef.current = JSON.stringify(savedAnswers); setDraftAccess(access); setDraftStatus('saved');
    };
    const findSavedMatches = async () => {
        const [prepared, submitted] = await Promise.all([findOwnedPreparedBriefs(supabase, preparePin), findSubmittedEnquiries(supabase, preparePin)]);
        const matches = [...prepared.map(item => ({...item, kind:'prepared'})), ...submitted];
        if (!matches.length) throw new Error('No prepared form or submitted enquiry matches that client code.');
        if (matches.length === 1) await openSavedMatch(matches[0]);
        else setSavedMatches(matches);
    };
    const handleUnlock = async event => {
        event.preventDefault();
        if (savingRef.current) return;
        savingRef.current = true; setSubmitting(true); setError('');
        try {
            if (submittedEnquiryId) {
                const enquiry = await openSubmittedEnquiry(supabase, submittedEnquiryId, accessCode);
                enquiry.draft = await readClientFormDraft(supabase, 'enquiry', submittedEnquiryId, accessCode);
                applyEnquiry(enquiry, {kind:'enquiry', id:submittedEnquiryId, code:accessCode});
            } else {
                const brief = await unlockSavedBrief(supabase, preparedBriefId, accessCode);
                const draft = await readClientFormDraft(supabase, 'prepared', preparedBriefId, accessCode);
                applyBrief({...brief, ...draft}, {kind:'prepared', id:preparedBriefId, code:accessCode});
            }
        }
        catch (err) { setError(err.message || 'Could not open this prepared form.'); }
        finally { savingRef.current = false; setSubmitting(false); }
    };
    const toggleList = (setter, option, checked) => setter(current => checked ? [...new Set([...current, option])] : current.filter(item => item !== option));
    const handlePrepareUnlock = async event => {
        event.preventDefault();
        if (savingRef.current) return;
        savingRef.current = true; setSubmitting(true); setError('');
        try {
            if (preparePin === '0905') {
                setAdminCatalog(await listAdminEnquiries(supabase, preparePin));
                setPrepareUnlocked(true);
                setAdminScreen('list');
            } else {
                await findSavedMatches();
            }
        } catch (err) { setError(err.message || 'Could not open the saved form. Please try again.'); }
        finally { savingRef.current = false; setSubmitting(false); }
    };
    const openSavedMatch = async match => {
        if (match.kind === 'enquiry') {
            const draft = await readClientFormDraft(supabase, 'enquiry', match.id, preparePin);
            applyEnquiry({...match, draft}, {kind:'enquiry', id:match.id, code:preparePin});
        } else {
            const brief = await unlockSavedBrief(supabase, match.id, preparePin);
            const draft = await readClientFormDraft(supabase, 'prepared', match.id, preparePin);
            applyBrief({...brief, ...draft}, {kind:'prepared', id:match.id, code:preparePin});
        }
    };
    const openSelectedMatch = async match => {
        if (savingRef.current) return;
        savingRef.current = true; setSubmitting(true); setError('');
        try { await openSavedMatch(match); }
        catch (err) { setError(err.message || 'Could not open the saved form.'); }
        finally { savingRef.current = false; setSubmitting(false); }
    };
    const findSavedInstead = async () => {
        if (savingRef.current) return;
        savingRef.current = true; setSubmitting(true); setError('');
        try {
            await findSavedMatches();
        } catch (err) { setError(err.message || 'Could not find saved forms.'); }
        finally { savingRef.current = false; setSubmitting(false); }
    };
    const makeShareLink = async () => {
        if (savingRef.current) return;
        if (!name.trim() || !company.trim() || !/^\d{10}$/.test(mobile.trim().replace(/[\s()-]/g, '').replace(/^\+91/, ''))) {
            setError('Enter the client name, a valid 10-digit phone number, and company name.');
            return;
        }
        savingRef.current = true; setSubmitting(true); setError('');
        try {
            const saved = await createSavedBrief(supabase, {
                name, mobile, company, hasWebsite, teamSize, customerCount, liveCustomerCount, software, otherSoftware, dataStart, customRequest:remarks, branches, partnerOffices, channelPartners, installationTeams, stampStaffLogin, technicianLogin, fileStorage, storageProvider, interests
            }, preparePin);
            const link = preparedBriefLink(window.location.origin + window.location.pathname, saved.id);
            setShareLink(link); setShareCode(saved.code); setLinkCopied(false); setInviteCopied(false);
            setAdminCatalog(current => [{kind:'prepared', id:saved.id, name:name.trim(), mobile:mobile.trim().replace(/[\s()-]/g, '').replace(/^\+91/, ''), company:company.trim(), created_at:new Date().toISOString(), can_share:true, expires_at:new Date(Date.now()+30*86400000).toISOString()}, ...current]);
            setSelectedAdminItem(null); setAdminScreen('list');
            try { await navigator.clipboard.writeText(link); setLinkCopied(true); } catch { /* The link remains selectable below. */ }
        } catch (err) { setError(err.message || 'Could not prepare the client form.'); }
        finally { savingRef.current = false; setSubmitting(false); }
    };
    const copyInviteMessage = async () => {
        const message = `To get your custom SolarFlow quotation, open this link: ${shareLink}\nUse access code ${shareCode} to open your form. Review or change any answers, then tell us what else you need.`;
        try { await navigator.clipboard.writeText(message); setInviteCopied(true); setError(''); }
        catch { setError('Could not copy the message. You can still copy the client link above.'); }
    };
    const copyShareLink = async () => {
        try { await navigator.clipboard.writeText(shareLink); setLinkCopied(true); setError(''); }
        catch { setError('Could not copy the link. You can select and copy it from the field below.'); }
    };
    const startNewPreparedForm = () => {
        reset(); setPreparedBrief(null); setShareLink(''); setShareCode(''); setLinkCopied(false); setSelectedAdminItem(null); setAdminScreen('new');
    };
    const selectAdminItem = item => {
        setSelectedAdminItem(item); setShareLink(''); setShareCode(''); setLinkCopied(false); setInviteCopied(false); setError('');
    };
    const shareAdminItem = async item => {
        if (item.kind === 'prepared' && !item.can_share) {setError(item.access_status === 'paused' ? 'This form is paused after too many incorrect codes. Refresh the list and share it after the pause ends.' : 'This prepared link has expired or uses an older access code. Prepare a new form to share it again.'); return;}
        const link = item.kind === 'prepared' ? preparedBriefLink(window.location.origin + window.location.pathname, item.id) : submittedEnquiryLink(window.location.origin + window.location.pathname, item.id);
        setShareLink(link); setShareCode(item.access_code || item.mobile.slice(-4)); setLinkCopied(false); setInviteCopied(false); setError('');
        try { await navigator.clipboard.writeText(link); setLinkCopied(true); } catch { /* The link remains selectable below. */ }
    };
    const refreshAdminCatalog = async () => {
        if (savingRef.current) return;
        savingRef.current = true; setSubmitting(true); setError('');
        try {
            const latest = await listAdminEnquiries(supabase, preparePin);
            setAdminCatalog(latest);
            if (selectedAdminItem) setSelectedAdminItem(latest.find(item => item.id === selectedAdminItem.id && item.kind === selectedAdminItem.kind) || null);
        } catch (err) { setError(err.message || 'Could not refresh forms.'); }
        finally { savingRef.current = false; setSubmitting(false); }
    };
    const visibleAdminItems = adminCatalog.filter(item => (adminFilter === 'all' || item.kind === adminFilter)
        && `${item.name} ${item.company || ''} ${item.mobile}`.toLowerCase().includes(adminSearch.trim().toLowerCase()));
    const fieldClass = 'sf-input mt-1 w-full min-h-11';
    const choiceField = (label, key, value, setValue, options) => <label className="block text-xs font-bold" key={key}>
        {label}
        <select className={fieldClass} value={value} onChange={event => setValue(event.target.value)}>
            <option value="">Choose an answer (optional)</option>
            {options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
    </label>;
    const checkGrid = (options, values, setter) => <div className="grid gap-2 sm:grid-cols-2">
        {options.map(option => <label key={option} className="flex gap-2 items-center border rounded-xl border-stone-200 p-3 text-xs cursor-pointer hover:border-orange-300">
            <input type="checkbox" checked={values.includes(option)} onChange={event => toggleList(setter, option, event.target.checked)} className="accent-orange-600 w-4 h-4 shrink-0"/>
            <span>{option}</span>
        </label>)}
    </div>;
    const documentChoices = (options, showDescription = false) => <div className="grid gap-2 sm:grid-cols-2">
        {options.map(option => {
            const [title, description] = DOCUMENT_COPY[option] || [option, ''];
            return <label key={option} className="flex items-start gap-3 rounded-xl border border-stone-200 p-3 text-sm cursor-pointer hover:border-orange-300">
                <input type="checkbox" checked={interests.includes(option)} onChange={event => toggleList(setInterests, option, event.target.checked)} className="mt-0.5 accent-orange-600 w-4 h-4 shrink-0"/>
                <span><span className="font-semibold">{title}</span>{showDescription && description && <span className="block mt-1 text-xs text-stone-500 leading-relaxed">{description}</span>}</span>
            </label>;
        })}
    </div>;
    const compactChoices = options => <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2 md:grid-cols-3">
        {options.map(option => {
            return <label key={option} className="flex items-center gap-2 min-h-11 py-2 text-sm font-medium border-b border-stone-100 cursor-pointer hover:text-orange-700">
                <input type="checkbox" checked={interests.includes(option)} onChange={event => toggleList(setInterests, option, event.target.checked)} className="accent-orange-600 w-4 h-4 shrink-0"/>
                <span>{option}</span>
            </label>;
        })}
    </div>;
    const handleModalKey = event => {
        if (event.key === 'Escape') {event.preventDefault(); requestClose();}
        if (event.key !== 'Tab') return;
        const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
        if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
    };
    const content = (
        <section ref={formSectionRef} className="w-full bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden text-stone-900 scroll-mt-20" aria-labelledby={`${formId}-title`}>
            <div className="bg-stone-900 p-4 sm:p-6 md:p-7 text-white relative">
                {isModal && step !== 'details' && <button type="button" onClick={requestClose} disabled={submitting} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Close enquiry"><X size={18}/></button>}
                {!prepareMode && step === 'details' && !clientQuoteLink && <button type="button" disabled={submitting} onClick={() => {setError(''); setStep('done');}} className="mb-4 block text-sm font-semibold text-amber-300 underline disabled:opacity-50">Skip — contact me with what’s already saved</button>}
                <p className="text-xs font-bold text-amber-300 mb-2">{needsUnlock ? 'Your custom quotation form' : prepareMode && prepareUnlocked ? 'Form overview' : prepareMode ? 'Prepare a client form' : clientQuoteLink ? 'Your custom quotation' : loadedEnquiry ? 'Saved enquiry' : step === 'contact' ? 'Step 1 · Quick enquiry' : step === 'details' ? 'Step 2 · Your business and tools' : 'Enquiry received'}</p>
                <h3 id={`${formId}-title`} className="text-xl md:text-2xl font-bold pr-8">{needsUnlock ? 'Open your quotation form' : prepareMode && !prepareUnlocked ? 'Open your form overview' : prepareMode && adminScreen === 'list' ? 'Prepared and submitted forms' : prepareMode ? 'Prepare a new client form' : clientQuoteLink && step === 'contact' ? 'Confirm your contact details' : clientQuoteLink && step === 'details' ? 'Finish your quotation form' : loadedEnquiry && step === 'details' ? 'Update the saved enquiry' : step === 'contact' ? 'How can we reach you?' : step === 'details' ? 'Tell us what you need' : 'Thank you for your interest'}</h3>
                <p className="mt-2 text-sm text-stone-300">{needsUnlock ? 'Enter the access code sent with your link to open your form.' : prepareMode && !prepareUnlocked ? 'Enter 0905 to see all prepared and submitted forms. You can also enter a client’s four-digit code to open their form directly.' : prepareMode && adminScreen === 'list' ? 'Review your forms, create a new one, or share a client link so they can finish their answers.' : prepareMode ? 'Enter the client’s contact details and any answers you know. The client can review and change any field.' : clientQuoteLink && step === 'contact' ? 'Your name, phone number and any answers already prepared are filled in. Review or change them, then continue to request your quotation.' : clientQuoteLink && step === 'details' ? 'Your saved answers are here. Tap through the short sections, change anything you need, and send your requirements.' : loadedEnquiry && step === 'details' ? 'These details were saved earlier. Update them here, or leave them as they are.' : step === 'contact' ? 'Just your name and phone number to start. You can add more details after submitting.' : step === 'details' ? 'Your contact request is saved. Answer as many questions as you like, or skip.' : 'We have your contact details and will reach out to understand your needs.'}</p>
                {selectedInterest && <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-sm text-amber-200">Interested in: {selectedInterest}</p>}
            </div>
            <div className="p-4 sm:p-6 md:p-7">
                {allowPrepare && !preparedBrief && step === 'contact' && <div className="mb-5 flex flex-wrap gap-2">
                    <button type="button" onClick={() => {setPrepareMode(false); setPrepareUnlocked(false); setPreparePin(''); setSavedMatches([]); setError('');}} className={`min-h-11 w-full sm:w-auto rounded-xl px-4 py-2 text-xs font-bold ${!prepareMode ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}>I’m enquiring</button>
                    <button type="button" onClick={() => {setPrepareMode(true); setError('');}} className={`min-h-11 w-full sm:w-auto rounded-xl px-4 py-2 text-xs font-bold ${prepareMode ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}>Prepare a form for a client</button>
                </div>}
                {needsUnlock ? <form onSubmit={handleUnlock} className="space-y-4">
                    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
                    <label className="block text-sm font-bold">4-digit access code
                        <input required maxLength={4} autoComplete="one-time-code" inputMode="numeric" value={accessCode} onChange={event => setAccessCode(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Enter code" className="sf-input mt-2 w-full text-lg tracking-widest"/>
                    </label>
                    <button type="submit" disabled={submitting} className="w-full min-h-12 py-3 rounded-xl bg-stone-900 text-white font-bold text-sm disabled:opacity-50">{submitting ? 'Opening…' : 'Open my form'}</button>
                    <a href="#/plans" className="block text-center text-xs text-stone-600 underline">Start a new form instead</a>
                </form> : prepareMode && !prepareUnlocked ? <form onSubmit={handlePrepareUnlock} className="space-y-4">
                    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
                    <label className="block text-xs font-bold">Four-digit code
                        <input required type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" value={preparePin} onChange={event => {setPreparePin(event.target.value.replace(/\D/g, '').slice(0, 4)); setSavedMatches([]);}} placeholder="Preparation or client code" className={fieldClass}/>
                    </label>
                    <button type="submit" disabled={submitting} className="w-full min-h-11 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{submitting ? 'Checking…' : preparePin === '0905' ? 'Open form overview' : 'Open saved form'}</button>
                    {preparePin === '0905' && <button type="button" disabled={submitting} onClick={findSavedInstead} className="w-full min-h-11 rounded-xl border border-stone-300 px-4 py-3 text-sm font-bold text-stone-800 disabled:opacity-50">Open a saved form ending 0905</button>}
                    {savedMatches.length > 1 && <div className="space-y-2" role="group" aria-label="Saved client forms"><p className="text-xs text-stone-600">More than one client uses this code. Choose the correct form:</p>{savedMatches.map(match => <button key={`${match.kind}-${match.id}`} type="button" disabled={submitting} onClick={() => openSelectedMatch(match)} className="w-full min-h-11 rounded-xl border border-stone-200 px-4 py-3 text-left text-sm hover:border-orange-400 disabled:opacity-50"><strong className="block">{match.name}</strong><span className="text-stone-600">{match.company || 'No company given'} · {match.kind === 'enquiry' ? 'Submitted enquiry' : 'Prepared form'}</span></button>)}</div>}
                </form> : prepareMode && prepareUnlocked && adminScreen === 'list' ? (
                    <div className="space-y-5">
                        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
                        <button type="button" onClick={startNewPreparedForm} className="w-full min-h-12 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white">+ Prepare a new client form</button>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter forms">
                            {[['all','All'],['prepared','Prepared'],['enquiry','Submitted']].map(([value,label]) => <button key={value} type="button" onClick={() => setAdminFilter(value)} className={`min-h-11 rounded-full px-4 text-xs font-bold ${adminFilter === value ? 'bg-orange-500 text-stone-950' : 'bg-stone-100 text-stone-700'}`}>{label}</button>)}
                        </div>
                        <label className="block text-xs font-bold">Find a client
                            <input type="search" value={adminSearch} onChange={event => setAdminSearch(event.target.value)} placeholder="Search name, company or phone" className={fieldClass}/>
                        </label>
                        <div className="flex items-center justify-between gap-3"><p className="text-xs text-stone-500">{visibleAdminItems.length} form{visibleAdminItems.length === 1 ? '' : 's'}</p><button type="button" onClick={refreshAdminCatalog} disabled={submitting} className="min-h-11 px-2 text-xs font-bold text-orange-700 underline disabled:opacity-50">{submitting ? 'Refreshing…' : 'Refresh list'}</button></div>
                        <div className="max-h-96 overflow-y-auto space-y-2" aria-label="Client forms">
                            {visibleAdminItems.map(item => <button key={`${item.kind}-${item.id}`} type="button" onClick={() => selectAdminItem(item)} className={`w-full rounded-xl border p-3 text-left ${selectedAdminItem?.id === item.id && selectedAdminItem?.kind === item.kind ? 'border-orange-500 bg-orange-50' : 'border-stone-200 hover:border-orange-300'}`}>
                                <span className="flex items-start justify-between gap-2"><strong className="text-sm text-stone-900">{item.name}</strong><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${item.kind === 'enquiry' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{item.kind === 'enquiry' ? 'Submitted' : item.access_status === 'paused' ? 'Paused' : item.can_share ? 'Prepared' : 'Expired'}</span></span>
                                <span className="mt-1 block text-xs text-stone-600">{item.company || 'No company'} · {item.mobile || 'No phone saved'}</span>
                                <span className="mt-1 block text-[11px] text-stone-500">{new Date(item.created_at).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}</span>
                            </button>)}
                            {!visibleAdminItems.length && <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">No forms match this view.</p>}
                        </div>
                        {selectedAdminItem && <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4">
                            <div><p className="text-xs font-bold text-orange-800">{selectedAdminItem.kind === 'enquiry' ? 'Submitted enquiry' : 'Prepared form'}</p><h4 className="mt-1 text-lg font-black">{selectedAdminItem.name}</h4><p className="text-sm text-stone-700">{selectedAdminItem.company || 'No company'} · {selectedAdminItem.mobile || 'No phone saved'}</p></div>
                            {selectedAdminItem.kind === 'enquiry' && <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3 font-sans text-xs text-stone-700">{selectedAdminItem.notes || 'Contact details saved; the client has not added extra answers yet.'}</pre>}
                            {selectedAdminItem.draft_updated_at && <p className="text-xs text-emerald-800">Client changes saved {new Date(selectedAdminItem.draft_updated_at).toLocaleString('en-IN')}.</p>}
                            {selectedAdminItem.kind === 'prepared' && <p className="text-xs text-stone-600">{selectedAdminItem.access_status === 'paused' ? 'This link is paused after too many incorrect codes. It can be opened again after the pause ends.' : selectedAdminItem.can_share ? `Share the link and access code ${selectedAdminItem.access_code}. They can then finish their answers.` : 'This link can no longer be opened with the phone code.'}</p>}
                            <button type="button" disabled={selectedAdminItem.kind === 'prepared' && !selectedAdminItem.can_share} onClick={() => shareAdminItem(selectedAdminItem)} className="w-full min-h-11 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Copy client link</button>
                        </div>}
                        {shareLink && <div className="space-y-3 rounded-xl bg-emerald-50 p-3" role="status"><p className="text-sm font-bold text-emerald-800">Form saved · client link ready to share</p><label className="block text-xs font-bold">Client link<input readOnly value={shareLink} onFocus={event => event.target.select()} className={fieldClass}/></label><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={copyShareLink} className="min-h-11 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white">{linkCopied ? 'Link copied' : 'Copy link'}</button><button type="button" onClick={copyInviteMessage} className="min-h-11 rounded-xl border border-emerald-700 px-4 py-3 text-sm font-bold text-emerald-900">{inviteCopied ? 'Invitation copied' : 'Copy invitation message'}</button></div><p className="text-xs font-semibold text-stone-700">Access code: {shareCode}. Check the client’s saved phone number above before sending.</p></div>}
                    </div>
                ) : !prepareMode && step === 'done' ? (
                    <div className="text-center space-y-4 py-4" role="status">
                        <CheckCircle2 className="mx-auto w-10 h-10 text-emerald-600"/>
                        <p className="text-sm">{clientQuoteLink ? 'Your quotation request is saved. We’ll contact you to discuss the right setup.' : 'Your enquiry is saved with contact number'} {!clientQuoteLink && <strong>{mobile}</strong>}</p>
                        {clientQuoteLink && <button type="button" onClick={() => setStep('details')} className="sf-btn-secondary">Edit my answers</button>}
                        {!clientQuoteLink && <button type="button" onClick={isModal ? requestClose : reset} className="sf-btn-secondary">{isModal ? 'Done' : 'Submit another enquiry'}</button>}
                    </div>
                ) : (
                    <form onSubmit={prepareMode ? event => {event.preventDefault(); makeShareLink();} : handleSubmit} className="space-y-5">
                        {prepareMode && prepareUnlocked && <button type="button" onClick={() => setAdminScreen('list')} className="min-h-11 text-sm font-bold text-orange-700 underline">← Back to all forms</button>}
                        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex gap-2"><AlertCircle size={16} className="shrink-0"/>{error}</p>}
                        {draftAccess && <p role="status" className={`text-xs ${draftStatus === 'error' ? 'text-rose-700' : 'text-stone-600'}`}>{draftStatus === 'error' ? 'Could not save changes. Check your connection and keep this page open.' : draftStatus === 'saving' || dirty ? 'Saving changes automatically…' : 'All changes saved automatically. You can reopen this link to edit them.'}</p>}
                        <fieldset disabled={submitting} className="space-y-5">
                            {step === 'contact' && !prepareMode ? (
                                <div className="space-y-4">
                                    {preparedBrief && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Your form is ready. Review or change any details, then continue to the quotation questions.</p>}
                                    <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="block text-xs font-bold">Name <span aria-hidden="true">*</span>
                                        <input ref={nameRef} required maxLength={200} autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className={fieldClass}/>
                                    </label>
                                    <label className="block text-xs font-bold">Phone number <span aria-hidden="true">*</span>
                                        <input required type="tel" autoComplete="tel" maxLength={20} value={mobile} onChange={e => setMobile(e.target.value)} placeholder="10-digit mobile number" className={fieldClass}/>
                                    </label>
                                    {preparedBrief && <label className="block text-xs font-bold sm:col-span-2">Company name (optional)
                                        <input maxLength={300} autoComplete="organization" value={company} onChange={e => setCompany(e.target.value)} className={fieldClass}/>
                                    </label>}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {prepareMode && <fieldset className="space-y-3 rounded-2xl border border-stone-200 p-4 md:p-5">
                                        <legend className="px-2 text-sm font-black">Client contact</legend>
                                        <p className="text-xs text-stone-500">These three fields are required. You can fill the remaining questions for the client.</p>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label className="block text-xs font-bold">Client name <span aria-hidden="true">*</span>
                                                <input required maxLength={200} autoComplete="off" value={name} onChange={event => setName(event.target.value)} placeholder="Client name" className={fieldClass}/>
                                            </label>
                                            <label className="block text-xs font-bold">Client phone number <span aria-hidden="true">*</span>
                                                <input required type="tel" maxLength={20} autoComplete="off" value={mobile} onChange={event => setMobile(event.target.value)} placeholder="10-digit mobile number" className={fieldClass}/>
                                            </label>
                                            <label className="block text-xs font-bold sm:col-span-2">Company name <span aria-hidden="true">*</span>
                                                <input required maxLength={300} autoComplete="off" value={company} onChange={event => setCompany(event.target.value)} placeholder="Company name" className={fieldClass}/>
                                            </label>
                                        </div>
                                        <div className="mt-4 rounded-xl bg-orange-50 p-3">
                                            <p className="text-xs text-stone-700">You can save and share with just these contact details, or fill more answers below first.</p>
                                            <button type="submit" className="mt-3 min-h-11 w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{submitting ? 'Saving…' : 'Save form and get share link'}</button>
                                        </div>
                                    </fieldset>}
                                    {!prepareMode && <div ref={detailsRef} tabIndex={-1} className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 outline-none">{clientQuoteLink ? 'Your contact details (you can edit them below)' : loadedEnquiry ? 'Saved enquiry' : 'Contact saved'}{!clientQuoteLink && `: ${name} · ${mobile}`}</div>}
                                    {guidedMobile && <p className="sm:hidden text-xs font-bold text-orange-700">Section {mobileQuestionStep + 1} of 6</p>}
                                    {!prepareMode && <div className={mobileSectionClass(0)}><div className="grid gap-4 sm:grid-cols-2">
                                        {clientQuoteLink && <>
                                            <label className="block text-xs font-bold">Name
                                                <input required maxLength={200} autoComplete="name" value={name} onChange={e => setName(e.target.value)} className={fieldClass}/>
                                            </label>
                                            <label className="block text-xs font-bold">Phone number
                                                <input required type="tel" maxLength={20} autoComplete="tel" value={mobile} onChange={e => setMobile(e.target.value)} className={fieldClass}/>
                                            </label>
                                        </>}
                                        <label className="block text-xs font-bold sm:col-span-2">Company name (optional)
                                            <input maxLength={300} autoComplete="organization" value={company} onChange={e => setCompany(e.target.value)} className={fieldClass}/>
                                        </label>
                                        <label className="block text-xs font-bold">Preferred call date (optional)
                                            <input type="date" value={callDate} onChange={e => setCallDate(e.target.value)} className={fieldClass}/>
                                        </label>
                                        <label className="block text-xs font-bold">Preferred call time (optional, India time)
                                            <input type="time" value={callTime} onChange={e => setCallTime(e.target.value)} className={fieldClass}/>
                                        </label>
                                    </div></div>}
                                    <fieldset className={`${mobileSectionClass(0)} space-y-4 rounded-2xl border border-stone-200 p-4 md:p-5`}>
                                        <legend className="px-2 text-sm font-black">1 · Your business</legend>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            {choiceField('Do you have a website?', 'hasWebsite', hasWebsite, setHasWebsite, YES_NO_OPTIONS)}
                                            {choiceField('How many employees?', 'teamSize', teamSize, setTeamSize, TEAM_SIZE_OPTIONS)}
                                            <label className="block text-xs font-bold">How many customers in total?
                                                <input type="number" min="0" max="99999999" inputMode="numeric" value={customerCount} onChange={event => setCustomerCount(event.target.value)} placeholder="Approximate number" className={fieldClass}/>
                                            </label>
                                            <label className="block text-xs font-bold">How many live / active customers?
                                                <input type="number" min="0" max="99999999" inputMode="numeric" value={liveCustomerCount} onChange={event => setLiveCustomerCount(event.target.value)} placeholder="Approximate number" className={fieldClass}/>
                                            </label>
                                        </div>
                                        <p className="text-xs font-bold">What software do you currently use? <span className="font-normal text-stone-500">Tick any that apply.</span></p>
                                        {checkGrid(SOFTWARE_OPTIONS, software, setSoftware)}
                                        <div className="pt-2">{choiceField('Would you like to transfer your existing data or start fresh?', 'dataStart', dataStart, setDataStart, DATA_START_OPTIONS)}</div>
                                        {software.includes('Other third-party software') && <label className="block text-xs font-bold">Which other software do you use? (optional)
                                            <input type="text" maxLength={200} value={otherSoftware} onChange={event => setOtherSoftware(event.target.value)} placeholder="Enter software name" className={fieldClass}/>
                                        </label>}
                                    </fieldset>
                                    <fieldset className={`${mobileSectionClass(1)} space-y-4 rounded-2xl border border-stone-200 p-4 md:p-5`}>
                                        <legend className="px-2 text-sm font-black">2 · Offices and partners</legend>
                                        <div className="grid gap-4 sm:grid-cols-3">
                                            {choiceField('Do you have branches?', 'branches', branches, setBranches, YES_NO_OPTIONS)}
                                            {choiceField('Channel partner offices?', 'partnerOffices', partnerOffices, setPartnerOffices, YES_NO_OPTIONS)}
                                            {choiceField('Channel partners?', 'channelPartners', channelPartners, setChannelPartners, YES_NO_OPTIONS)}
                                            {choiceField('Do you use third-party or multiple installation teams?', 'installationTeams', installationTeams, setInstallationTeams, YES_NO_OPTIONS)}
                                            {choiceField('Do you need a stamp staff login?', 'stampStaffLogin', stampStaffLogin, setStampStaffLogin, YES_NO_OPTIONS)}
                                            {choiceField('Do you need technician logins?', 'technicianLogin', technicianLogin, setTechnicianLogin, YES_NO_OPTIONS)}
                                        </div>
                                    </fieldset>
                                    <fieldset className={`${mobileSectionClass(2)} space-y-3 rounded-2xl border border-stone-200 p-4 md:p-5`}>
                                        <legend className="px-2 text-sm font-black">3 · File storage</legend>
                                        <p className="text-xs text-stone-500">Do you want to store uploaded files with customer records?</p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {['Yes','No'].map(option => <label key={option} className={`flex gap-3 rounded-xl border p-3 cursor-pointer ${fileStorage === option ? 'border-orange-400 bg-orange-50' : 'border-stone-200'}`}>
                                                <input type="radio" name={`${formId}-file-storage`} value={option} checked={fileStorage === option} onChange={() => setFileStorage(option)} className="accent-orange-600 mt-0.5"/>
                                                <span className="text-xs"><strong className="block text-sm">{option === 'Yes' ? 'Yes, store files' : 'No, use simple checklists'}</strong>{option === 'No' && <span className="block mt-1 text-stone-600">Included at no extra cost.</span>}</span>
                                            </label>)}
                                        </div>
                                        {fileStorage === 'Yes' && <div className="space-y-2 pt-2">
                                            <p className="text-xs font-bold">Which storage account would you prefer? (optional)</p>
                                            <div className="space-y-2">
                                                {STORAGE_PRICING.map(provider => <label key={provider.name} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${storageProvider === provider.name ? 'border-orange-400 bg-orange-50' : 'border-stone-200'}`}>
                                                    <input type="radio" name={`${formId}-storage-provider`} checked={storageProvider === provider.name} onChange={() => setStorageProvider(provider.name)} className="accent-orange-600 mt-0.5"/>
                                                    <span className="text-xs leading-relaxed"><strong className="block text-sm">{provider.name}</strong><span className="block mt-1">{provider.price}</span><span className="block text-stone-500">{provider.detail}</span><a href={provider.href} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} className="text-orange-700 underline">Provider pricing</a></span>
                                                </label>)}
                                            </div>
                                            <p className="text-[11px] text-stone-500">Storage plans are third-party charges paid to the provider. Prices and taxes can change; check the linked plan before buying.</p>
                                        </div>}
                                    </fieldset>
                                    <fieldset className={`${mobileSectionClass(3)} space-y-3 rounded-2xl border border-stone-200 p-4 md:p-5`}>
                                        <legend className="px-2 text-sm font-black">4 · Automated documents</legend>
                                        <p className="text-xs text-stone-500">Select the documents you want us to automate.</p>
                                        {documentChoices(CORE_DOCUMENT_OPTIONS, true)}
                                    </fieldset>
                                    <fieldset className={`${mobileSectionClass(4)} space-y-3 rounded-2xl border border-stone-200 p-4 md:p-5`}>
                                        <legend className="px-2 text-sm font-black">5 · Optional document makers</legend>
                                        <p className="text-xs text-stone-500">The delivery truck tally checklist shows the total quantity of each item to load onto the truck.</p>
                                        {documentChoices(OPTIONAL_DOCUMENT_OPTIONS)}
                                    </fieldset>
                                    <fieldset className={`${mobileSectionClass(5)} space-y-3 rounded-2xl border border-stone-200 p-4 md:p-5`}>
                                        <legend className="px-2 text-sm font-black">6 · Other features</legend>
                                        <p className="text-xs text-stone-500">Pick anything else your team needs. MIS upload automation is an extra feature.</p>
                                        {compactChoices(OTHER_INTEREST_OPTIONS)}
                                    </fieldset>
                                    <div className={mobileSectionClass(5)}><label className="block text-xs font-bold">Custom request (optional)
                                        <textarea maxLength={prepareMode ? 2000 : 5000} rows={4} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Tell us anything else you need" className={fieldClass}/>
                                    </label></div>
                                    {guidedMobile && <div className="sm:hidden flex gap-3">
                                        {mobileQuestionStep > 0 && <button type="button" onClick={() => goToMobileQuestion(mobileQuestionStep - 1)} className="min-h-12 flex-1 rounded-xl border border-stone-300 px-4 py-3 text-sm font-bold">Back</button>}
                                        {mobileQuestionStep < 5 && <button type="button" onClick={() => goToMobileQuestion(mobileQuestionStep + 1)} className="min-h-12 flex-1 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white">Next</button>}
                                    </div>}
                                </>
                            )}
                            {prepareMode ? <>
                                <p className="text-xs text-stone-500">Share the link and access code with your client. The form stays available for 30 days, and they can change any answer.</p>
                                <button type="submit" disabled={submitting} className="w-full min-h-11 py-3 rounded-xl bg-stone-900 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"><Copy size={16}/>{submitting ? 'Saving…' : 'Save form and get share link'}</button>
                                {shareLink && <div className="rounded-xl bg-emerald-50 p-3 space-y-3" role="status"><p className="text-sm font-bold text-emerald-800">Ready to send for a custom quotation</p><label className="block text-xs font-bold">Client link<input readOnly value={shareLink} onFocus={event => event.target.select()} className={fieldClass} aria-label="Prepared client form link"/></label><button type="button" onClick={copyInviteMessage} className="min-h-11 w-full rounded-xl border border-emerald-700 px-4 py-3 text-sm font-bold text-emerald-900">{inviteCopied ? 'Invitation copied' : 'Copy invitation message'}</button><p className="text-xs text-stone-600">Client access code: {shareCode}</p></div>}
                            </> : clientQuoteLink && step === 'contact' ? <button key="continue-to-questions" type="button" onClick={event => {event.preventDefault(); setError(''); setStep('details');}} className="flex w-full min-h-12 py-3 rounded-xl bg-stone-900 text-white font-bold text-sm items-center justify-center gap-2"><ArrowRight size={16}/>Continue to questions</button> : <button key="submit-requirements" type="submit" className={`${guidedMobile && mobileQuestionStep < 5 ? 'hidden sm:flex' : 'flex'} w-full min-h-12 py-3 rounded-xl bg-stone-900 text-white font-bold text-sm items-center justify-center gap-2 disabled:opacity-50`} disabled={submitting}>
                                {submitting ? <LoaderCircle size={16} className="animate-spin"/> : <ArrowRight size={16}/>}
                                {submitting ? 'Saving…' : clientQuoteLink && step === 'contact' ? 'Request quotation and continue' : clientQuoteLink ? 'Send my requirements' : step === 'contact' ? 'Submit enquiry' : 'Save additional details'}
                            </button>}
                        </fieldset>
                    </form>
                )}
            </div>
        </section>
    );
    return isModal ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs overflow-y-auto p-3 sm:p-4 flex items-start justify-center" role="dialog" aria-modal="true" aria-labelledby={`${formId}-title`} onKeyDown={handleModalKey}>
            <div className="w-full max-w-2xl my-3 sm:my-8">{content}</div>
        </div>
    ) : content;
}
