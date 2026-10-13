import { useDemoTourNavigation } from '../demo/tour';
import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabase";
import {
    LogOut, Search, Upload, Eye, Loader2, CheckCircle2,
    RefreshCw, X, MessageSquare, ChevronDown, ChevronUp, Save, FileText,
    SendHorizonal, User, AlertTriangle, Check, AlertCircle, FileCheck, Terminal, Phone
} from "lucide-react";
import {
    uploadDocument, getCustomerDocuments, getDownloadUrl, getViewUrl, deleteDocument, logActivity,
    updateAdminRecord, updateDocumentRemark, downloadFileWithSaveAs, getTelephoneHref,
} from "../utils.jsx";
import { FilePreviewModal } from "./modal-tabs/shared";
import { useGlobalPopup } from './GlobalPopup';
import BrandMark from './BrandMark';
import { isReturnedDocument } from './modal-tabs/shared';

const uploaderCache = {};
async function fetchUploaderName(userId) {
    if (!userId) return null;
    if (uploaderCache[userId] !== undefined) return uploaderCache[userId];
    try {
        const { data } = await supabase.from("profiles").select("name").eq("id", userId).single();
        uploaderCache[userId] = data?.name || "Unknown";
        return uploaderCache[userId];
    } catch {
        return "Unknown";
    }
}

