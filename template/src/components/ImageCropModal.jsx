import {percentCropRatio,fitCropRatio,resizeCrop} from '../utils/imageCrop';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    Crop, RotateCw, RotateCcw, ZoomIn, ZoomOut, Check, X, 
    Sparkles, ArrowRight, RefreshCw, FileImage, ShieldCheck
} from 'lucide-react';

const ASPECT_RATIOS = [
    { id: 'free', label: 'Freeform', ratio: null },
    { id: '1:1', label: '1:1 Square', ratio: 1 },
    { id: '4:3', label: '4:3 Photo', ratio: 4 / 3 },
    { id: '16:9', label: '16:9 Wide', ratio: 16 / 9 },
    { id: 'a4', label: 'A4 Document', ratio: 1 / 1.414 }
];

export default function ImageCropModal({
    isOpen,
    file,
    onCropSave,
    onSkip,
    onClose,
    title = 'Crop & Adjust Image'
}) {
    const [imageSrc, setImageSrc] = useState(null);
    const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
    const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
    const [zoom, setZoom] = useState(1);
    const [aspectRatio, setAspectRatio] = useState('free');
    const [crop, setCrop] = useState({ x: 10, y: 10, width: 80, height: 80 }); // in percentage (0 to 100)
    const [isDragging, setIsDragging] = useState(false);
    const [dragType, setDragType] = useState(null); // 'move' | 'nw' | 'ne' | 'se' | 'sw'
    const [dragStart, setDragStart] = useState({ mouseX: 0, mouseY: 0, crop: null });
    const [processing, setProcessing] = useState(false);

    const containerRef = useRef(null);
    const imageRef = useRef(null);

    // Load file as Data URL
    useEffect(() => {
        if (!file || !isOpen) {
            setImageSrc(null);
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setImageSrc(reader.result);
            setRotation(0);
            setZoom(1);
            setAspectRatio('free');
            setCrop({ x: 10, y: 10, width: 80, height: 80 });
        };
        reader.readAsDataURL(file);

        return () => {
            reader.abort();
        };
    }, [file, isOpen]);

    const handleImageLoad = (e) => {
        const { naturalWidth, naturalHeight } = e.target;
        setNaturalSize({ width: naturalWidth, height: naturalHeight });
    };

    // Rotation handlers
    const rotateClockwise = () => setRotation(prev => (prev + 90) % 360);
    const rotateCounterClockwise = () => setRotation(prev => (prev + 270) % 360);

    // Crop coordinates refer to the unrotated image shown beneath the overlay.
    const selectedRatio = ASPECT_RATIOS.find(p => p.id === aspectRatio)?.ratio;
    const percentageRatio = percentCropRatio(naturalSize.width, naturalSize.height, rotation, selectedRatio);
    useEffect(() => {
        if (percentageRatio) setCrop(previous => fitCropRatio(previous, percentageRatio));
    }, [percentageRatio]);
    const handleAspectRatioChange = setAspectRatio;

    // Drag / resize logic for crop box
    const handleMouseDown = (e, type) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        setDragType(type);
        setDragStart({
            mouseX: e.clientX,
            mouseY: e.clientY,
            crop: { ...crop }
        });
    };

    const handleMouseMove = useCallback((e) => {
        if (!isDragging || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const angle = rotation * Math.PI / 180;
        const screenX = (e.clientX - dragStart.mouseX) / zoom;
        const screenY = (e.clientY - dragStart.mouseY) / zoom;
        const deltaX = ((screenX * Math.cos(angle) + screenY * Math.sin(angle)) / imageRef.current.clientWidth) * 100;
        const deltaY = ((-screenX * Math.sin(angle) + screenY * Math.cos(angle)) / imageRef.current.clientHeight) * 100;
        const init = dragStart.crop;

        if (dragType === 'move') {
            let nextX = init.x + deltaX;
            let nextY = init.y + deltaY;
            nextX = Math.max(0, Math.min(100 - init.width, nextX));
            nextY = Math.max(0, Math.min(100 - init.height, nextY));
            setCrop(prev => ({ ...prev, x: nextX, y: nextY }));
        } else if (dragType === 'se' || dragType === 'nw') {
            setCrop(resizeCrop(init, deltaX, deltaY, dragType, percentageRatio));
        }
    }, [isDragging, dragType, dragStart, percentageRatio, rotation, zoom]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setDragType(null);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // Canvas Crop Generation
    const handleApplyCrop = async () => {
        if (!imageRef.current || naturalSize.width === 0 || naturalSize.height === 0) {
            onSkip(file);
            return;
        }

        setProcessing(true);
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = imageSrc;
            await new Promise((res, rej) => {
                img.onload = res;
                img.onerror = rej;
            });

            // Crop the same source rectangle as the overlay, then rotate it.
            const sourceX = crop.x / 100 * naturalSize.width;
            const sourceY = crop.y / 100 * naturalSize.height;
            const sourceW = crop.width / 100 * naturalSize.width;
            const sourceH = crop.height / 100 * naturalSize.height;
            const quarterTurn = rotation % 180 !== 0;
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = Math.max(1, Math.round(quarterTurn ? sourceH : sourceW));
            finalCanvas.height = Math.max(1, Math.round(quarterTurn ? sourceW : sourceH));
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.translate(finalCanvas.width / 2, finalCanvas.height / 2);
            finalCtx.rotate(rotation * Math.PI / 180);
            finalCtx.drawImage(img, sourceX, sourceY, sourceW, sourceH, -sourceW / 2, -sourceH / 2, sourceW, sourceH);

            // 3. Export to File
            const isJpeg = file?.type === 'image/jpeg' || (file?.name && /\.(jpe?g)$/i.test(file.name));
            const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
            const cleanExt = isJpeg ? '.jpg' : '.png';
            finalCanvas.toBlob((blob) => {
                if (!blob) {
                    onSkip(file);
                    return;
                }
                const baseName = file.name ? file.name.replace(/\.[^/.]+$/, "") : "cropped_image";
                const cleanName = `${baseName}_cropped${cleanExt}`;
                const croppedFile = new File([blob], cleanName, { type: mimeType, lastModified: Date.now() });
                onCropSave(croppedFile);
            }, mimeType, 0.92);
        } catch (err) {
            console.error('Error cropping image:', err);
            onSkip(file);
        } finally {
            setProcessing(false);
        }
    };

    if (!isOpen || !file) return null;

    return (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-3 sm:p-6 bg-stone-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-stone-150 flex items-center justify-between bg-stone-50/70">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center font-bold">
                            <Crop size={16} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-stone-900 leading-tight">
                                {title}
                            </h3>
                            <p className="text-[11px] text-stone-400 truncate max-w-xs sm:max-w-md">
                                {file.name} ({(file.size / 1024).toFixed(0)} KB)
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-7 h-7 rounded-full bg-stone-200/70 hover:bg-stone-300 text-stone-600 flex items-center justify-center transition cursor-pointer"
                        title="Cancel upload"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Toolbar: Aspect Ratios & Rotation */}
                <div className="px-4 py-2.5 bg-stone-100/60 border-b border-stone-150 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                    {/* Ratio Presets */}
                    <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mr-1">Ratio:</span>
                        {ASPECT_RATIOS.map(preset => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleAspectRatioChange(preset.id)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                                    aspectRatio === preset.id
                                        ? 'bg-stone-900 text-white shadow-2xs'
                                        : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                                }`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* Rotate Controls */}
                    <div className="flex items-center gap-1.5 ml-auto">
                        <button
                            type="button"
                            onClick={rotateCounterClockwise}
                            className="p-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 flex items-center gap-1 text-[11px] font-medium transition cursor-pointer"
                            title="Rotate 90° counter-clockwise"
                        >
                            <RotateCcw size={13} />
                            <span className="hidden sm:inline">Left</span>
                        </button>
                        <button
                            type="button"
                            onClick={rotateClockwise}
                            className="p-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 flex items-center gap-1 text-[11px] font-medium transition cursor-pointer"
                            title="Rotate 90° clockwise"
                        >
                            <RotateCw size={13} />
                            <span className="hidden sm:inline">Right</span>
                        </button>
                    </div>
                </div>

                {/* Cropping Viewport Area */}
                <div className="relative flex-1 bg-stone-900 p-4 sm:p-6 flex items-center justify-center overflow-hidden min-h-[300px] sm:min-h-[380px] select-none">
                    {imageSrc ? (
                        <div 
                            ref={containerRef}
                            className="relative max-w-full max-h-[60vh] flex items-center justify-center"
                            style={{
                                transform: `rotate(${rotation}deg) scale(${zoom})`,
                                transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                            }}
                        >
                            <img
                                ref={imageRef}
                                src={imageSrc}
                                alt="To crop"
                                onLoad={handleImageLoad}
                                className="max-w-full max-h-[55vh] object-contain rounded shadow-lg pointer-events-none"
                            />

                            {/* Crop Box Overlay */}
                            <div
                                style={{
                                    left: `${crop.x}%`,
                                    top: `${crop.y}%`,
                                    width: `${crop.width}%`,
                                    height: `${crop.height}%`,
                                }}
                                className="absolute border-2 border-amber-400 bg-amber-400/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] cursor-move transition-shadow"
                                onMouseDown={(e) => handleMouseDown(e, 'move')}
                            >
                                {/* Grid lines */}
                                <div className="w-full h-full grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                                    <div className="border-r border-b border-white/60"></div>
                                    <div className="border-r border-b border-white/60"></div>
                                    <div className="border-b border-white/60"></div>
                                    <div className="border-r border-b border-white/60"></div>
                                    <div className="border-r border-b border-white/60"></div>
                                    <div className="border-b border-white/60"></div>
                                    <div className="border-r border-white/60"></div>
                                    <div className="border-r border-white/60"></div>
                                    <div></div>
                                </div>

                                {/* Handles */}
                                <div 
                                    className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-amber-400 border-2 border-white rounded-full cursor-nwse-resize"
                                    onMouseDown={(e) => handleMouseDown(e, 'nw')}
                                />
                                <div 
                                    className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-400 border-2 border-white rounded-full cursor-nwse-resize"
                                    onMouseDown={(e) => handleMouseDown(e, 'se')}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="text-stone-400 text-xs flex items-center gap-2">
                            <RefreshCw size={16} className="animate-spin" />
                            <span>Loading image...</span>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-4 sm:p-5 border-t border-stone-150 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-stone-500 text-[11px]">
                        <FileImage size={13} className="text-stone-400" />
                        <span>Drag crop frame to position · Handles resize</span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => onSkip(file)}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 transition cursor-pointer"
                            title="Upload original image without cropping"
                        >
                            Upload As-Is
                        </button>
                        <button
                            type="button"
                            disabled={processing}
                            onClick={handleApplyCrop}
                            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 active:bg-amber-700 transition flex items-center gap-1.5 shadow-sm shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                        >
                            {processing ? (
                                <RefreshCw size={13} className="animate-spin" />
                            ) : (
                                <Check size={13} className="stroke-[3]" />
                            )}
                            <span>{processing ? 'Processing...' : 'Crop & Save'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
