import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Page1 } from './template/components/pages/Page1';
import { Page2 } from './template/components/pages/Page2';
import { Page3 } from './template/components/pages/Page3';
import { documentFor } from './model';
import './quotation.css';

export function fitQuotationPages(root) {
    if (!root) return [];
    const pages = Array.from(root.querySelectorAll('.a4-page'));
    for (const page of pages) {
        const body = page.firstElementChild;
        const footer = page.lastElementChild;
        body.style.transform = ''; body.style.height = ''; body.style.width = '100%'; body.style.flex = '0 0 auto';
        const style = getComputedStyle(page);
        const available = page.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - footer.offsetHeight - 4;
        const height = body.scrollHeight;
        if (height > available) {
            const scale = available / height;
            if (scale < 0.67) throw new Error('The quotation content is too long for three readable A4 pages. Shorten the address or custom notes.');
            body.style.transformOrigin = 'top left';
            body.style.width = `${100 / scale}%`;
            body.style.transform = `scale(${scale})`;
            body.style.height = `${height * scale}px`;
        }
        const fittedHeight = body.offsetHeight;
        if (fittedHeight > available + 1) {
            throw new Error('The quotation content does not fit safely on one of the A4 pages. Shorten the address or custom notes.');
        }
    }
    return pages;
}

// Preview and PDF must measure the same DOM state. Waiting only for fonts in
// the preview lets images change the layout after the fit pass has completed.
// Failed optional assets are allowed to settle so one broken image cannot hang
// preview or export forever.
export async function waitForQuotationAssets(root) {
    if (!root) return;
    const fontReady = document.fonts?.ready || Promise.resolve();
    const imageReady = Array.from(root.querySelectorAll('img')).map(img => new Promise(resolve => {
        let settled = false;
        const settle = () => {
            if (settled) return;
            settled = true;
            img.removeEventListener('load', settle);
            img.removeEventListener('error', settle);
            resolve();
        };
        img.addEventListener('load', settle, { once: true });
        img.addEventListener('error', settle, { once: true });
        if (img.complete) settle();
        window.setTimeout(settle, 5000);
    }));
    await Promise.all([fontReady, ...imageReady]);
    await new Promise(resolve => window.requestAnimationFrame(resolve));
}

export default function DocumentPages({ row,highlights = false,exportMode = false }) {
    const data = useMemo(() => documentFor(row),[row]);
    const root = useRef(null);
    const [error,setError] = useState('');
    useLayoutEffect(() => {
        let active = true;
        const fit = async () => {
            await waitForQuotationAssets(root.current);
            if (!active) return;
            try { fitQuotationPages(root.current); setError(''); } catch (err) { setError(err.message); }
        };
        fit();
        return () => { active = false; };
    },[data]);
    const fields = new Set(['page1.customerName','page1.customerPhone','page1.capacityKw','page1.yoursTrulyName','page1.yoursTrulyPhone','page2.solarPanelMake','page2.solarPanelQty','page2.inverterBrand',...data.page2.brandOptions.flatMap((_,i) => ['brandName','baseValue','discount','subsidy'].map(k => `page2.brandOptions.${i}.${k}`))]);
    return <div className={`quotation-paper${exportMode ? ' quotation-paper-export' : ''}`} ref={root}>{error && !exportMode && <p role="alert" className="q-error">{error}</p>}<Page1 data={data} highlightChanges={highlights} changedFields={fields} /><Page2 data={data} highlightChanges={highlights} changedFields={fields} /><Page3 data={data} /></div>;
}
