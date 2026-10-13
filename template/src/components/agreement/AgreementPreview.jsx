import React, { useEffect, useState, useRef } from 'react';
import { Page1 } from './Page1';
import { Page2 } from './Page2';
import { Page3 } from './Page3';
import { Page4 } from './Page4';
import { Printer, ZoomIn, ZoomOut, FileText, Eye, EyeOff, X, Type, RotateCw, Upload, Loader2 } from 'lucide-react';

export const AgreementPreview = ({ data, onChange, onClose, onAddToDocuments, existingDocument = false, autoAdd = false }) => {
  const [zoom, setZoom] = useState(100);
  const [fontSize, setFontSize] = useState('text-[17px]');
  const [stampRotation, setStampRotation] = useState(0);
  const containerRef = useRef(null);
  const autoAddStartedRef = useRef(false);
  const [adding, setAdding] = useState(false);

  const handleAddToDocuments = async () => {
    if (adding || !onAddToDocuments || !containerRef.current) return;
    setAdding(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const pageElements = Array.from(containerRef.current.querySelectorAll('[id^="crm-agreement-page-"]'));
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      for (let index = 0; index < pageElements.length; index += 1) {
        const page = pageElements[index];
        const highlights = Array.from(page.querySelectorAll('[style*="background-color"]'));
        const previousBackgrounds = highlights.map(element => element.style.backgroundColor);
        highlights.forEach(element => { element.style.backgroundColor = 'transparent'; });
        const canvas = await html2canvas(page, {
          scale: 1.5,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: page.scrollWidth,
          windowHeight: page.scrollHeight,
        });
        highlights.forEach((element, position) => { element.style.backgroundColor = previousBackgrounds[position]; });
        if (index > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
      const safeName = (data?.consumerName || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeConsumerNo = (data?.consumerNo || 'Agreement').replace(/[^a-zA-Z0-9_-]/g, '_');
      const blob = pdf.output('blob');
      const file = new File([blob], `Discom_Agreement_${safeName}_${safeConsumerNo}.pdf`, { type: 'application/pdf' });
      await onAddToDocuments(file);
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => {
    if (!autoAdd || autoAddStartedRef.current) return;
    autoAddStartedRef.current = true;
    const frame = requestAnimationFrame(() => { handleAddToDocuments(); });
    return () => cancelAnimationFrame(frame);
  }, [autoAdd]);

  const handlePrint = () => {
    const printContainer = containerRef.current;
    if (!printContainer) return;

    // Capture all styles from the parent document
    const parentStyles = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(tag => tag.outerHTML)
      .join('\n');

    // Create a hidden 0x0 iframe - no new tab, prints in same page
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);

    const cleanName = (data?.consumerName || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanConsumerNo = (data?.consumerNo || 'Agreement').replace(/[^a-zA-Z0-9_-]/g, '_');
    const docTitle = `Discom_Agreement_${cleanName}_${cleanConsumerNo}`;
    const prevDocTitle = document.title;

    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${docTitle}</title>
          <meta charset="utf-8">
          ${parentStyles}
          <style>
            @media print {
              @page { size: A4 portrait; margin: 0; }
              html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
            }
            body { font-family: Calibri, 'Calibri Light', sans-serif; font-weight: 400; background: white; margin: 0; padding: 0; }
            .doc-page {
              width: 210mm !important;
              min-height: 297mm !important;
              height: 297mm !important;
              margin: 0 auto !important;
              padding: 12mm 15mm 16mm 15mm !important;
              box-sizing: border-box !important;
              page-break-after: always !important;
              break-after: page !important;
              position: relative !important;
              font-weight: 400 !important;
              background: white !important;
              color: #1e293b !important;
              box-shadow: none !important;
              border: none !important;
            }
            .stamp-page {
              padding: 0 !important;
              margin: 0 auto !important;
            }
            .font-normal { font-weight: 400 !important; }
            .font-medium { font-weight: 500 !important; }
            .font-semibold { font-weight: 600 !important; }
            .font-bold, b, strong { font-weight: 700 !important; }
            .no-print { display: none !important; }
            .doc-page .absolute.bottom-5 {
              position: absolute !important;
              bottom: 12mm !important;
              left: 15mm !important;
              right: 15mm !important;
            }
            div[style*="transform"] { transform: none !important; }
          </style>

        </head>
        <body style="background: white; margin: 0; padding: 0;">
          ${printContainer.innerHTML}
        </body>
      </html>
    `);
    iframeDoc.close();

    let hasPrinted = false;
    const doPrint = () => {
      if (hasPrinted) return;
      hasPrinted = true;
      document.title = docTitle;
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        document.title = prevDocTitle;
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 1000);
    };

    iframe.contentWindow.onload = doPrint;
    // Fallback in case onload already fired
    setTimeout(doPrint, 600);
  };


  const scrollToPage = (pageNum) => {
    const pageEl = document.getElementById(`crm-agreement-page-${pageNum}`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 no-print animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-[28px] w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden border border-slate-800 shadow-2xl relative">
        
        {/* Header (Controls) */}
        <div className="bg-slate-950 px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 flex-shrink-0">
          {/* Left: Title & Page Jumps */}
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-400" />
              PM Surya Ghar Agreement {data.gpaStampUrl ? '(5 Pages · GPA Stamp Attached)' : '(4 Pages)'}
            </span>
            <div className="h-4 w-[1px] bg-slate-800 mx-1" />
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
              {data.gpaStampUrl && (
                <button
                  type="button"
                  onClick={() => scrollToPage(0)}
                  className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition cursor-pointer"
                >
                  Stamp Page
                </button>
              )}
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => scrollToPage(num)}
                  className="px-2 py-0.5 text-[10px] font-bold rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition cursor-pointer"
                >
                  Page {num}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Zoom, Font, Highlights, Rotate, Print & Close */}
          <div className="flex items-center gap-4 xl:gap-5">
            
            {/* Rotate Stamp Button (if stamp exists) */}
            {data.gpaStampUrl && (
              <button
                type="button"
                onClick={() => setStampRotation(prev => (prev + 90) % 360)}
                className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-amber-300 flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                title="Rotate stamp 90° clockwise if uploaded sideways"
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                <span>Rotate Stamp{stampRotation > 0 ? ` (${stampRotation}°)` : ''}</span>
              </button>
            )}

            {/* Highlight Toggle */}
            <button
              type="button"
              onClick={() => onChange({ ...data, showHighlights: !data.showHighlights })}
              className={`px-3.5 py-2 rounded-xl border text-xs flex items-center gap-2 transition font-bold ${
                data.showHighlights
                  ? 'bg-amber-400/20 border-amber-500/30 text-amber-300 shadow-lg shadow-amber-400/5'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
              }`}
            >
              {data.showHighlights ? <Eye className="w-4 h-4 text-amber-400" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
              <span>{data.showHighlights ? 'Highlights On' : 'Highlights Off'}</span>
            </button>

            {/* Font Size Selection */}
            <div className="flex items-center gap-2 bg-slate-900 rounded-xl border border-slate-800 px-3 py-1.5">
              <Type className="w-4 h-4 text-slate-400" />
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                className="bg-transparent border-0 text-xs font-bold text-slate-200 focus:outline-none focus:ring-0 cursor-pointer pr-1"
              >
                <option value="text-[14px]">Small (14px)</option>
                <option value="text-[16px]">Medium (16px)</option>
                <option value="text-[17px]">Standard (17px)</option>
                <option value="text-[19px]">Large (19px)</option>
              </select>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-2 bg-slate-900 rounded-xl border border-slate-800 px-3 py-1.5">
              <button
                onClick={() => setZoom(Math.max(60, zoom - 10))}
                className="text-slate-400 hover:text-slate-200 p-0.5"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-slate-200 w-9 text-center">{zoom}%</span>
              <button
                onClick={() => setZoom(Math.min(140, zoom + 10))}
                className="text-slate-400 hover:text-slate-200 p-0.5"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            {/* Print Button */}
            {onAddToDocuments && (
              <button
                onClick={handleAddToDocuments}
                disabled={adding}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition text-xs cursor-pointer"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>{adding ? 'Generating PDF...' : existingDocument ? 'Replace in Documents' : 'Add to Documents'}</span>
              </button>
            )}
            <button
              onClick={handlePrint}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 transition text-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-800 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Zoomable Pages Scroll Area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto p-8 bg-slate-950 print:bg-white print-document-container"
        >
          <div
            className="transition-transform origin-top mx-auto space-y-8 print:space-y-0 print:p-0 print:m-0 print:transform-none"
            style={{ transform: `scale(${zoom / 100})`, width: '210mm' }}
          >
            {data.gpaStampUrl && (
              <div id="crm-agreement-page-0" className="print:m-0 print:p-0">
                <div 
                  className="doc-page stamp-page bg-white relative mx-auto shadow-2xl rounded-sm overflow-hidden" 
                  style={{ minHeight: '297mm', height: '297mm', width: '210mm', boxSizing: 'border-box', padding: 0, position: 'relative' }}
                >
                  <img 
                    src={data.gpaStampUrl} 
                    alt="PM Surya GPA Stamp" 
                    onLoad={(e) => {
                      if (e.target.naturalWidth > e.target.naturalHeight && stampRotation === 0) {
                        setStampRotation(90);
                      }
                    }}
                    style={
                      stampRotation === 90
                        ? { width: '297mm', height: '210mm', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(90deg)', objectFit: 'fill', imageOrientation: 'from-image' }
                        : stampRotation === 180
                        ? { width: '210mm', height: '297mm', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(180deg)', objectFit: 'fill', imageOrientation: 'from-image' }
                        : stampRotation === 270
                        ? { width: '297mm', height: '210mm', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(270deg)', objectFit: 'fill', imageOrientation: 'from-image' }
                        : { width: '210mm', height: '297mm', display: 'block', objectFit: 'fill', imageOrientation: 'from-image' }
                    }
                  />
                </div>
              </div>
            )}
            <div id="crm-agreement-page-1" className="print:m-0 print:p-0"><Page1 data={data} fontSizeClass={fontSize} /></div>
            <div id="crm-agreement-page-2" className="print:m-0 print:p-0"><Page2 data={data} fontSizeClass={fontSize} /></div>
            <div id="crm-agreement-page-3" className="print:m-0 print:p-0"><Page3 data={data} fontSizeClass={fontSize} /></div>
            <div id="crm-agreement-page-4" className="print:m-0 print:p-0"><Page4 data={data} fontSizeClass={fontSize} /></div>
          </div>
        </div>
      </div>
    </div>
  );
};
