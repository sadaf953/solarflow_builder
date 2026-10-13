import {containDialogFocus} from '../utils/dialogFocus';
// ─── GlobalPopup.jsx ────────────────────────────────────────────────────────
// A single, app-wide replacement for native alert()/confirm(). Generalizes
// the custom popup design that already existed locally in StampPortal.jsx
// so every component can use the same look via useGlobalPopup(), instead of
// each screen inventing its own or falling back to the plain browser dialog.
// ────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Share2 } from 'lucide-react';
import ImageCropModal from './ImageCropModal';

const GlobalPopupContext = createContext(null);

const ICONS = {
    error: { Icon: AlertCircle, className: 'bg-rose-100 text-rose-600' },
    danger: { Icon: AlertTriangle, className: 'bg-rose-100 text-rose-700' },
    warning: { Icon: AlertTriangle, className: 'bg-amber-100 text-amber-700' },
    success: { Icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-700' },
    info: { Icon: Info, className: 'bg-blue-100 text-blue-700' },
};

export function GlobalPopupProvider({ children }) {
    const [popup, setPopup] = useState(null);
    const dialogRef = useRef(null);
    useEffect(() => {
        if (!popup || popup.mode === 'image-cropper') return;
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement;
        dialog.showModal();
        (dialog.querySelector('[data-safe-dismiss]') || dialog.querySelector('button'))?.focus();
        return () => {
            dialog.close();
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [popup]);

    const dismissPopup = () => {
        if (popup.mode === 'choice') popup.onResolve('cancel');
        else if (popup.mode === 'confirm') popup.onResolve(false);
        else if (popup.mode === 'alert') popup.onResolve();
        else setPopup(null);
    };
    const popupIcon = popup ? (ICONS[popup.type] || ICONS.warning) : ICONS.warning;
    const PopupIcon = popupIcon.Icon;

    useEffect(() => {
        const handleDownloadComplete = (event) => {
            const file = event.detail?.file || null;
            const canShareFile = Boolean(
                file && navigator.share &&
                (!navigator.canShare || navigator.canShare({ files: [file] }))
            );
            setPopup({
                mode: 'download-complete',
                title: 'Download complete',
                message: canShareFile
                    ? `${event.detail?.fileName || 'Your file'} is ready. You can now share it through WhatsApp or another app.`
                    : `${event.detail?.fileName || 'Your file'} has been downloaded to this device.`,
                type: 'success',
                file,
                canShareFile,
            });
        };
        window.addEventListener('solarflow:download-complete', handleDownloadComplete);
        return () => window.removeEventListener('solarflow:download-complete', handleDownloadComplete);
    }, []);

    const shareDownloadedFile = async () => {
        if (!popup?.file || !popup.canShareFile) return;
        try {
            await navigator.share({ files: [popup.file], title: popup.file.name });
            setPopup(null);
        } catch (error) {
            // Cancelling the native share sheet is normal; leave the action open
            // so the user can try again or simply close the confirmation.
            if (error?.name !== 'AbortError') console.error('Native file sharing failed:', error);
        }
    };

    const showAlert = useCallback((message, opts = {}) => {
        return new Promise((resolve) => {
            setPopup({
                mode: 'alert',
                message,
                title: opts.title || 'Attention',
                type: opts.type || 'warning',
                onResolve: () => { setPopup(null); resolve(); },
            });
        });
    }, []);

    // Save / Discard / Keep Editing. showConfirm only offers save-or-stay, which
    // traps the user whenever validation makes saving impossible - there was no
    // way out of the Add Lead form once it was dirty.
    const showChoice = useCallback((message, opts = {}) => {
        return new Promise((resolve) => {
            setPopup({
                mode: 'choice',
                message,
                title: opts.title || 'Unsaved changes',
                type: opts.type || 'warning',
                confirmLabel: opts.confirmLabel || 'Save',
                discardLabel: opts.discardLabel || 'Discard',
                cancelLabel: opts.cancelLabel || 'Keep Editing',
                onResolve: (result) => { setPopup(null); resolve(result); },
            });
        });
    }, []);

    const showConfirm = useCallback((message, opts = {}) => {
        return new Promise((resolve) => {
            setPopup({
                mode: 'confirm',
                message,
                title: opts.title || 'Please confirm',
                type: opts.type || 'warning',
                confirmLabel: opts.confirmLabel || 'Continue',
                cancelLabel: opts.cancelLabel || 'Cancel',
                onResolve: (result) => { setPopup(null); resolve(result); },
            });
        });
    }, []);

    const showImageCropper = useCallback((file, opts = {}) => {
        if (!file) return Promise.resolve(null);
        const isImage = (file.type && file.type.startsWith('image/')) || 
                        /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name || '');
        if (!isImage) {
            return Promise.resolve(file);
        }

        return new Promise((resolve) => {
            setPopup({
                mode: 'image-cropper',
                file,
                title: opts.title || 'Crop & Adjust Image',
                onResolve: (result) => { setPopup(null); resolve(result); },
            });
        });
    }, []);

    return (
        <GlobalPopupContext.Provider value={{ showAlert, showConfirm, showChoice, showImageCropper }}>
            {children}
            {popup?.mode === 'image-cropper' ? (
                <ImageCropModal
                    isOpen={true}
                    file={popup.file}
                    title={popup.title}
                    onCropSave={(cropped) => popup.onResolve(cropped)}
                    onSkip={(orig) => popup.onResolve(orig)}
                    onClose={() => popup.onResolve(null)}
                />
            ) : popup ? (
                <dialog onKeyDown={containDialogFocus}
                    ref={dialogRef}
                    aria-labelledby="global-popup-title"
                    aria-describedby="global-popup-message"
                    onCancel={event => { event.preventDefault(); dismissPopup(); }}
                    className="fixed inset-0 m-0 w-full h-full max-w-none max-h-none border-0 z-[10000] flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
                    onClick={() => { if (popup.mode === 'alert') popup.onResolve(); else if (popup.mode === 'choice') popup.onResolve('cancel'); }}
                >
                    <div
                        className="w-full max-w-sm max-h-full overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl border border-stone-150 animate-in zoom-in-95 duration-200 text-center space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center ${popupIcon.className}`}>
                            <PopupIcon size={24} />
                        </div>
                        <div>
                            <h4 id="global-popup-title" className="text-base font-extrabold text-stone-900">{popup.title}</h4>
                            <p id="global-popup-message" className="text-sm text-stone-600 font-medium mt-1.5 leading-relaxed whitespace-pre-line">{popup.message}</p>
                        </div>
                        {popup.mode === 'download-complete' ? (
                            <div className="space-y-2">
                                {popup.canShareFile && (
                                    <button
                                        type="button"
                                        onClick={shareDownloadedFile}
                                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2"
                                    >
                                        <Share2 size={15} /> Share file
                                    </button>
                                )}
                                <button
                                    type="button"
                                    data-safe-dismiss
                                    onClick={() => setPopup(null)}
                                    className="w-full py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer active:scale-[0.98]"
                                >
                                    Done
                                </button>
                            </div>
                        ) : popup.mode === 'choice' ? (
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={() => popup.onResolve('confirm')}
                                    className={`w-full py-3 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer active:scale-[0.98] ${popup.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                                >
                                    {popup.confirmLabel}
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        data-safe-dismiss
                                        onClick={() => popup.onResolve('cancel')}
                                        className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer active:scale-[0.98]"
                                    >
                                        {popup.cancelLabel}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => popup.onResolve('discard')}
                                        className="flex-1 py-3 bg-white border border-stone-200 text-stone-500 hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50 rounded-xl text-xs font-bold transition cursor-pointer active:scale-[0.98]"
                                    >
                                        {popup.discardLabel}
                                    </button>
                                </div>
                            </div>
                        ) : popup.mode === 'alert' ? (
                            <button
                                type="button"
                                onClick={() => popup.onResolve()}
                                className="w-full py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer active:scale-[0.98]"
                            >
                                Understood
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    data-safe-dismiss
                                    onClick={() => popup.onResolve(false)}
                                    className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer active:scale-[0.98]"
                                >
                                    {popup.cancelLabel}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => popup.onResolve(true)}
                                    className={`flex-1 py-3 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer active:scale-[0.98] ${popup.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                                >
                                    {popup.confirmLabel}
                                </button>
                            </div>
                        )}
                    </div>
                </dialog>
            ) : null}
        </GlobalPopupContext.Provider>
    );
}

export function useGlobalPopup() {
    const ctx = useContext(GlobalPopupContext);
    if (!ctx) throw new Error('useGlobalPopup must be used within a GlobalPopupProvider');
    return ctx;
}
