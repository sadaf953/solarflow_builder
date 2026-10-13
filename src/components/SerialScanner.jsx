import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Keyboard, ScanLine, X } from 'lucide-react';

export default function SerialScanner({ customerName, initialTarget = 'module', onScan, onClose, moduleCount = 0, expectedModules = 0, inverterSerial = '' }) {
    const [target, setTarget] = useState(initialTarget);
    const [cameraError, setCameraError] = useState('');
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraWaitingLong, setCameraWaitingLong] = useState(false);
    const [manualValue, setManualValue] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [saving, setSaving] = useState(false);
    const videoRef = useRef(null);
    const controlsRef = useRef(null);
    const activeRef = useRef(true);
    const busyRef = useRef(false);
    const targetRef = useRef(target);
    const onScanRef = useRef(onScan);
    const lastSeenRef = useRef({ value: '', at: 0 });
    targetRef.current = target;
    onScanRef.current = onScan;

    useEffect(() => {
        let cancelled = false;
        activeRef.current = true;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKeyDown = event => { if (event.key === 'Escape' && !busyRef.current) onClose(); };
        document.addEventListener('keydown', onKeyDown);
        const waitTimer = window.setTimeout(() => {
            if (!cancelled && !controlsRef.current) setCameraWaitingLong(true);
        }, 10000);

        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            setCameraError('Camera scanning needs HTTPS and a browser with camera access. You can enter the serial below.');
        } else {
            import('@zxing/browser').then(async ({ BrowserMultiFormatReader }) => {
                if (cancelled || !activeRef.current || !videoRef.current) return;
                const reader = new BrowserMultiFormatReader();
                const controls = await reader.decodeFromConstraints(
                    { audio: false, video: { facingMode: { ideal: 'environment' } } },
                    videoRef.current,
                    result => {
                        if (!result || !activeRef.current || busyRef.current) return;
                        const value = result.getText();
                        if (value === lastSeenRef.current.value && Date.now() - lastSeenRef.current.at < 3500) return;
                        void saveValue(value);
                    }
                );
                if (cancelled || !activeRef.current) controls.stop();
                else {
                    controlsRef.current = controls;
                    setCameraReady(true);
                    setCameraWaitingLong(false);
                    setCameraError('');
                }
            }).catch(error => {
                if (cancelled || !activeRef.current) return;
                const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
                setCameraError(denied
                    ? 'Camera access was denied. Allow camera permission for this site, or enter the serial below.'
                    : 'Could not start the camera. You can still enter the serial below.');
            });
        }

        return () => {
            cancelled = true;
            activeRef.current = false;
            controlsRef.current?.stop();
            window.clearTimeout(waitTimer);
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
        };
    // Camera should stay open while staff switch between module and inverter.
    // The refs above keep scan callbacks current without restarting the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function saveValue(value) {
        if (busyRef.current) return false;
        busyRef.current = true;
        setSaving(true);
        setFeedback(null);
        const scannedTarget = targetRef.current;
        try {
            const result = await onScanRef.current(scannedTarget, value);
            if (!activeRef.current) return;
            lastSeenRef.current = { value, at: Date.now() };
            if (result.status === 'saved') {
                navigator.vibrate?.(70);
                setFeedback({ kind: 'success', text: `${result.serial} saved to ${scannedTarget === 'module' ? 'module serials' : 'inverter serial'} in the CRM.` });
            } else if (result.status === 'duplicate') {
                setFeedback({ kind: 'notice', text: `${result.serial} is already recorded for this customer.` });
            } else if (result.status === 'occupied') {
                setFeedback({ kind: 'notice', text: `An inverter serial is already saved (${result.existing}). Edit it on the customer card before replacing it.` });
            }
            return result.status === 'saved';
        } catch (error) {
            if (activeRef.current) setFeedback({ kind: 'error', text: error?.message || 'The scan could not be saved. Try again.' });
            return false;
        } finally {
            if (activeRef.current) {
                setSaving(false);
                setTimeout(() => { if (activeRef.current) busyRef.current = false; }, 1100);
            }
        }
    }

    const saveManual = async event => {
        event.preventDefault();
        if (!manualValue.trim() || busyRef.current) return;
        const saved = await saveValue(manualValue);
        if (saved && activeRef.current) setManualValue('');
    };

    return <div className="fixed inset-0 z-[100] bg-stone-950/90 flex items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Scan equipment serial numbers">
        <div className="w-full h-[100dvh] sm:h-auto sm:max-h-[95dvh] sm:max-w-xl bg-white sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            <header className="shrink-0 bg-stone-900 text-white px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0"><h2 className="text-base font-bold flex items-center gap-2"><ScanLine size={20}/> Scan serial number</h2><p className="text-xs text-stone-300 truncate">{customerName}</p></div>
                <button type="button" onClick={onClose} disabled={saving} className="p-2 rounded-lg hover:bg-white/15 disabled:opacity-40" aria-label="Close scanner"><X size={22}/></button>
            </header>
            <div className="flex gap-2 px-4 py-3 border-b border-stone-200 shrink-0" role="group" aria-label="Equipment type">
                {[['module','Modules'], ['inverter','Inverter']].map(([value,label]) => <button key={value} type="button" onClick={() => { setTarget(value); setFeedback(null); lastSeenRef.current = { value: '', at: 0 }; }} aria-pressed={target === value} className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold ${target === value ? 'bg-amber-500 text-stone-950' : 'bg-stone-100 text-stone-700'}`}>{label}{value === 'module' ? ` (${moduleCount}${expectedModules > 0 ? `/${expectedModules}` : ''})` : inverterSerial ? ' ✓' : ''}</button>)}
            </div>
            <div className="relative bg-black flex-1 min-h-[180px] sm:min-h-[260px] max-h-[55vh] overflow-hidden">
                <video ref={videoRef} autoPlay muted playsInline onError={() => setCameraError('Camera video cannot play here. Open SolarFlow in Safari or Chrome on your phone, or enter the serial below.')} className="w-full h-full object-cover" aria-label="Camera view for barcode scanning"/>
                <div className="pointer-events-none absolute inset-[18%_9%] border-2 border-amber-400 rounded-2xl opacity-90"/>
                {!cameraReady && !cameraError && <div className="absolute inset-0 flex items-center justify-center p-5 text-center text-white text-sm font-semibold"><Camera className="mr-2 shrink-0" size={18}/>{cameraWaitingLong ? 'Still waiting for camera access. Allow permission, open this page in your phone browser, or enter the serial below.' : 'Opening camera…'}</div>}
                {cameraError && <div role="alert" className="absolute inset-0 flex items-center justify-center p-5 text-center text-white text-sm font-semibold">{cameraError}</div>}
            </div>
            <div className="shrink-0 p-4 space-y-3 bg-white" style={{paddingBottom:'max(1rem, env(safe-area-inset-bottom))'}}>
                <p className="text-xs text-stone-600">Point the rear camera at the serial barcode or QR code. Each successful scan saves immediately; keep scanning the next module.</p>
                {feedback && <div role="status" className={`rounded-xl p-3 text-sm font-semibold flex gap-2 items-start ${feedback.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : feedback.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{feedback.kind === 'success' && <Check size={17} className="shrink-0"/>}<span className="break-all">{feedback.text}</span></div>}
                <form onSubmit={saveManual} className="flex gap-2"><label className="sr-only" htmlFor="manual-scanned-serial">Enter serial manually</label><div className="relative flex-1"><Keyboard size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/><input id="manual-scanned-serial" value={manualValue} onChange={event => setManualValue(event.target.value)} placeholder="Enter serial manually" maxLength={120} autoCapitalize="characters" className="w-full min-w-0 rounded-xl border border-stone-300 pl-9 pr-3 py-3 text-sm font-mono"/></div><button type="submit" disabled={saving || !manualValue.trim()} className="rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Save</button></form>
                {saving && <p role="status" className="text-xs text-amber-800 font-semibold">Saving to CRM…</p>}
            </div>
        </div>
    </div>;
}
