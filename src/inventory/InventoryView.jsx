import {useDemoTourNavigation} from '../demo/tour';
import {DATA_EXPORTS_ENABLED} from '../demo/config';
import {useEffect,useRef,useState} from 'react';
import {Package,History,CalendarDays,RefreshCw,Download,PackageCheck,PackageX,Activity,Archive,RotateCcw,Plus} from 'lucide-react';
import {supabase} from '../supabase';
import {dailyStock,stockDay} from './model';
import './inventory.css';
import {inventoryLoadMessage} from './errors';
const tabs=[['stock','Stock',Package],['movements','Movements',History],['daily','Daily Report',CalendarDays],['archived','Archived',Archive]];
const fmt=n=>Number(n).toLocaleString('en-IN',{maximumFractionDigits:3});
const blankItem={product_name:'',sku:'',uom:'Nos',category:'General',reorder_level:'0'};
const normalizeKey=(name,unit)=>`${name.trim().toLowerCase().replace(/\s+/g,' ').replace('16sq mm la cabel','16sq mm la cable').replace('condute pipe','conduite pipe')}|${/^(no\.?|nos\.?)$/i.test(unit.trim())?'Nos':unit.trim()}`;
export default function InventoryView({currentUser}){
 const [items,setItems]=useState([]),[history,setHistory]=useState([]),[search,setSearch]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[selected,setSelected]=useState(null),[kind,setKind]=useState('receipt'),[qty,setQty]=useState(''),[note,setNote]=useState('');
 const [tab,setTab]=useState('stock'),[visibleCount,setVisibleCount]=useState(50),[loadFailed,setLoadFailed]=useState(false),[stockFilter,setStockFilter]=useState('all');
 const [historyLoading,setHistoryLoading]=useState(false),[historyLoaded,setHistoryLoaded]=useState(false),[todayMovementCount,setTodayMovementCount]=useState(null);
 const [itemDraft,setItemDraft]=useState(null),[categoryFilter,setCategoryFilter]=useState('all');
 useDemoTourNavigation(entry=>{if(entry.view==='inventory' && tabs.some(([id])=>id===entry.tab)){setTab(entry.tab);setVisibleCount(50);setSearch('');}});
 const [reportDay,setReportDay]=useState(()=>stockDay(Date.now()));const request=useRef(null),inventoryPanelRef=useRef(null),historyRequest=useRef(null);

 const readAll=async(table,order)=>{const rows=[];for(let offset=0;;offset+=1000){const p=await supabase.from(table).select('*').order(order).range(offset,offset+999);if(p.error)throw p.error;rows.push(...p.data);if(p.data.length<1000)return rows;}};

 async function loadHistory(force=false){
  if(historyLoading||(!force&&historyLoaded))return;
  const token=crypto.randomUUID();historyRequest.current=token;setHistoryLoading(true);
  try{
   const moves=await readAll('inventory_movements','id');
   if(historyRequest.current!==token)return;
   const sorted=moves.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
   setHistory(sorted);setHistoryLoaded(true);setTodayMovementCount(sorted.filter(movement=>stockDay(movement.created_at)===stockDay(Date.now())).length);
  }catch(e){
   if(historyRequest.current===token){console.error('Inventory history load failed',e);setError(inventoryLoadMessage(e));}
  }finally{if(historyRequest.current===token)setHistoryLoading(false);}
 }

 function downloadDailyReport() {
  const filtered = items.filter(i => `${i.sku} ${i.product_name} ${i.uom}`.toLowerCase().includes(search.toLowerCase()));
  const reportData = dailyStock(filtered, history, reportDay);
  const escapeCsv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const headers = ['Material', 'SKU', 'Unit', 'Opening Stock', 'Incoming (+)', 'Outgoing (-)', 'Closing Stock', 'Report Date'];
  const lines = [
   headers.map(escapeCsv).join(','),
   ...reportData.map(r => [
    escapeCsv(r.product_name),
    escapeCsv(r.sku || ''),
    escapeCsv(r.uom),
    escapeCsv(r.opening),
    escapeCsv(r.incoming),
    escapeCsv(r.outgoing),
    escapeCsv(r.closing),
    escapeCsv(reportDay)
   ].join(','))
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `SolarFlow_Daily_Inventory_${reportDay}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
 }

 function downloadCurrentStock() {
  const escapeCsv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const headers = ['Material', 'SKU', 'Unit', 'Available Stock', 'Reorder Level', 'Status'];
  const lines = [
   headers.map(escapeCsv).join(','),
   ...shown.map(r => [
    escapeCsv(r.product_name),
    escapeCsv(r.sku || ''),
    escapeCsv(r.uom),
    escapeCsv(r.stock_on_hand),
    escapeCsv(r.reorder_level),
    escapeCsv(Number(r.stock_on_hand) <= Number(r.reorder_level) ? 'Low Stock' : 'In Stock')
   ].join(','))
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `SolarFlow_Stock_${stockDay(Date.now())}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
 }
 async function refresh(){setLoading(true);setLoadFailed(false);setError('');try{
  const todayKey=stockDay(Date.now());
  const dayStart=new Date(`${todayKey}T00:00:00+05:30`);
  const dayEnd=new Date(dayStart.getTime()+86400000);
  const stock=await readAll('inventory_items','sku');
  stock.sort((a,b)=>(a.category||'General').localeCompare(b.category||'General')||a.product_name.localeCompare(b.product_name));
  setItems(stock);setLoading(false);
  supabase.from('inventory_movements').select('id',{count:'exact',head:true}).gte('created_at',dayStart.toISOString()).lt('created_at',dayEnd.toISOString()).then(countResult=>{
   if(countResult.error)console.error('Today inventory movement count failed',countResult.error);
   else setTodayMovementCount(countResult.count||0);
  });
  if(historyLoaded)loadHistory(true);
 }catch(e){setLoadFailed(true);console.error('Inventory load failed',e);setError(inventoryLoadMessage(e));}finally{setLoading(false);}}
 useEffect(()=>{refresh();},[]);
 useEffect(()=>{if((tab==='movements'||tab==='daily')&&!historyLoaded)loadHistory();},[tab,historyLoaded]);
 useEffect(()=>{setVisibleCount(50);},[tab,search,reportDay,stockFilter,categoryFilter]);
 const stockState=item=>{const stock=Number(item.stock_on_hand)||0,reorder=Number(item.reorder_level)||0;if(stock<=0)return 'out';if(stock<=reorder)return 'low';return 'good';};
 const activeItems=items.filter(item=>!item.archived_at);
 const archivedItems=items.filter(item=>!!item.archived_at);
 const categories=[...new Set(activeItems.map(item=>item.category||'General'))].sort((a,b)=>a.localeCompare(b));
 const searchedItems=activeItems.filter(i=>`${i.sku} ${i.product_name} ${i.uom} ${i.category||'General'}`.toLowerCase().includes(search.toLowerCase()));
 const shown=searchedItems.filter(item=>(categoryFilter==='all'||(item.category||'General')===categoryFilter)&&(stockFilter==='all'||(stockFilter==='attention'?stockState(item)!=='good':stockState(item)===stockFilter)));
 const outItems=activeItems.filter(item=>stockState(item)==='out');
 const lowItems=activeItems.filter(item=>stockState(item)==='low');
 const goodItems=activeItems.filter(item=>stockState(item)==='good');
 const today=stockDay(Date.now());
 const todayMovements=history.filter(movement=>stockDay(movement.created_at)===today);
 const attentionItems=[...outItems,...lowItems].sort((a,b)=>Number(a.stock_on_hand)-Number(b.stock_on_hand));
 const itemMap=new Map(items.map(i=>[i.id,i]));
 const moves=history.filter(m=>`${itemMap.get(m.item_id)?.product_name||''} ${m.note} ${m.kind}`.toLowerCase().includes(search.toLowerCase()));
 const rows=tab==='stock'?shown:tab==='archived'?archivedItems.filter(i=>`${i.sku} ${i.product_name} ${i.uom} ${i.category||'General'}`.toLowerCase().includes(search.toLowerCase())):tab==='daily'?dailyStock(items,history,reportDay).filter(i=>`${i.sku} ${i.product_name}`.toLowerCase().includes(search.toLowerCase())):moves;
 const visible=tab==='movements'?rows.slice(0,visibleCount):rows;
 function openStock(item,movement='receipt'){setSelected(item);setKind(movement);setQty('');setNote('');setError('');}
 async function saveItem(event){
  event.preventDefault();if(saving)return;
  const name=itemDraft.product_name.trim(),sku=itemDraft.sku.trim().toUpperCase(),unit=itemDraft.uom.trim(),category=itemDraft.category.trim()||'General',reorder=Number(itemDraft.reorder_level);
  if(!name||!sku||!unit||!Number.isFinite(reorder)||reorder<0||Math.round(reorder*1000)!==reorder*1000){setError('Enter a name, SKU, unit and valid reorder level (up to 3 decimal places).');return;}
  setSaving(true);setError('');
  try{
   const payload={product_name:name,sku,uom:unit,category,reorder_level:reorder,item_key:normalizeKey(name,unit)};
   const {data,error:failure}=itemDraft.id
    ?await supabase.from('inventory_items').update({category,reorder_level:reorder}).eq('id',itemDraft.id).select('id')
    :await supabase.from('inventory_items').insert(payload).select('id');
   if(failure)throw failure;
   if(!data?.length)throw new Error('The item could not be saved. Refresh and try again.');
   setItemDraft(null);setTab('stock');setCategoryFilter('all');await refresh();
  }catch(e){setError(e.code==='23505'?'An item with this material name/unit or SKU already exists.':['PGRST204','42703'].includes(e.code)?'Inventory setup is required before adding items. Run the supplied SQL.':e.message);}finally{setSaving(false);}
 }
 async function setArchived(item,archived){
  if(saving)return;setSaving(true);setError('');
  try{
   const {data,error:failure}=await supabase.from('inventory_items').update({archived_at:archived?new Date().toISOString():null}).eq('id',item.id).select('id');
   if(failure)throw failure;
   if(!data?.length)throw new Error('The item could not be updated. Refresh and try again.');
   await refresh();
  }catch(e){setError(['PGRST204','42703'].includes(e.code)?'Inventory setup is required before archiving items. Run the supplied SQL.':e.message);}finally{setSaving(false);}
 }
  async function record(e){
   e.preventDefault();
   if(saving)return;
   const amount=Number(qty);
   if(!Number.isFinite(amount)||amount<=0){setError('Enter a positive quantity.');return;}
   const actorName = currentUser?.name || 'Admin';
   const userNote = note.trim();
   // Append author attribution so it's cleanly stored and visible across reload/sessions
   const baseText = userNote || (kind==='receipt' ? 'Stock addition' : 'Stock issue');
   const effectiveNote = `${baseText} · by ${actorName}`;
   const fingerprint=JSON.stringify([selected.id,kind,amount,effectiveNote]);
   if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,id:crypto.randomUUID()};
   setSaving(true);setError('');
   try{
    const {error:failure}=await supabase.rpc('record_inventory_movement',{p_item_id:selected.id,p_kind:kind,p_quantity:amount,p_note:effectiveNote,p_request_id:request.current.id});
    if(failure)throw failure;
    setSelected(null);request.current=null;await refresh();
   }catch(e){setError(e.message);}finally{setSaving(false);}
  }

 // Helper to parse author from note or identify system/delivery source
 function formatMovementRow(row) {
  const noteStr = row.note || '';
  const byMatch = noteStr.match(/\s+·\s+by\s+(.+)$/i);
  if (byMatch) {
   return {
    displayNote: noteStr.slice(0, byMatch.index),
    author: byMatch[1]
   };
  }
  if (noteStr.startsWith('BOM delivery:')) {
   return {
    displayNote: noteStr,
    author: 'Delivery System'
   };
  }
  if (row.kind === 'opening') {
   return {
    displayNote: noteStr,
    author: 'System (Opening)'
   };
  }
  return {
   displayNote: noteStr,
   author: currentUser?.name || 'Admin'
  };
 }

 return <section className="inventory">
 <div className="inventory-heading inventory-hero">
   <div>
     <span className="inventory-eyebrow">MATERIALS &amp; STOCK</span>
     <h2>Inventory</h2>
     <p>Track available material, reorder needs, receipts and site issues.</p>
   </div>
   <div className="inventory-hero-actions">
     <button className="inventory-primary" onClick={()=>{setItemDraft({...blankItem});setError('');}} disabled={loading||saving}><Plus size={14}/> New item</button>
     <button onClick={refresh} disabled={loading||saving}>
       <RefreshCw size={14}/> Refresh
     </button>
   </div>
 </div>
 <div className="inventory-summary">
   <div><Package size={18}/><strong>{loading || loadFailed ? '—' : activeItems.length}</strong><span>Materials tracked</span><small>Active stock catalogue</small></div>
   <div><PackageCheck size={18}/><strong>{loading || loadFailed ? '—' : goodItems.length}</strong><span>Healthy stock</span><small>Above reorder level</small></div>
   <div><PackageX size={18}/><strong>{loading || loadFailed ? '—' : attentionItems.length}</strong><span>Needs attention</span><small>{loading || loadFailed ? 'Check stock levels' : `${outItems.length} out · ${lowItems.length} low`}</small></div>
   <div><Activity size={18}/><strong>{loading || loadFailed ? '—' : historyLoaded ? todayMovements.length : todayMovementCount ?? '—'}</strong><span>Movements today</span><small>Receipts and issues</small></div>
 </div>
 {!loading && !loadFailed && attentionItems.length>0 && <div className="inventory-attention">
   <div className="inventory-attention-copy"><span>Reorder attention</span><p>{attentionItems.length} materials are at or below their reorder level.</p></div>
   <div className="inventory-attention-items">{attentionItems.slice(0,5).map(item=><button type="button" key={item.id} onClick={()=>openStock(item)} title={`Receive ${item.product_name}`}><strong>{item.product_name}</strong><span>{fmt(item.stock_on_hand)} {item.uom}</span></button>)}</div>
   <button type="button" className="inventory-attention-view" onClick={()=>{setTab('stock');setStockFilter('attention');setSearch('');requestAnimationFrame(()=>inventoryPanelRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));}}>View all shortages</button>
 </div>}
 <div className="inventory-tabs" role="tablist" aria-label="Inventory sections">{tabs.map(([id,label,Icon])=><button key={id} id={`inv-tab-${id}`} role="tab" aria-selected={tab===id} aria-controls={`inv-panel-${id}`} onClick={()=>setTab(id)}><Icon size={16}/>{label}</button>)}</div>
 {error&&<p className="inventory-error" role="alert">{error}</p>}
 <section ref={inventoryPanelRef} role="tabpanel" id={`inv-panel-${tab}`} aria-labelledby={`inv-tab-${tab}`} className="inventory-panel">
 <div className="inventory-filters">
   <label>Search inventory<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Material, SKU or movement reference"/></label>
   {tab==='stock'&&<label>Section<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">All sections</option>{categories.map(category=><option key={category} value={category}>{category}</option>)}</select></label>}
   {tab==='stock'&&<div className="inventory-stock-filters" aria-label="Filter by stock health">
     {[['all','All',activeItems.length],['attention','Needs reorder',attentionItems.length],['out','Out',outItems.length],['low','Low',lowItems.length],['good','Healthy',goodItems.length]].map(([id,label,count])=><button type="button" key={id} aria-pressed={stockFilter===id} onClick={()=>setStockFilter(id)}>{label}<span>{count}</span></button>)}
   </div>}
   {tab==='daily'&&(
     <>
       <label>Report date (India time)<input type="date" value={reportDay} max={stockDay(Date.now())} onChange={e=>{if(e.target.value)setReportDay(e.target.value);}}/></label>
       {DATA_EXPORTS_ENABLED && <button type="button" className="inventory-download-btn" onClick={downloadDailyReport} disabled={loading||loadFailed||historyLoading||!historyLoaded} title="Download daily inventory report as CSV">
         <Download size={14}/> Download Daily Report (CSV)
       </button>}
     </>
   )}
   {DATA_EXPORTS_ENABLED && tab==='stock'&&(
     <button type="button" className="inventory-download-btn" onClick={downloadCurrentStock} disabled={loading||loadFailed} title="Export current stock inventory as CSV">
       <Download size={14}/> Export Stock (CSV)
     </button>
   )}
 </div>
 <p className="inventory-help">{tab==='stock'?'Add materials, arrange them by section, and receive or issue stock. Delivered batches deduct their BOM quantities automatically.':tab==='archived'?'Archived items stay in the database with their stock history. Restore them any time.':tab==='daily'?'Opening + incoming − outgoing = closing. Use the date picker to review any day.':'Every receipt and issue is recorded with its reference and team member.'}</p>
 {loading||((tab==='movements'||tab==='daily')&&historyLoading)?<div className="inventory-loading" role="status"><RefreshCw size={18}/><span>{loading?'Loading stock…':'Loading movement history…'}</span></div>:loadFailed?<div className="inventory-empty"><h3>Inventory couldn’t be loaded</h3><p>Your stock records have not been changed. Choose Refresh to try again.</p></div>:<div className="inventory-table"><table><thead><tr>{(tab==='stock'?['Material','Stock health','Available','Actions']:tab==='archived'?['Material','Section','Stock kept','Actions']:tab==='daily'?['Material','Unit','Opening','Incoming','Outgoing','Closing']:['Material','Movement','Quantity','Reference','By','Recorded']).map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>
 {visible.map((row,index)=>{
  if(tab==='stock'){
   const state=stockState(row),reorder=Number(row.reorder_level)||0,stock=Number(row.stock_on_hand)||0;
   const fill=reorder>0?Math.min(100,Math.round(stock/(reorder*2)*100)):stock>0?100:0;
   return <tr key={row.id}>
    <td><strong>{row.product_name}</strong><small>{row.sku} · {row.uom} · {row.category||'General'}</small></td>
    <td><span className={`inventory-badge ${state}`}>{state==='out'?'Out of stock':state==='low'?'Low stock':'In stock'}</span></td>
    <td><div className="inventory-level"><div><strong>{fmt(stock)} {row.uom}</strong><small>Reorder at {fmt(reorder)}</small></div><span><i className={state} style={{width:`${fill}%`}}/></span></div></td>
    <td><div className="inventory-row-actions"><button className="inventory-primary" onClick={()=>openStock(row)}>Receive</button><button onClick={()=>openStock(row,'issue')} disabled={stock<=0}>Issue</button><button onClick={()=>{setItemDraft({...row});setError('');}}>Edit</button><button onClick={()=>setArchived(row,true)} disabled={saving} title="Move to Archived; stock history is kept"><Archive size={13}/> Archive</button></div></td>
   </tr>;
  }
  if(tab==='archived')return <tr key={row.id}><td><strong>{row.product_name}</strong><small>{row.sku} · {row.uom}</small></td><td>{row.category||'General'}</td><td>{fmt(row.stock_on_hand)} {row.uom}</td><td><button onClick={()=>setArchived(row,false)} disabled={saving}><RotateCcw size={13}/> Restore</button></td></tr>;
  if(tab==='daily')return <tr key={row.id}><td>{row.product_name}</td><td>{row.uom}</td><td>{fmt(row.opening)}</td><td className="inventory-in">+{fmt(row.incoming)}</td><td className="inventory-out">−{fmt(row.outgoing)}</td><td><strong>{fmt(row.closing)}</strong></td></tr>;
  const parsed=formatMovementRow(row);
  return <tr key={row.id||index}><td>{itemMap.get(row.item_id)?.product_name||'Material'}</td><td><span className={`inventory-badge ${row.kind==='issue'?'low':'good'}`}>{row.kind}</span></td><td>{row.kind==='issue'?'−':'+'}{fmt(row.quantity)} {itemMap.get(row.item_id)?.uom}</td><td>{parsed.displayNote}</td><td><span className="inventory-badge inventory-author">{parsed.author}</span></td><td>{new Date(row.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</td></tr>;
 })}
 </tbody></table>{!visible.length&&<p className="inventory-empty">No matching records.</p>}</div>}
 {!loading && !loadFailed && <div className="inventory-pagination">
   <span>{tab==='movements'?`Showing ${Math.min(visible.length,rows.length)} of ${rows.length} movements`:`Showing all ${rows.length} ${tab==='stock'?'materials':'materials for this report'}`}</span>
   {tab==='movements'&&visible.length<rows.length&&<button type="button" onClick={()=>setVisibleCount(count=>count+50)}>Load 50 more movements</button>}
 </div>}
 </section>
  {itemDraft&&<div className="inventory-backdrop"><section role="dialog" aria-modal="true" aria-label={itemDraft.id?'Edit inventory item':'Add inventory item'} className="inventory-dialog"><form onSubmit={saveItem}><h3>{itemDraft.id?'Edit inventory item':'Add inventory item'}</h3><p>{itemDraft.id?'Change its section or reorder level. Material identity stays linked to existing BOM and movement history.':'The item will be saved to the shared stock catalogue. Start with zero stock, then use Receive to add a quantity.'}</p><label>Material name<input autoFocus required maxLength={160} value={itemDraft.product_name} onChange={e=>setItemDraft({...itemDraft,product_name:e.target.value})} disabled={saving||!!itemDraft.id}/></label><label>SKU<input required maxLength={80} value={itemDraft.sku} onChange={e=>setItemDraft({...itemDraft,sku:e.target.value})} disabled={saving||!!itemDraft.id}/></label><label>Unit<input required maxLength={40} value={itemDraft.uom} onChange={e=>setItemDraft({...itemDraft,uom:e.target.value})} disabled={saving||!!itemDraft.id}/></label><label>Section<input required maxLength={80} list="inventory-sections" value={itemDraft.category||'General'} onChange={e=>setItemDraft({...itemDraft,category:e.target.value})} disabled={saving}/><datalist id="inventory-sections">{categories.map(category=><option key={category} value={category}/>)}</datalist></label><label>Reorder level<input required type="number" min="0" step="0.001" value={itemDraft.reorder_level} onChange={e=>setItemDraft({...itemDraft,reorder_level:e.target.value})} disabled={saving}/></label>{error&&<p role="alert" className="inventory-error">{error}</p>}<div className="inventory-heading"><button type="button" disabled={saving} onClick={()=>{setItemDraft(null);setError('');}}>Cancel</button><button className="inventory-primary" type="submit" disabled={saving}>{saving?'Saving…':itemDraft.id?'Save changes':'Add item'}</button></div></form></section></div>}
  {selected&&<div className="inventory-backdrop"><section role="dialog" aria-modal="true" aria-label="Record stock movement" className="inventory-dialog"><form onSubmit={record}><h3>{kind==='receipt'?'Add quantity':'Issue stock'} · {selected.product_name}</h3><p>Available: {fmt(selected.stock_on_hand)} {selected.uom}</p><label>Quantity ({selected.uom})<input autoFocus type="number" min="0.001" step="0.001" value={qty} onChange={e=>setQty(e.target.value)} required disabled={saving}/></label><label>Reference / note <small style={{color:'#78716c',fontWeight:'normal'}}>(optional)</small><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Delivery note, return or project reference (optional)" maxLength={500} disabled={saving}/></label>{error&&<p role="alert" className="inventory-error">{error}</p>}<div className="inventory-heading"><button type="button" disabled={saving} onClick={()=>setSelected(null)}>Cancel</button><button className="inventory-primary" type="submit" disabled={saving}>{saving?'Saving…':'Save quantity'}</button></div></form></section></div>}
 </section>;
}
