import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { containDialogFocus } from '../utils/dialogFocus.js';

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// Nested modals share one lock; the page scrolls again when the last one closes.
let scrollLocks = 0;
let savedOverflow = '';
function lockScroll() {
    if (scrollLocks++ === 0) {
        savedOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
    }
    return () => { if (--scrollLocks === 0) document.body.style.overflow = savedOverflow; };
}

/**
 * Native <dialog> shown with showModal(): the page behind is inert and the
 * dialog sits in the browser's top layer, above every z-index. Esc and the
 * close button call onClose unless `busy`. Focus moves to [data-autofocus]
 * or the first control in the body, and returns to the opener on close.
 * `variant="sheet"` docks to the bottom of the screen on phones.
 */
export function Modal({ open, ...props }) {
    return open ? createPortal(<OpenModal {...props} />, document.body) : null;
}

function OpenModal({ onClose, title, size = 'md', variant = 'center', busy = false, footer, children, labelledBy }) {
    const dialogRef = useRef(null);
    const bodyRef = useRef(null);
    const closingRef = useRef(false);
    const busyRef = useRef(busy);
    const onCloseRef = useRef(onClose);
    const titleId = useId();
    useEffect(() => { busyRef.current = busy; onCloseRef.current = onClose; });

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        const opener = document.activeElement;
        const unlock = lockScroll();
        closingRef.current = false;
        dialog.showModal();
        (dialog.querySelector('[data-autofocus]') || bodyRef.current.querySelector(FOCUSABLE) || dialog.querySelector(FOCUSABLE) || dialog).focus();
        return () => {
            closingRef.current = true;
            dialog.close();
            unlock();
            if (opener?.isConnected) opener.focus();
        };
    }, []);

    const requestClose = () => { if (!busyRef.current) onCloseRef.current?.(); };
    // Some browsers close the dialog on a second Esc even after preventDefault.
    const handleClosed = () => {
        if (closingRef.current) return;
        if (busyRef.current || !onCloseRef.current) dialogRef.current?.showModal();
        else onCloseRef.current();
    };

    return (
        <dialog
            ref={dialogRef} tabIndex={-1}
            aria-labelledby={labelledBy || (title ? titleId : undefined)} aria-busy={busy || undefined}
            onKeyDown={containDialogFocus}
            onCancel={event => { event.preventDefault(); requestClose(); }}
            onClose={handleClosed}
            className={`sf-dialog ${SIZES[size] || SIZES.md} ${variant === 'sheet' ? 'sf-dialog-sheet' : ''}`}
        >
            <div className="flex max-h-[inherit] flex-col">
                {title && (
                    <div className="flex items-center justify-between gap-3 border-b border-stone-100 py-2 pl-5 pr-2 sm:pl-6">
                        <h2 id={titleId} className="min-w-0 text-base font-bold text-stone-900">{title}</h2>
                        {onClose && (
                            <button type="button" onClick={requestClose} disabled={busy} aria-label="Close"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40">
                                <X size={18} aria-hidden="true" />
                            </button>
                        )}
                    </div>
                )}
                <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
                {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 px-5 py-3 sm:px-6">{footer}</div>}
            </div>
        </dialog>
    );
}
