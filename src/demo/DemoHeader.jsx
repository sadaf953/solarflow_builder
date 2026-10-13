import { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, ArrowLeft, ArrowRight, X, Users, Minus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { tourSteps, navigateTour, clearTourNavigation } from './tour';
import './demo.css';
import { quickTour, workflowTour, workflowChapters } from './tourSteps';
import RolePicker from './RolePicker';
const roleLabels={admin:'Admin',sales:'Office',agent:'Channel Partner',agent2:'Dealer',vendor:'Vendor',stamp:'Stamp Maker',channel_partner_office:'Channel Partner Office',office2:'Manager'};
export default function DemoHeader({user,onTourRoleSwitch,children}){
 const [rolePickerOpen,setRolePickerOpen]=useState(false);
 const [tourMode,setTourMode]=useState('quick');const [menuOpen,setMenuOpen]=useState(false);
 const startTour=(mode='quick',index=0)=>{setMenuOpen(false);setFinished(false);setTourRole(user.userType);setTourMode(mode);setStep(index);};
 const [step,setStep]=useState(null);const [finished,setFinished]=useState(false);const [tourRole,setTourRole]=useState(user.userType);
 useEffect(()=>{setTourRole(user.userType);},[user.userType]);
 const steps=useMemo(()=>tourMode==='quick' && tourRole==='admin' ? quickTour : tourSteps(tourRole),[tourRole,tourMode]);const [switching,setSwitching]=useState(false);const [error,setError]=useState('');const [collapsed,setCollapsed]=useState(false);const titleRef=useRef(null);
 useEffect(()=>{
  if(step===null)return;
  let active=true;const entry=steps[step];
  async function go(){
   setCollapsed(false);setError('');setSwitching(true);clearTourNavigation();
   const safetyTimer = setTimeout(()=>{if(active)setSwitching(false);}, 4000);
   try{
    if(entry.role!==user.userType)await onTourRoleSwitch(entry.role);
    if(active){navigateTour(entry);titleRef.current?.focus();}
   }catch(e){
    if(active)setError(e.message || 'Could not open the next portal.');
   }finally{
    clearTimeout(safetyTimer);
    if(active)setSwitching(false);
   }
  }go();return()=>{active=false;};
 },[step,steps,user.userType]);
 const close=()=>{clearTourNavigation();setStep(null);};
 useEffect(()=>{const escape=e=>{if(e.key==='Escape' && !switching){setMenuOpen(false);close();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[switching]);
 const controls=<div className="demo-header-actions"><div className="demo-tour-menu-wrap"><button type="button" onClick={()=>setMenuOpen(!menuOpen)} disabled={switching} className="demo-tour-launch" aria-label="Guided tour" aria-expanded={menuOpen}><Compass size={17}/><span>Guided tour</span></button>{menuOpen && <div className="demo-tour-menu" aria-label="Choose a tour">{user.userType==='admin' && <button type="button" onClick={()=>startTour('quick')}>Quick introduction · 6 steps</button>}<button type="button" onClick={()=>startTour('full')}>Full walkthrough · {tourSteps(user.userType).length} steps</button>{tourSteps(user.userType)===workflowTour && <label className="demo-tour-chapters">Jump to a chapter<select aria-label="Walkthrough chapter" value="" onChange={event=>{if(event.target.value!=='')startTour('full',Number(event.target.value));}}><option value="">Choose a chapter…</option>{workflowChapters.map(chapter=><option key={chapter.start} value={chapter.start}>{chapter.title} · step {chapter.start+1}</option>)}</select><small>Save any edits before changing chapters.</small></label>}<button type="button" onClick={()=>setMenuOpen(false)}>Close menu</button></div>}</div><button type="button" onClick={()=>{setMenuOpen(false);close();setRolePickerOpen(true);}} disabled={switching} aria-label="Switch role"><Users size={17}/><span>Switch role</span></button></div>;
 return <>{children(controls,startTour)}{rolePickerOpen && <RolePicker currentRole={user.userType} onSelect={onTourRoleSwitch} onClose={()=>setRolePickerOpen(false)}/>}{createPortal(<div className={`demo-tour-overlay${collapsed ? ' is-collapsed' : ''}`}>

 {step!==null && collapsed && <button className="demo-tour-resume" onClick={()=>setCollapsed(false)}>Resume tour · {step+1}/{steps.length}</button>}
 {step!==null && !collapsed && <section aria-label="Guided tour" className="demo-tour-panel"><div className="demo-tour-progress">STEP {step+1} OF {steps.length}<progress value={step+1} max={steps.length}/></div><div className="demo-tour-copy"><h2 ref={titleRef} tabIndex={-1}>{steps[step].title}</h2><p>{steps[step].body}</p><small className="demo-tour-role">Portal: {roleLabels[steps[step].role] || steps[step].role} · {tourMode==='quick' ? 'Explore only · no edits needed' : 'Save edits before Next'}</small>{switching && <p role="status">Opening portal…</p>}{error && <p role="alert">{error} <button onClick={()=>{setStep(null);setTimeout(()=>setStep(step),0);}}>Retry</button></p>}</div><div className="demo-tour-controls"><button onClick={()=>setCollapsed(true)} aria-label="Hide guide while editing" title="Hide guide while editing"><Minus size={17}/></button><button onClick={()=>setStep(n=>n-1)} disabled={step===0 || switching} aria-label="Previous tour step"><ArrowLeft size={17}/></button><button className="demo-tour-next" disabled={switching || !!error} onClick={()=>{if(step===steps.length-1){close();setFinished(true);}else setStep(n=>n+1);}}>{step===steps.length-1?'Finish tour':'Next'}<ArrowRight size={17}/></button><button onClick={close} disabled={switching} aria-label="Close guided tour"><X size={18}/></button></div></section>}
 {finished && step===null && <div className="demo-tour-done" role="status">Tour complete. Keep exploring, or switch roles for another perspective.<button onClick={()=>setFinished(false)} aria-label="Dismiss tour completion"><X size={14}/></button></div>}</div>,document.body)}</>;
}
