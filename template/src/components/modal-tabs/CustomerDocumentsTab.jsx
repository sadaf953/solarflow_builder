import { useState } from 'react';
import { FolderOpen, Plus, FileText, Eye, Trash2, Image as ImageIcon, Download } from 'lucide-react';
import { DocGalleryRemarkRow, RETURNED_DOCUMENT_PREFIX } from './shared';
import { formatDateToDDMMYYYY } from '../../utils';
import { useGlobalPopup } from '../GlobalPopup';
import { SectionCard, SearchInput, EmptyState, Spinner, Badge } from '../../ui/index.js';

export default function CustomerDocumentsTab({
    documents,
    isEditable,
    canDelete,
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
    const [query, setQuery] = useState('');

    const confirmDocumentDelete = async (doc) => {
        const confirmed = await showConfirm(
            `Are you sure you want to permanently delete “${doc.file_name || 'this document'}”? It will be removed from the backend and cannot be recovered.`,
            { title: 'Delete Document?', confirmLabel: 'Delete Permanently', cancelLabel: 'Cancel', type: 'danger' }
        );
        if (confirmed) await handleDeleteDoc(doc);
    };

    const q = query.trim().toLowerCase();
    const filteredDocs = (documents || []).filter(doc => !q
        || String(doc?.file_name || '').toLowerCase().includes(q)
        || String(getDocTypeLabel(doc?.doc_type) || '').toLowerCase().includes(q)
        || String(doc?.remark || '').toLowerCase().includes(q));

    const showActions = (canDownloadAllDocuments && documents.length > 0) || isEditable;
    const actions = showActions && (
        <div className="flex flex-wrap items-center gap-2">
            {canDownloadAllDocuments && documents.length > 0 && (
                <button
                    type="button"
                    onClick={handleDownloadAllDocuments}
                    disabled={downloadingAllDocuments}
                    className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white px-4 min-h-11 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                    {downloadingAllDocuments ? <Spinner size={14} /> : <Download size={14} />}
                    <span>{downloadingAllDocuments ? 'Preparing PDF...' : 'Download All PDF'}</span>
                </button>
            )}
            {isEditable && (
                <label className="bg-stone-900 hover:bg-stone-800 text-white px-4 min-h-11 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
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
            )}
        </div>
    );

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <SectionCard
                icon={FolderOpen}
                title={<span className="flex items-center gap-2">Client Documents & Attachments <Badge>{documents.length} {documents.length === 1 ? 'file' : 'files'}</Badge></span>}
                subtitle="All uploaded identity proofs, site photos, utility documents, certificates, and remarks."
            >
                {actions}
                {documents.length > 0 && (
                    <SearchInput value={query} onChange={setQuery} delay={0} label="Search documents" placeholder="Search documents by name, category, or remark..." />
                )}

                {documents.length === 0 ? (
                    <EmptyState icon={FolderOpen} title="No documents uploaded yet">
                        Upload client KYC, photos, or utility documents to see them listed here.
                    </EmptyState>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredDocs.map(doc => {
                            const isPdf = doc.file_name?.toLowerCase().endsWith('.pdf') || doc.file_type === 'application/pdf';
                            const isImage = doc.file_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(doc.file_name || '');

                            return (
                                <div key={doc.id} className="bg-stone-50/70 hover:bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 flex flex-col justify-between gap-2.5 transition-all hover:shadow-xs">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className={`p-2.5 rounded-xl flex-shrink-0 ${isPdf ? 'bg-red-50 text-red-600' : isImage ? 'bg-blue-50 text-blue-600' : 'bg-stone-200 text-stone-600'}`}>
                                                {isImage && !isPdf ? <ImageIcon size={18} /> : <FileText size={18} />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-white text-stone-700 border border-stone-200">
                                                        {getDocTypeLabel(doc.doc_type)}
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
                                                    onClick={() => handleUpdateDocRemark(doc.id, `${RETURNED_DOCUMENT_PREFIX} Please upload the correct document.`)}
                                                    className="px-2.5 py-1.5 text-[10px] font-bold text-amber-700 hover:bg-amber-50 rounded-xl transition cursor-pointer"
                                                    title="Allow the uploader to replace this document"
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
                                                    aria-label={`Delete ${doc.file_name || 'document'}`}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <DocGalleryRemarkRow doc={doc} onUpdateRemark={handleUpdateDocRemark} isEditable={isEditable && canDelete} />
                                </div>
                            );
                        })}
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
