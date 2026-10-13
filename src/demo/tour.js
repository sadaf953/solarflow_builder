import {useEffect,useRef} from 'react';
export {tourSteps} from './tourSteps';
let pending = null;
let serial = 0;
export function navigateTour(entry){
 pending={...entry,serial:++serial};
 window.dispatchEvent(new CustomEvent('solarflow:tour-navigate',{detail:pending}));
}
export function clearTourNavigation(){pending=null;serial++;}
// Retain navigation across lazy portal/child mounts, without replaying it on
// every state update. Async handlers can reject results from an older step.
export function useDemoTourNavigation(onNavigate,role,ready=true){
 const callback=useRef(onNavigate);callback.current=onNavigate;
 const handled=useRef(null);
 useEffect(()=>{
  const apply=entry=>{
   if(!ready || !entry || (role && entry.role!==role) || handled.current===entry.serial)return;
   handled.current=entry.serial;
   callback.current(entry,()=>pending?.serial===entry.serial);
  };
  const listener=event=>apply(event.detail);
  window.addEventListener('solarflow:tour-navigate',listener);apply(pending);
  return()=>window.removeEventListener('solarflow:tour-navigate',listener);
 },[role,ready]);
}