function RemarkRow({ customerId, initialRemark, userId, customerName }) {
    const [open, setOpen] = useState(false);
    const [remark, setRemark] = useState(initialRemark || "");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    // What is actually IN the database. The collapsed "saved" badge used to read
    // `remark`, which changes on every keystroke - so typing a remark and
    // collapsing without saving still showed it as saved.
    const [persistedRemark, setPersistedRemark] = useState(initialRemark || "");

    const handleSave = async () => {
        setSaving(true);
        try {
            // The read error was discarded here. On failure `existing` is null and
            // the spread below produced { stamp_remark } alone - overwriting the
            // ENTIRE discom_submission JSON (agreement parties, stamp value,
            // stamp_sent, who completed it). Same bug that was already fixed in
            // handleSendToDocumentMaking; this copy was missed.
            const { data: existing, error: readErr } = await supabase.from("admin")
                .select("discom_submission").eq("id", customerId).single();
            if (readErr) throw readErr;
            const merged = { ...(existing?.discom_submission || {}), stamp_remark: remark };
            const { ok, error } = await updateAdminRecord(customerId, { discom_submission: merged });
            if (!ok) throw error;
            await logActivity(userId, "update", customerName + ": Updated stamp remark", "", customerId);
            setPersistedRemark(remark);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            console.error("Save remark failed:", err);
            alert("Failed to save stamp remark: " + (err.message || "Unknown error"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="border-t border-stone-100 pt-2.5">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 text-stone-500 hover:text-stone-800 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
            >
                <MessageSquare size={12} className="text-amber-500" />
                <span>Stamp Remark</span>
                {persistedRemark && !open && (
                    <span className="bg-amber-100 text-amber-800 rounded-md text-[9px] px-1.5 py-0.2 font-extrabold">
                        saved
                    </span>
                )}
                {remark !== persistedRemark && (
                    <span className="bg-stone-200 text-stone-700 rounded-md text-[9px] px-1.5 py-0.2 font-extrabold">
                        unsaved
                    </span>
                )}
                {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {open && (
                <div className="mt-2 space-y-2 animate-in slide-in-from-top-1 duration-150">
                    <textarea
                        value={remark}
                        onChange={e => setRemark(e.target.value)}
                        placeholder="Add notes or remarks about this stamp..."
                        rows={2}
                        className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                    />
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                            saved
                                ? 'bg-emerald-500 text-white'
                                : 'bg-stone-900 hover:bg-stone-800 text-white'
                        }`}
                    >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
                        {saving ? "Saving..." : saved ? "Saved!" : "Save Remark"}
                    </button>
                </div>
            )}
        </div>
    );
}

function CustomerCard({ cust, docs, user, onDocsChange, onCustomerRemoved, onPreviewDoc }) {
    const { showAlert, showImageCropper } = useGlobalPopup();
    const fileInputRef = useRef(null);
    const stampDoc = docs.find(d => d.doc_type === "pm_surya_ghar_stamp");
    const isUploaded = !!stampDoc;
    const [uploading, setUploading] = useState(false);
    const [uploaderName, setUploaderName] = useState(null);
    const [sending, setSending] = useState(false);
    const [showConfirmSend, setShowConfirmSend] = useState(false);
    const subDetails = cust.discom_submission || {};
    const initialRemark = subDetails.stamp_remark || "";

    useEffect(() => {
        if (stampDoc?.uploaded_by) fetchUploaderName(stampDoc.uploaded_by).then(setUploaderName);
        else setUploaderName(null);
    }, [stampDoc?.uploaded_by]);

    const handleSend = async () => {
        setSending(true);
        setShowConfirmSend(false);
        try {
            // The read must succeed before merging: on failure `existing` was
            // undefined and the spread below silently dropped every existing
            // field of discom_submission (who sent it, the agreement parties,
            // stamp value...) and wrote back a near-empty object.
            const { data: existing, error: readErr } = await supabase
                .from("admin").select("discom_submission").eq("id", cust.id).single();
            if (readErr) throw readErr;

            const merged = {
                ...(existing?.discom_submission || {}),
                stamp_sent: true,
                stamp_completed_at: new Date().toISOString(),
                stamp_completed_by: user?.name || "Stamp Maker",
                stamp_sendback_remark: null,
            };
            // Unchecked before. A blocked write (RLS on the stamp role) still
            // fell through to onCustomerRemoved(), so the record vanished from
            // the stamp maker's list while stamp_sent was never set - the office
            // never saw it as stamped and nobody was told.
            const { ok: writeOk, error: writeErr } = await updateAdminRecord(cust.id, { discom_submission: merged });
            if (!writeOk) throw writeErr;

            await logActivity(user.id, "update",
                cust.customer_name + ": Stamp sent to Document Making", "", cust.id);
            onCustomerRemoved(cust.id);
        } catch (err) {
            showAlert(err.message, {
                title: "Action Failed",
                type: "error"
            });
        } finally {
            setSending(false);
        }
    };

    const handleFileChange = async (e) => {
        const rawFile = e.target.files?.[0];
        if (!rawFile) return;
        e.target.value = "";

        let file = rawFile;
        if (showImageCropper) {
            file = await showImageCropper(rawFile, { title: 'Crop & Adjust Stamp Document' });
            if (!file) return; // User cancelled upload
        }

        setUploading(true);
        try {
            // Upload FIRST - deleting the old stamp before the new one existed
            // meant a failed upload left the customer with no stamp document.
            const newStampDoc = await uploadDocument(file, cust.id, "pm_surya_ghar_stamp", user.id);
            if (stampDoc && newStampDoc && stampDoc.id !== newStampDoc.id) {
                try {
                    await deleteDocument(stampDoc.id, stampDoc.storage_path);
                } catch (delErr) {
                    console.warn('New stamp saved, but removing the previous one failed:', delErr);
                }
            }
            // Unchecked before: the file uploaded but the checklist flag silently
            // failed to set, so the office saw no stamp against the customer.
            const { ok: flagOk, error: flagErr } = await updateAdminRecord(cust.id, { pm_surya_ghar_stamp: true });
            if (!flagOk) throw flagErr;
            await logActivity(user.id, "update",
                cust.customer_name + ": " + (stampDoc ? "Changed" : "Uploaded") + " PM Surya Ghar Stamp", "", cust.id);
            const updatedDocs = await getCustomerDocuments(cust.id);
            onDocsChange(cust.id, updatedDocs || []);
        } catch (err) {
            showAlert(err.message || "Failed to upload stamp document.", {
                title: "Upload Failed",
                type: "error"
            });
        } finally {
            setUploading(false);
        }
    };

    const partyRows = [
        ["First Party", subDetails.first_party],
        ["Second Party", subDetails.second_party],
        ["Purchased By", subDetails.purchased_party],
        ["Stamp Value", subDetails.stamp_value ? `₹${subDetails.stamp_value}` : ''],
        ["Description", subDetails.stamp_description],
    ].filter(([, v]) => v);

    const sendbackRemark = subDetails.stamp_sendback_remark || null;
    const sendbackBy = subDetails.stamp_sendback_by || null;

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileChange}
            />

            <div className={`bg-white rounded-[24px] border p-4 shadow-sm transition-all space-y-3.5 ${
                sendbackRemark
                    ? 'border-rose-300 ring-1 ring-rose-200'
                    : isUploaded
                        ? 'border-emerald-200/80 hover:border-emerald-300'
                        : 'border-stone-150 hover:border-amber-300'
            }`}>
                {sendbackRemark ? (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">
                                Returned by Office
                            </p>
                            <p className="text-xs font-semibold text-rose-900 mt-0.5">
                                "{sendbackRemark}"
                            </p>
                            {sendbackBy && (
                                <p className="text-[10px] text-rose-600 font-medium mt-0.5">
                                    - {sendbackBy}
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-2.5 flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                            <FileCheck size={13} />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-emerald-800">
                                Details received from Office
                            </p>
                            <p className="text-[9px] text-emerald-600 font-medium">
                                Prepare the stamp with the details below and upload.
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-extrabold text-stone-900 truncate">
                            {cust.customer_name}
                        </h3>
                        <div className="text-[10px] text-stone-400 font-medium mt-0.5 truncate flex items-center gap-1 flex-wrap">
                            {cust.consumer_no && <span>Cons: {cust.consumer_no}</span>}
                            {cust.villages && <span>• {cust.villages}</span>}
                            {cust.phone_number && (
                                <span className="inline-flex items-center gap-0.5">
                                    •
                                    {getTelephoneHref(cust.phone_number) ? (
                                        <a
                                            href={getTelephoneHref(cust.phone_number)}
                                            onClick={e => e.stopPropagation()}
                                            className="text-emerald-600 hover:underline inline-flex items-center gap-0.5 font-semibold ml-0.5"
                                            title={`Call ${cust.phone_number}`}
                                        >
                                            <Phone size={9} className="text-emerald-500" />
                                            {cust.phone_number}
                                        </a>
                                    ) : (
                                        <span className="ml-0.5">Ph: {cust.phone_number}</span>
                                    )}
                                </span>
                            )}
                        </div>
                    </div>
                    <span className={`text-[9px] font-extrabold uppercase px-2.5 py-1 rounded-full border flex-shrink-0 ${
                        isUploaded
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                        {isUploaded ? 'Stamp Ready' : 'Pending'}
                    </span>
                </div>

                {partyRows.length > 0 && (
                    <div className="bg-stone-50/80 rounded-xl border border-stone-150/70 p-3 grid grid-cols-2 gap-2 text-xs">
                        {partyRows.map(([label, val]) => (
                            <div key={label} className="min-w-0">
                                <span className="text-[9px] font-extrabold uppercase tracking-wider text-stone-400 block">
                                    {label}
                                </span>
                                <span className="font-semibold text-stone-800 text-[11px] truncate block mt-0.5">
                                    {val}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Upload / File State */}
                {isUploaded ? (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5">
                            <div 
                                onClick={() => onPreviewDoc(stampDoc)}
                                className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group"
                            >
                                <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                                <span className="text-xs font-bold text-emerald-900 truncate group-hover:underline">
                                    {stampDoc.file_name}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => onPreviewDoc(stampDoc)}
                                    className="p-1.5 text-emerald-700 hover:bg-emerald-100/60 rounded-lg transition cursor-pointer"
                                    title="View Stamp Document"
                                >
                                    <Eye size={14} />
                                </button>
                                {/* Once uploaded the stamp is locked. When office sends it back
                                    (sendbackRemark) or marks it returned, allow replacing it. */}
                                {(sendbackRemark || isReturnedDocument(stampDoc)) ? (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">Returned</span>
                                        <button
                                            type="button"
                                            disabled={uploading}
                                            onClick={() => fileInputRef.current?.click()}
                                            className="flex items-center gap-1 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold transition shadow-xs cursor-pointer"
                                            title="Replace the returned stamp document"
                                        >
                                            <Upload size={12} />
                                            <span>Change</span>
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-[9px] font-semibold text-stone-400 uppercase tracking-wide" title="Admin or Office must send this back before it can be replaced">
                                        Locked
                                    </span>
                                )}
                            </div>
                        </div>

                        {uploaderName && (
                            <p className="text-[10px] text-stone-400 font-medium pl-1 flex items-center gap-1">
                                <User size={10} />
                                <span>Uploaded by <b className="text-stone-600">{uploaderName}</b></span>
                            </p>
                        )}
                    </div>
                ) : (
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 bg-stone-900 hover:bg-stone-850 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                        {uploading ? (
                            <><Loader2 size={14} className="animate-spin" /> Uploading...</>
                        ) : (
                            <><Upload size={14} /> Upload PM Surya Ghar Stamp</>
                        )}
                    </button>
                )}

                {/* Remark Accordion */}
                <RemarkRow
                    customerId={cust.id}
                    initialRemark={initialRemark}
                    userId={user.id}
                    customerName={cust.customer_name}
                />

                {/* Send to Document Making Primary Action */}
                {isUploaded && (
                    <button
                        type="button"
                        disabled={sending}
                        onClick={() => setShowConfirmSend(true)}
                        className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-sky-600/15 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                    >
                        {sending ? (
                            <><Loader2 size={14} className="animate-spin" /> Sending to Office...</>
                        ) : (
                            <><SendHorizonal size={14} /> Send to Document Making</>
                        )}
                    </button>
                )}
            </div>

            {/* Confirmation Dialog */}
            {showConfirmSend && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
                    onClick={() => setShowConfirmSend(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl border border-stone-150 animate-in zoom-in-95 duration-200 space-y-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-600 mx-auto flex items-center justify-center">
                            <SendHorizonal size={22} />
                        </div>
                        <div className="text-center">
                            <h4 className="text-sm font-extrabold text-stone-900">Send to Document Making?</h4>
                            <p className="text-xs text-stone-500 font-medium mt-1 leading-relaxed">
                                Confirm that the PM Surya Ghar stamp is completed for <b>{cust.customer_name}</b>. It will be sent to the office for review and document preparation.
                            </p>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setShowConfirmSend(false)}
                                className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-bold text-xs hover:bg-stone-50 transition cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSend}
                                className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition cursor-pointer"
                            >
                                Yes, Send Now
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default function StampPortal({ user, onLogout, onOpenDevSwitcher, demoControls }) {
    useDemoTourNavigation(({view}) => { if (['queue','record'].includes(view)) setView(view); },user.userType);

    const { showAlert } = useGlobalPopup();
    // Completed-work ledger: the stamp maker's own record of what they finished
    // and when, grouped by month, so monthly payments can be verified from both
    // sides. Kept separate from the queue, which only holds outstanding work.
    const [view, setView] = useState('queue'); // 'queue' | 'record'
    const [completedRecords, setCompletedRecords] = useState([]);
    const [loadingRecords, setLoadingRecords] = useState(false);
    const [selectedMonthKey, setSelectedMonthKey] = useState('all');
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [custDocs, setCustDocs] = useState({});
    const [previewDoc, setPreviewDoc] = useState(null);

    const fetchCustomers = useCallback(async () => {
        setLoading(true);
        try {
            let data = [];
            let from = 0;
            const pageSize = 1000;
            while (true) {
                const { data: page, error } = await supabase
                    .from("admin")
                    // Only what the queue renders. It was select("*"), so every
                    // stamp maker pulled ~90 columns per record - including the
                    // vendor commission - for the whole queue.
                    .select("id, customer_name, phone_number, consumer_no, folder_no, villages, stage, pm_surya_ghar_stamp, discom_submission, deleted_at, created_at")
                    // Stage is deliberately not filtered - a record can be sent to
                    // the stamp maker without formally sitting in DISCOM SUBMISSION.
                    // The "sent to stamp" test is done here rather than in JS: this
                    // used to page through every row in the table (3,800+, of which
                    // ~78% are COMPLETED) just to keep a handful.
                    .eq("discom_submission->>sent_to_stamp_maker", "true")
                    // Filter at the DATABASE. Narrowing in JS afterwards still
                    // shipped every other stamp maker's customer rows over the
                    // wire, readable in the network tab. Exact match is safe
                    // here: assigned_stamp_maker is written from profiles.name
                    // via the dropdown, which is the same value as user.name.
                    .eq(user?.demo_profile_id ? "discom_submission->>assigned_stamp_maker_id" : "discom_submission->>assigned_stamp_maker", user?.demo_profile_id || (user?.name || '').trim())
                    .is("deleted_at", null)
                    .order("created_at", { ascending: false })
                    .range(from, from + pageSize - 1);
                if (error) throw error;
                if (!page || page.length === 0) break;
                data = data.concat(page);
                if (page.length < pageSize) break;
                from += pageSize;
            }
            // Only show customers sent to stamp maker and not yet finished
            // sent_to_stamp_maker is now filtered server-side; "not yet stamped"
            // stays here because the column is JSON and the flag is often absent.
            // STRICT: a stamp maker sees only work assigned to them by name.
            // An unassigned record (no assigned_stamp_maker) shows in NOBODY's
            // queue - the office has to assign it first. That is deliberate:
            // shared visibility meant two makers could both start the same job,
            // and it is the basis of the monthly payout record.
            const myName = String(user?.name || '').trim().toLowerCase();
            const active = (data || []).filter(c => {
                const sub = c.discom_submission || {};
                if (sub.stamp_sent) return false;
                const assigned = String(sub.assigned_stamp_maker || '').trim().toLowerCase();
                return !!assigned && assigned === myName;
            });
            setCustomers(active);
            if (active.length > 0) {
                const results = await Promise.all(
                    active.map(async c => ({ id: c.id, docs: (await getCustomerDocuments(c.id)) || [] }))
                );
                const docMap = {};
                results.forEach(({ id, docs }) => { docMap[id] = docs; });
                setCustDocs(docMap);
            }
        } catch (err) {
            console.error("Stamp fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [user?.name, user?.demo_profile_id]);

    useEffect(() => {
        fetchCustomers();

        const channel = supabase.channel(`stamp_customers_${user?.id || 'global'}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'admin' }, payload => {
                const record = payload.new;

                if (payload.eventType === 'DELETE') {
                    setCustomers(prev => prev.filter(c => c.id !== payload.old.id));
                    return;
                }

                // Must apply the SAME assignment rule as the initial fetch,
                // otherwise another maker's record still arrives here live and
                // reappears in this queue despite being filtered on load.
                const myNameRt = String(user?.name || '').trim().toLowerCase();
                const assignedRt = String(record?.discom_submission?.assigned_stamp_maker || '').trim().toLowerCase();
                const isStampActive = record && !record.deleted_at &&
                    record.discom_submission?.sent_to_stamp_maker === true &&
                    !record.discom_submission?.stamp_sent &&
                    !!assignedRt && assignedRt === myNameRt;

                setCustomers(prev => {
                    const exists = prev.some(c => c.id === record.id);
                    if (exists && isStampActive) {
                        return prev.map(c => c.id === record.id ? record : c);
                    } else if (exists && !isStampActive) {
                        return prev.filter(c => c.id !== record.id);
                    } else if (!exists && isStampActive) {
                        getCustomerDocuments(record.id).then(docs => {
                            setCustDocs(d => ({ ...d, [record.id]: docs || [] }));
                        });
                        return [record, ...prev];
                    }
                    return prev;
                });
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
        // user?.name is read inside the handler now (assignment check), so it
        // must be a dependency rather than a stale closure.
    }, [user?.id, user?.demo_profile_id, user?.name, fetchCustomers]);

    const handleDocsChange = useCallback((customerId, updatedDocs) => {
        setCustDocs(prev => ({ ...prev, [customerId]: updatedDocs }));
        const hasStamp = updatedDocs.some(d => d.doc_type === "pm_surya_ghar_stamp");
        setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, pm_surya_ghar_stamp: hasStamp } : c));
    }, []);

    const handleCustomerRemoved = useCallback((customerId) => {
        setCustomers(prev => prev.filter(c => c.id !== customerId));
        setCustDocs(prev => { const n = { ...prev }; delete n[customerId]; return n; });
    }, []);

    // custDocs is keyed by customer id, so the row has to be found before it can
    // be updated in place. Returns true/false: FilePreviewModal only shows
    // "Saved!" when the write actually landed.
    const handleUpdateDocRemark = async (docId, newRemark) => {
        const res = await updateDocumentRemark(docId, newRemark);
        if (!res?.ok) {
            showAlert(res?.error?.message || "The remark was not saved.", {
                title: "Remark not saved",
                type: "error",
            });
            return false;
        }
        setCustDocs(prev => {
            const next = { ...prev };
            for (const custId of Object.keys(next)) {
                if ((next[custId] || []).some(d => d.id === docId)) {
                    next[custId] = next[custId].map(d => d.id === docId ? { ...d, remark: newRemark } : d);
                }
            }
            return next;
        });
        setPreviewDoc(prev => prev && prev.doc?.id === docId
            ? { ...prev, doc: { ...prev.doc, remark: newRemark } }
            : prev);
        return true;
    };

    const handleOpenPreview = async (doc) => {
        try {
            const url = await getViewUrl(doc.storage_path);
            if (url) {
                setPreviewDoc({ doc, url });
            } else {
                showAlert("Unable to retrieve preview URL for this stamp.", {
                    title: "Preview Unavailable",
                    type: "error"
                });
            }
        } catch (err) {
            console.error("Preview error:", err);
            showAlert(err.message || "Failed to load document preview.", {
                title: "Preview Error",
                type: "error"
            });
        }
    };

    const filteredCustomers = customers.filter(c => {
        const rawQ = (searchQuery || "").trim().toLowerCase();
        if (!rawQ) return true;
        
        // Clean query for number matching (remove spaces, dashes, plus signs)
        const cleanNumberQ = rawQ.replace(/[\s\-+]/g, '');

        const name = String(c.customer_name || "").toLowerCase();
        const phone = String(c.phone_number || "").toLowerCase();
        const cleanPhone = String(c.phone_number || "").replace(/[\s\-+]/g, '');
        const consumerNo = String(c.consumer_no || "").toLowerCase();
        const cleanConsumerNo = String(c.consumer_no || "").replace(/[\s\-+]/g, '').toLowerCase();
        const folderNo = String(c.folder_no || "").toLowerCase();
        const village = String(c.villages || "").toLowerCase();
        
        const sub = c.discom_submission || {};
        const firstParty = String(sub.first_party || "").toLowerCase();
        const secondParty = String(sub.second_party || "").toLowerCase();
        const purchasedParty = String(sub.purchased_party || "").toLowerCase();

        return (
            name.includes(rawQ) ||
            consumerNo.includes(rawQ) ||
            (cleanNumberQ && cleanConsumerNo.includes(cleanNumberQ)) ||
            phone.includes(rawQ) ||
            (cleanNumberQ && cleanPhone.includes(cleanNumberQ)) ||
            folderNo.includes(rawQ) ||
            village.includes(rawQ) ||
            firstParty.includes(rawQ) ||
            secondParty.includes(rawQ) ||
            purchasedParty.includes(rawQ)
        );
    });

    const fetchCompletedRecords = useCallback(async () => {
        setLoadingRecords(true);
        try {
            const { data, error } = await supabase
                .from("admin")
                .select("id, customer_name, consumer_no, villages, discom_submission")
                .eq("discom_submission->>sent_to_stamp_maker", "true")
                .eq("discom_submission->>stamp_sent", "true")
                .eq(user?.demo_profile_id ? "discom_submission->>assigned_stamp_maker_id" : "discom_submission->>assigned_stamp_maker", user?.demo_profile_id || (user?.name || '').trim())
                .is("deleted_at", null);
            if (error) throw error;
            const myName = String(user?.name || '').trim().toLowerCase();
            const rows = (data || [])
                .filter(r => {
                    const assigned = String(r.discom_submission?.assigned_stamp_maker || '').trim().toLowerCase();
                    const completedBy = String(r.discom_submission?.stamp_completed_by || '').trim().toLowerCase();
                    // Mine only: assigned to me, or completed by me. Records with
                    // neither belong to nobody and appear in no one's record - they
                    // must not inflate anybody's payout count.
                    return (!!assigned && assigned === myName) || (!!completedBy && completedBy === myName);
                })
                .map(r => {
                const sub = r.discom_submission || {};
                const completedAt = sub.stamp_completed_at ? new Date(sub.stamp_completed_at) : null;
                const valid = completedAt && !isNaN(completedAt.getTime());
                return {
                    id: r.id,
                    customer_name: r.customer_name,
                    consumer_no: r.consumer_no,
                    villages: r.villages,
                    completedAt: valid ? completedAt : null,
                    completedBy: sub.stamp_completed_by || '–',
                    approved: !!sub.stamp_approved,
                    monthKey: valid ? `${completedAt.getFullYear()}-${String(completedAt.getMonth() + 1).padStart(2, '0')}` : 'unknown',
                };
            });
            rows.sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));
            setCompletedRecords(rows);
        } catch (err) {
            console.error("Failed to load completed stamp record:", err);
            showAlert(err.message || "Could not load your completed stamp record.", { title: "Record unavailable", type: "error" });
        } finally {
            setLoadingRecords(false);
        }
    }, [showAlert, user?.name]);

    useEffect(() => {
        if (view === 'record' && completedRecords.length === 0) fetchCompletedRecords();
    }, [view, completedRecords.length, fetchCompletedRecords]);

    // Month options, newest first
    const monthOptions = Array.from(new Set(completedRecords.map(r => r.monthKey)))
        .filter(k => k !== 'unknown')
        .sort()
        .reverse()
        .map(key => {
            const [y, m] = key.split('-');
            return { key, label: new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) };
        });

    const recordsForMonth = selectedMonthKey === 'all'
        ? completedRecords
        : completedRecords.filter(r => r.monthKey === selectedMonthKey);

    const totalCount = customers.length;
    const completedCount = customers.filter(c => c.pm_surya_ghar_stamp).length;
    const pendingCount = totalCount - completedCount;

    return (
        <div className="min-h-screen bg-[#FCFBFA] text-stone-850 font-sans flex flex-col pb-8">
            {/* Sticky Header matching Vendor / Agent Portal */}
            <header className="bg-white border-b border-stone-100 px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-sm">
                <BrandMark label="Stamp Portal" />
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-stone-600 truncate max-w-[120px]">{user?.name || "Stamp Maker"}</span>
                    <button
                        type="button"
                        onClick={fetchCustomers}
                        disabled={loading}
                        className="p-2 text-stone-400 hover:text-amber-600 transition-colors rounded-xl hover:bg-amber-50 disabled:opacity-50 cursor-pointer"
                        title="Refresh list"
                        aria-label="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {import.meta.env.DEV && onOpenDevSwitcher && (
                        <button
                            type="button"
                            onClick={onOpenDevSwitcher}
                            className="p-2 text-amber-600 hover:text-amber-700 transition-colors rounded-xl hover:bg-amber-50 cursor-pointer"
                            title="Open development role switcher"
                            aria-label="Open development role switcher"
                        >
                            <Terminal className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onLogout}
                        className="p-2 text-stone-400 hover:text-red-500 transition-colors rounded-xl hover:bg-stone-50 cursor-pointer"
                        title="Logout"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            <div className="demo-portal-controls">{demoControls}</div>
            </header>

            <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4 animate-in fade-in duration-300">
                {/* Hero / Welcome Banner */}
                <div className="bg-stone-900 text-white p-5 rounded-[24px] shadow-lg relative overflow-hidden">
                    <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-[0.07]">
                        <BrandMark variant="white" size="lg" />
                    </div>
                    <p className="text-[9px] uppercase tracking-widest text-amber-400 font-bold">PM Surya Ghar</p>
                    <h2 className="text-lg font-bold mt-0.5">{user?.name || "Stamp Maker"}</h2>
                    <p className="text-[11px] text-stone-300 mt-2 font-medium">
                        Prepare and upload official PM Surya Ghar stamps for Discom submissions.
                    </p>
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 bg-white rounded-2xl border border-stone-100 shadow-sm text-center">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-stone-400">Total</p>
                        <p className="text-base sm:text-lg font-black mt-0.5 text-stone-850">{totalCount}</p>
                    </div>
                    <div className="p-3 bg-white rounded-2xl border border-stone-100 shadow-sm text-center">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600">Done</p>
                        <p className="text-base sm:text-lg font-black mt-0.5 text-emerald-600">{completedCount}</p>
                    </div>
                    <div className="p-3 bg-white rounded-2xl border border-stone-100 shadow-sm text-center">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-amber-500">Pending</p>
                        <p className="text-base sm:text-lg font-black mt-0.5 text-amber-600">{pendingCount}</p>
                    </div>
                </div>

                {/* Queue vs Completed Record */}
                <div className="flex gap-1 bg-stone-100 p-1 rounded-2xl">
                    {[['queue', 'Pending Queue'], ['record', 'My Record']].map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setView(key)}
                            className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                                view === key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {view === 'record' ? (
                    <div className="space-y-3">
                        {/* Month picker */}
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedMonthKey}
                                onChange={e => setSelectedMonthKey(e.target.value)}
                                className="flex-1 bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-xs font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer shadow-xs"
                            >
                                <option value="all">All months</option>
                                {monthOptions.map(m => (
                                    <option key={m.key} value={m.key}>{m.label}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={fetchCompletedRecords}
                                disabled={loadingRecords}
                                className="p-2.5 bg-white border border-stone-200 rounded-xl text-stone-400 hover:text-amber-600 disabled:opacity-50 cursor-pointer shadow-xs"
                                title="Refresh record"
                            >
                                <RefreshCw className={`w-4 h-4 ${loadingRecords ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        {/* Month total - the number monthly payment is based on */}
                        <div className="bg-green-600 text-white p-5 rounded-[24px] shadow-lg">
                            <p className="text-[9px] uppercase tracking-widest text-emerald-100 font-bold">
                                Stamps completed{selectedMonthKey === 'all' ? ' (all time)' : ''}
                            </p>
                            <p className="text-4xl font-black mt-1">{recordsForMonth.length}</p>
                            <p className="text-[11px] text-emerald-100 mt-1 font-medium">
                                {selectedMonthKey === 'all'
                                    ? 'Across every month on record'
                                    : monthOptions.find(m => m.key === selectedMonthKey)?.label}
                            </p>
                        </div>

                        {/* Per-stamp detail */}
                        {loadingRecords ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-16 text-stone-400">
                                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                                <span className="text-xs font-bold">Loading your record...</span>
                            </div>
                        ) : recordsForMonth.length === 0 ? (
                            <div className="bg-white p-8 rounded-2xl border border-stone-100 text-center text-stone-400 shadow-sm space-y-2">
                                <FileCheck className="w-8 h-8 mx-auto text-stone-300" />
                                <p className="text-xs font-bold text-stone-600">No stamps completed in this period.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {recordsForMonth.map((r, idx) => (
                                    <div key={r.id} className="bg-white p-3.5 rounded-2xl border border-stone-100 shadow-sm flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-black text-stone-300 tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
                                                <p className="text-xs font-bold text-stone-850 truncate">{r.customer_name}</p>
                                            </div>
                                            <p className="text-[10px] text-stone-400 font-medium mt-0.5 ml-6 truncate">
                                                {[r.consumer_no, r.villages].filter(Boolean).join(' · ') || '–'}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-[11px] font-bold text-stone-800">
                                                {r.completedAt
                                                    ? r.completedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                                    : 'Date not recorded'}
                                            </p>
                                            <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${
                                                r.approved
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                            }`}>
                                                {r.approved ? 'Approved' : 'Awaiting approval'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                <>
                {/* Search Bar */}
                <div className="pt-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-stone-400 w-4.5 h-4.5" />
                        <input
                            type="text"
                            placeholder="Search by Consumer No, Name, or Phone..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="pl-9 pr-8 py-2.5 bg-white border border-stone-200 rounded-xl text-xs w-full focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium shadow-xs"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600 p-0.5 rounded-full cursor-pointer"
                                title="Clear search"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Customer List */}
                <div className="space-y-3 pt-1">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-16 text-stone-400">
                            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                            <span className="text-xs font-bold">Loading stamp requests...</span>
                        </div>
                    ) : filteredCustomers.length === 0 ? (
                        <div className="bg-white p-8 rounded-2xl border border-stone-100 text-center text-stone-400 shadow-sm space-y-2">
                            <FileCheck className="w-8 h-8 mx-auto text-stone-300" />
                            <p className="text-xs font-bold text-stone-600">
                                {customers.length === 0 ? "No stamp requests in queue." : "No matching clients found."}
                            </p>
                            <p className="text-[10px] text-stone-400">
                                When office staff sends customer details for stamping, they will appear here.
                            </p>
                        </div>
                    ) : (
                        filteredCustomers.map(cust => (
                            <CustomerCard
                                key={cust.id}
                                cust={cust}
                                docs={custDocs[cust.id] || []}
                                user={user}
                                onDocsChange={handleDocsChange}
                                onCustomerRemoved={handleCustomerRemoved}
                                onPreviewDoc={handleOpenPreview}
                            />
                        ))
                    )}
                </div>
                </>
                )}
            </main>

            {/* Document Preview Modal */}
            {previewDoc && (
                <FilePreviewModal
                    file={previewDoc.doc}
                    fileUrl={previewDoc.url}
                    onClose={() => setPreviewDoc(null)}
                    onUpdateRemark={handleUpdateDocRemark}
                    onDownload={async () => {
                        const url = await getDownloadUrl(previewDoc.doc.storage_path, previewDoc.doc.file_name);
                        if (url) await downloadFileWithSaveAs(url, previewDoc.doc.file_name);
                    }}
                />
            )}

        </div>
    );
}
