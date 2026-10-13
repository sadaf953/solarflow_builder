import {containDialogFocus} from '../utils/dialogFocus';
import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {X, ArrowRight, LoaderCircle} from 'lucide-react';
import {APP_ROLES} from '../constants';
import {useGlobalPopup} from '../components/GlobalPopup';
const descriptions={admin:'See the whole business and every project.',sales:'Manage leads, quotations and daily office work.',channel_partner_office:'Manage your office and linked dealers.',office2:'Review your branch’s projects and team.',agent:'Create quotations and follow customer progress.',agent2:'Manage the leads assigned to your dealer account.',vendor:'Follow deliveries and update installation work.',stamp:'Prepare and return project documents.'};
export default function RolePicker({currentRole,onSelect,onClose}) {
 const ref=useRef(null);const busyRef=useRef(false);
 const [busy,setBusy]=useState('');const [error,setError]=useState('');
 const {showConfirm}=useGlobalPopup();
 useEffect(()=>{const dialog=ref.current;const previousFocus=document.activeElement?.tagName === 'BODY' ? document.querySelector('button[aria-label="Switch role"]') : document.activeElement;dialog.showModal();return()=>{dialog.close();if(previousFocus?.isConnected)previousFocus.focus();};},[]);
 async function choose(role){
  if(busyRef.current || role===currentRole)return;
  // A portal may have an editable form open underneath the picker.
  if(document.querySelector('.demo-app form, .demo-app .modal-body, [data-demo-editor]')){
   ref.current.close();
   const confirmed=await showConfirm('Save any current edits before switching. Continuing closes this view and discards unsaved edits.',{title:'Switch role?',confirmLabel:'Switch role',cancelLabel:'Keep editing',type:'warning'});
   if(!confirmed){onClose();return;}
   ref.current.showModal();
  }
  busyRef.current=true;setBusy(role);setError('');
  try{await onSelect(role);onClose();}
  catch{setError('Could not switch roles. Your current workspace is still open. Please try again.');}
  finally{busyRef.current=false;setBusy('');}
 }
 return createPortal(<dialog onKeyDown={containDialogFocus} ref={ref} className="demo-role-picker" aria-labelledby="role-picker-title" onCancel={event=>{event.preventDefault();if(!busyRef.current)onClose();}}>
  <div className="demo-role-picker-heading"><div><h2 id="role-picker-title">Explore another perspective</h2><p>Stay in the same demo workspace. Your saved sample records remain available.</p></div><button type="button" aria-label="Close role picker" disabled={!!busy} onClick={onClose}><X size={20}/></button></div>
  {error && <p role="alert" className="demo-login-error">{error}</p>}
  <div className="demo-role-picker-grid">{APP_ROLES.map(role=><button type="button" key={role.user_type} disabled={!!busy || role.user_type===currentRole} onClick={()=>choose(role.user_type)} aria-current={role.user_type===currentRole ? 'true' : undefined}><span><strong>{role.user_type==='stamp'?'Document coordinator':role.label}{role.user_type===currentRole && <small>Current role</small>}</strong><span>{descriptions[role.user_type]}</span></span>{busy===role.user_type?<LoaderCircle size={18} className="animate-spin"/>:<ArrowRight size={18}/>}</button>)}</div>
  {busy && <p role="status">Opening selected workspace…</p>}
 </dialog>,document.body);
}
