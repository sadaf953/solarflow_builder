import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Save, Trash2 } from 'lucide-react';
import { calculate, fromRow, money, newForm, STEPS, validate } from './model';
import { brandedTemplate } from './branding';
import { quotationRepository as repo } from './client';
import { readRecovery, removeRecovery, writeRecovery } from './recovery';
import { useGlobalPopup } from '../components/GlobalPopup';
import { calculateSystemCapacityKwp } from '../utils/capacity';

const customerFields = [
    ['customer_name','Customer name','text',160],['customer_phone','Phone number','tel',20],['customer_email','Email address','email',160],
    ['full_address','Full address','textarea',400],['village','Village','text',100],['taluka','Taluka / subdivision','text',100],
    ['district','District','text',100],['pincode','Pincode','text',6],['quotation_date','Quotation date','date'],
    ['valid_until','Valid until','date'],['owner_name_snapshot','Salesperson name (automatic)','text',120,true],['owner_phone_snapshot','Salesperson phone','tel',20],
];
function Field({ label,value,onChange,type = 'text',maxLength,readOnly = false,children }) {
    return <label className="q-field"><span>{label}</span>{children || (type === 'textarea'
        ? <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} maxLength={maxLength} rows={3} readOnly={readOnly} />
        : <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} maxLength={maxLength} readOnly={readOnly} aria-readonly={readOnly || undefined} min={type === 'number' ? '0' : undefined} step={type === 'number' ? 'any' : undefined} inputMode={type === 'number' ? 'decimal' : undefined} />)}</label>;
}
export default function QuotationForm({ id,initialRow,user,onDirty,onSaved,onPreview }) {
    const { showAlert,showConfirm } = useGlobalPopup();
    const [form,setForm] = useState(() => initialRow ? fromRow(initialRow,user) : newForm(user));
    const [template,setTemplate] = useState(() => initialRow?.quotation_data?.template || brandedTemplate());
    const [step,setStep] = useState(0);
    const [saveState,setSaveState] = useState(initialRow ? 'Saved' : 'Enter customer name and phone to start saving');
    const [error,setError] = useState('');
    const [busy,setBusy] = useState(false);
    const [recovery,setRecovery] = useState(() => readRecovery(user.id,id));
    const rowRef = useRef(initialRow);
    const formRef = useRef(form);
    const templateRef = useRef(template);
    const changed = useRef(false);
    const saving = useRef(null);
    const active = useRef(true);
    const blocked = useRef(false);
    formRef.current = form; templateRef.current = template;
    const markDirty = () => { changed.current = true; onDirty(true); };
    const update = (key,value) => {
        const next = { ...formRef.current,[key]:value };
        formRef.current = next; setForm(next); markDirty();
        const stored = writeRecovery(user.id,id,{ form:next,template:templateRef.current,base_updated_at:rowRef.current?.updated_at || null });
        setSaveState(stored ? (navigator.onLine ? 'Unsaved changes' : 'Offline — recovery saved on this device') : 'Unsaved — device recovery unavailable');
    };
    async function save() {
        if (saving.current) return saving.current;
        if (blocked.current) throw new Error('Reopen the quotation to resolve the conflicting changes before saving.');
        if (!formRef.current.customer_name.trim() || !String(formRef.current.customer_phone).trim()) throw new Error('Enter customer name and phone to save a draft.');
        const work = async () => {
            do {
                const captured = formRef.current;
                const capturedTemplate = templateRef.current;
                if (active.current) { setSaveState('Saving…'); setError(''); }
                const saved = await repo.save(id,rowRef.current,captured,capturedTemplate,user);
                rowRef.current = saved;
                onSaved(saved);
                if (captured === formRef.current && capturedTemplate === templateRef.current) {
                    changed.current = false; onDirty(false); removeRecovery(user.id,id);
                    if (active.current) setSaveState('Saved');
                }
            } while (changed.current && active.current);
            return rowRef.current;
        };
        saving.current = work().catch(err => {
            if (/another session/.test(err.message)) blocked.current = true;
            if (active.current) { setError(err.message); setSaveState(navigator.onLine ? 'Save failed' : 'Offline — recovery saved on this device'); }
            throw err;
        }).finally(() => { saving.current = null; });
        return saving.current;
    }
    const saveRef = useRef(save); saveRef.current = save;
    useEffect(() => {
        active.current = true;
        if (changed.current) { onDirty(true); writeRecovery(user.id,id,{form:formRef.current,template:templateRef.current,base_updated_at:rowRef.current?.updated_at || null}); }
        const online = () => { if (changed.current) void saveRef.current().catch(() => {}); };
        const offline = () => setSaveState('Offline — recovery saved on this device');
        window.addEventListener('online',online); window.addEventListener('offline',offline);
        return () => { active.current = false; window.removeEventListener('online',online); window.removeEventListener('offline',offline); };
    // The editor is keyed by quotation ID; these values describe its initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },[]);
    useEffect(() => {
        if (!changed.current || recovery || blocked.current) return;
        const timer = setTimeout(() => { if (navigator.onLine) void saveRef.current().catch(() => {}); },900);
        return () => clearTimeout(timer);
    },[form,template,recovery]);
    const fillTestValues = () => {
        const testData = {
            customer_name: 'Test Customer',
            customer_phone: '0000000000',
            customer_email: 'test.customer@example.com',
            full_address: '101 Solar Park, Main Road',
            village: 'Demo District',
            taluka: 'Demo District',
            district: 'Demo District',
            pincode: '384265',
            capacity_kw: '3.48',
            project_type: 'Residential',
            solar_panel_make: 'SolarFlow 580',
            solar_panel_qty: '6',
            panel_wattage: '580',
            inverter_option: 'Option 1',
            inverter_brand: 'DemoVolt',
            geb_geda_charge: 'Including',
            options: [
                { brandName: 'SolarFlow Essential', baseValue: '189000', discount: '5000', subsidy: '78000' },
                { brandName: 'SolarFlow Plus', baseValue: '198000', discount: '5000', subsidy: '78000' },
                { brandName: 'SolarFlow Premium', baseValue: '205000', discount: '5000', subsidy: '78000' },
            ],
            custom_notes: ['Standard installation warranty included', 'Special seasonal discount applied'],
        };
        const next = { ...formRef.current, ...testData };
        formRef.current = next;
        setForm(next);
        markDirty();
        writeRecovery(user.id, id, { form: next, template: templateRef.current, base_updated_at: rowRef.current?.updated_at || null });
    };
    const totals = calculate(form.options);
    const autoCalcCapacity = () => {
        const kwp = calculateSystemCapacityKwp(form.panel_wattage, form.solar_panel_qty);
        if (kwp == null) {
            showAlert('Enter Module Wp and No of Modules first.', { title: 'Cannot calculate', type: 'warning' });
            return;
        }
        update('capacity_kw', String(kwp));
    };
    const restore = async () => {
        if (recovery.base_updated_at !== (rowRef.current?.updated_at || null) && !await showConfirm('The server has a newer version. Restore your local copy into the editor for review?',{confirmLabel:'Restore for review'})) return;
        setTemplate(recovery.template || template); templateRef.current = recovery.template || template;
        formRef.current = recovery.form; setForm(recovery.form); markDirty(); setRecovery(null);
    };
    const preview = async () => {
        if (busy) return;
        setBusy(true);
        try {
            let savedRow = rowRef.current;
            if (formRef.current.customer_name.trim() && String(formRef.current.customer_phone).trim()) {
                savedRow = await save();
            } else {
                if (!formRef.current.customer_name.trim()) formRef.current.customer_name = 'Draft Customer';
                if (!String(formRef.current.customer_phone).trim()) formRef.current.customer_phone = '0000000000';
                setForm({ ...formRef.current });
                savedRow = await save();
            }
            onPreview(savedRow);
        } catch (err) {
            if (rowRef.current) {
                onPreview(rowRef.current);
            } else {
                setError(err.message);
            }
        } finally {
            if (active.current) setBusy(false);
        }
    };
    return <div className="q-editor" data-demo-editor="quotation">
        <div className="q-stepper" aria-label="Quotation steps">{STEPS.map((title,i) => <button key={title} aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}><span>{i + 1}</span><small>{title}</small></button>)}</div>
        <div className="q-save-state" role="status">{saveState}</div>
        {error && <div className="q-error" role="alert">{error}</div>}
        {recovery && <div className="q-notice"><strong>A recovery copy is available on this device.</strong><p>Restore it to review your unsaved edits.</p><button onClick={restore}>Restore copy</button><button onClick={() => { removeRecovery(user.id,id); setRecovery(null); }}>Use server version</button></div>}
        <div className="q-panel">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <p className="q-eyebrow" style={{margin:0}}>STEP {step + 1} OF 4</p>
                <button type="button" onClick={fillTestValues} style={{background:'#fef3c7',borderColor:'#f59e0b',color:'#92400e',fontSize:12,padding:'4px 10px',minHeight:32}}>Use sample details</button>
            </div>
            <h2>{STEPS[step]}</h2>
            {step === 0 && <div className="q-grid">{customerFields.map(([key,label,type,maxLength,readOnly]) => <Field key={key} label={label} type={type} maxLength={maxLength} readOnly={readOnly} value={form[key]} onChange={value => update(key,value)} />)}</div>}
            {step === 1 && <div className="q-grid">
                <Field label="Project type"><select value={form.project_type} onChange={e => update('project_type',e.target.value)}><option>Residential</option><option>Commercial</option></select></Field>
                <Field label="Solar-panel make" value={form.solar_panel_make} maxLength={100} onChange={v => update('solar_panel_make',v)} />
                <Field label="Module Wp" type="number" value={form.panel_wattage} onChange={v => update('panel_wattage',v)} />
                <Field label="No of Modules" type="number" value={form.solar_panel_qty} onChange={v => update('solar_panel_qty',v)} />
                <Field label="System Capacity (kWp)"><span className="q-auto-field"><input aria-label="System Capacity (kWp)" type="number" min="0" step="any" inputMode="decimal" value={form.capacity_kw ?? ''} onChange={e => update('capacity_kw',e.target.value)} /><button type="button" onClick={autoCalcCapacity} title="Calculate from Module Wp x No of Modules">Auto</button></span></Field>
                <Field label="Inverter brand / make" value={form.inverter_brand} maxLength={100} onChange={v => update('inverter_brand',v)} />
                <Field label="GEB / GEDA charge"><select value={form.geb_geda_charge} onChange={e => update('geb_geda_charge',e.target.value)}><option>Including</option><option>Excluding</option></select></Field>
                <p className="q-muted">Module Wp × No of Modules ÷ 1000 = {form.capacity_kw || '—'} kWp</p>
            </div>}
            {step === 2 && <div className="q-price-options">{form.options.map((option,i) => <section className="q-option" key={i}><h3>Panel option {i + 1}</h3>
                <div className="q-grid">{[['brandName','Solar panel brand','text'],['baseValue','Base value (₹)','number'],['discount','Discount (₹)','number'],['subsidy','Subsidy (₹)','number']].map(([key,label,type]) => <Field key={key} label={label} type={type} maxLength={80} value={option[key]} onChange={value => update('options',form.options.map((o,index) => index === i ? {...o,[key]:value} : o))} />)}</div>
                <dl><div><dt>Net payable</dt><dd>{money(totals[i].netPayableAmount)}</dd></div><div><dt>After subsidy</dt><dd>{money(totals[i].netPriceAfterSubsidy)}</dd></div></dl>
                {i === 0 && <div className="q-actions"><button onClick={() => update('options',form.options.map(o => ({...o,discount:option.discount})))}>Apply discount to all</button><button onClick={() => update('options',form.options.map(o => ({...o,subsidy:option.subsidy})))}>Apply subsidy to all</button></div>}
            </section>)}</div>}
            {step === 3 && <>
                <h3>Standard notes</h3><ul className="q-standard-notes">{template.page2.notes.map(note => <li key={note}>{note}</li>)}</ul>
                <h3>Additional notes</h3>{form.custom_notes.map((note,i) => <div key={i} className="q-note"><Field label={`Note ${i + 1}`} type="textarea" maxLength={250} value={note} onChange={v => update('custom_notes',form.custom_notes.map((n,index) => index === i ? v : n))} /><button aria-label={`Remove note ${i + 1}`} onClick={() => update('custom_notes',form.custom_notes.filter((_,index) => index !== i))}><Trash2 size={18} /></button></div>)}
                {form.custom_notes.length < 5 && <button onClick={() => update('custom_notes',[...form.custom_notes,''])}><Plus size={16} /> Add note</button>}
                <h3 className="q-summary-title">Review quotation</h3><dl className="q-summary">{customerFields.map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{form[key] || '—'}</dd></div>)}{[['capacity_kw','System capacity (kWp)'],['project_type','Project type'],['solar_panel_make','Panel make'],['solar_panel_qty','No of Modules'],['panel_wattage','Module Wp'],['inverter_brand','Inverter brand / make'],['geb_geda_charge','GEB / GEDA']].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{form[key] || '—'}</dd></div>)}</dl>
                {totals.map((option,i) => <div className="q-option" key={i}><strong>{option.brandName}</strong><p>Base {money(option.baseValue)} · Discount {money(option.discount)} · Subsidy {money(option.subsidy)}</p><p>Net payable <strong>{money(option.netPayableAmount)}</strong> · After subsidy <strong>{money(option.netPriceAfterSubsidy)}</strong></p></div>)}
                <details><summary>Company, terms, warranty, BOM and bank details</summary><div className="q-template-summary"><h3>{template.company.name} {template.company.tagline}</h3><p>GST: {template.company.gstNo} · CIN: {template.company.cinNo}</p><p>{template.company.email}</p>{[['Terms and conditions',template.page3.termsAndConditions],['Warranties',template.page3.warranties]].map(([title,items]) => <section key={title}><h3>{title}</h3><dl className="q-summary">{items.map(item => <div key={item.sr}><dt>{item.parameter}</dt><dd>{item.remarks}</dd></div>)}</dl></section>)}<h3>Bill of materials</h3>{template.page3.bomItems.map(item => <p key={item.sr}><strong>{item.description}</strong> — {item.qty} {item.unit}, {item.size}, {item.make}</p>)}<h3>Other charges</h3><p>{template.page3.otherChargesText}</p><h3>Bank details</h3><p>{template.page3.bankDetails.accountName}</p><p>{template.page3.bankDetails.bankName} · {template.page3.bankDetails.branchName}</p><p>Account: {template.page3.bankDetails.accountNumber} · IFSC: {template.page3.bankDetails.ifscCode}</p><h3>Offices</h3><p>{template.footer.corporateOffice}</p><p>{template.footer.branchOffice}</p></div></details>
            </>}
        </div>
        <div className="q-editor-actions"><button disabled={step === 0 || busy} onClick={() => setStep(s => s - 1)}><ChevronLeft size={16} /> Back</button><button disabled={busy || !!recovery} onClick={async () => { try { await save(); } catch (err) { setError(err.message); } }}><Save size={16} /> Save draft</button>{step < 3 ? <button className="q-primary" onClick={() => setStep(s => s + 1)}>Next <ChevronRight size={16} /></button> : <button className="q-primary" disabled={busy || !!recovery} onClick={preview}>{busy ? 'Saving…' : 'Preview PDF'}</button>}</div>
    </div>;
}
