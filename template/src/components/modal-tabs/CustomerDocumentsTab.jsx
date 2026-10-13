import { FolderOpen, Plus, Search, FileText, Eye, Trash2, Image as ImageIcon, Download, Loader2, Sparkles } from "lucide-react";
import { DocGalleryRemarkRow, generateDemoSampleFile } from "./shared";
import { formatDateToDDMMYYYY } from "../../utils";
import { useGlobalPopup } from "../GlobalPopup";

export default function CustomerDocumentsTab({
    documents,
    isEditable,
    canDelete,
    docSearchQuery,
    setDocSearchQuery,
    uploading,
    handleFileUpload,
    getDocTypeLabel,
    handlePreviewDoc,
    handleDeleteDoc,
    handleUpdateDocRemark,
    handleDownloadAllDocuments,
    downloadingAllDocuments,
    canDownloadAllDocuments = false
}) {
    const { showConfirm } = useGlobalPopup();

    const confirmDocumentDelete = async (doc) => {
        const confirmed = await showConfirm(
            `Are you sure you want to permanently delete “${doc.file_name || 'this document'}”? It will be removed from the backend and cannot be recovered.`,
            { title: 'Delete Document?', confirmLabel: 'Delete Permanently', cancelLabel: 'Cancel', type: 'danger' }
        );
        if (confirmed) await handleDeleteDoc(doc);
    };

    const filteredDocs = (documents || []).filter(doc => {
        if (!docSearchQuery.trim()) return true;
        const q = docSearchQuery.trim().toLowerCase();
        const docLabel = String(getDocTypeLabel(doc?.doc_type) || '').toLowerCase();
        const fileName = String(doc?.file_name || '').toLowerCase();
        const remarkText = String(doc?.remark || '').toLowerCase();
        return fileName.includes(q) || docLabel.includes(q) || remarkText.includes(q);
    });

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <section className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                            <FolderOpen size={18} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                                    Client Documents & Attachments
                                </h3>
                                <span className="bg-stone-100 text-stone-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {documents.length} {documents.length === 1 ? 'file' : 'files'}
                                </span>
                            </div>
                            <p className="text-[11px] text-stone-400 font-medium mt-0.5">
                                All uploaded identity proofs, site photos, utility documents, stamps, certificates, and remarks.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                        {canDownloadAllDocuments && documents.length > 0 && (
                            <button
                                type="button"
                                onClick={handleDownloadAllDocuments}
                                disabled={downloadingAllDocuments}
                                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                            >
                                {downloadingAllDocuments ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                <span>{downloadingAllDocuments ? 'Preparing PDF...' : 'Download All PDF'}</span>
                            </button>
                        )}
                        {isEditable && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const sample = generateDemoSampleFile('general_document', 'General Customer Document');
                                        handleFileUpload({ target: { files: [sample], value: '' } });
                                    }}
                                    disabled={uploading}
                                    className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                                    title="Add a sample verified demo document (1-click upload)"
                                >
                                    <Sparkles size={14} />
                                    <span>Use Demo Doc</span>
                                </button>
                                <label className="bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
                                    <Plus size={14} />
                                    <span>{uploading ? 'Uploading...' : 'Upload File'}</span>
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/jpg,application/pdf,.png,.jpg,.jpeg,.pdf"
                                        onChange={handleFileUpload}
                                        disabled={uploading}
                                        className="hidden"
                                    />
                                </label>
                            </>
                        )}
                    </div>
                </div>

                {/* Search Filter */}
                {documents.length > 0 && (
                    <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                            type="text"
                            placeholder="Search documents by name, category, or remark..."
                            value={docSearchQuery}
                            onChange={e => setDocSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                    </div>
                )}

                {documents.length === 0 ? (
                    <div className="text-center py-12 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                        <FolderOpen size={36} className="mx-auto text-stone-300 mb-2" />
                        <p className="text-xs font-bold text-stone-600">No documents uploaded yet</p>
                        <p className="text-[11px] text-stone-400 mt-1">Upload client KYC, photos, or utility documents to see them listed here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredDocs.map(doc => {
                            const isPdf = doc.file_name?.toLowerCase().endsWith('.pdf') || doc.file_type === 'application/pdf';
                            const isImage = doc.file_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(doc.file_name || '');
                            const docLabel = getDocTypeLabel(doc.doc_type);

                            return (
                                <div key={doc.id} className="bg-stone-50/70 hover:bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 flex flex-col justify-between gap-2.5 transition-all hover:shadow-xs">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className={`p-2.5 rounded-xl flex-shrink-0 ${isPdf ? 'bg-red-50 text-red-600' : isImage ? 'bg-blue-50 text-blue-600' : 'bg-stone-200 text-stone-600'}`}>
                                                {isPdf ? <FileText size={18} /> : isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-white text-stone-700 border border-stone-200">
                                                        {docLabel}
                                                    </span>
                                                    {doc.created_at && (
                                                        <span className="text-[10px] text-stone-400 font-medium">
                                                            · {formatDateToDDMMYYYY(doc.created_at)}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs font-bold text-stone-800 truncate mt-1" title={doc.file_name}>
                                                    {doc.file_name}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handlePreviewDoc(doc)}
                                                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 shadow-xs flex items-center gap-1.5 cursor-pointer transition"
                                                title="View Preview & Download"
                                            >
                                                <Eye size={13} className="text-stone-500" />
                                                <span>View</span>
                                            </button>
                                            {canDelete && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateDocRemark(doc.id, '[RETURNED] Please upload the correct document.')}
                                                    className="px-2.5 py-1.5 text-[10px] font-bold text-amber-700 hover:bg-amber-50 rounded-xl transition cursor-pointer"
                                                    title="Allow the agent to replace this document"
                                                >
                                                    Send Back
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button
                                                    type="button"
                                                    onClick={() => confirmDocumentDelete(doc)}
                                                    className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                                                    title="Delete Document"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Document Remark Section */}
                                    <DocGalleryRemarkRow doc={doc} onUpdateRemark={handleUpdateDocRemark} isEditable={isEditable && canDelete} />
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
