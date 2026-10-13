import {ensureGroupedDemoBatches} from './demo/deliveryBatches';
import {ensureThreeDemoDrivers} from './demo/drivers';
import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { readPreparedBriefId } from './enquiries/brief';
import { readSubmittedEnquiryId } from './enquiries/reopen';
import {ensureThreeDemoVendors,demoVendorTarget} from './demo/vendors';
import LoginScreen from './components/LoginScreen';
import BrandMark from './components/BrandMark';
import DemoHeader from './demo/DemoHeader';
const PasswordRecoveryModal=lazy(()=>import('./components/PasswordRecoveryModal'));
const TeamChatDrawer=lazy(()=>import('./components/TeamChatDrawer'));
const Dashboard=lazy(()=>import('./components/Dashboard'));
const AgentPortal=lazy(()=>import('./components/AgentPortal'));
const VendorPortal=lazy(()=>import('./components/VendorPortal'));
const StampPortal=lazy(()=>import('./components/StampPortal'));
const PricingView=lazy(()=>import('./components/PricingView'));
const Loader=()=> <div className="p-12 text-center text-stone-500" role="status">Opening your workspace…</div>;

// Landing-page gate.
//
// The Supabase client persists the anonymous demo session in localStorage
// (storageKey solarflow-demo-cloud-auth-v1), so a stored session outlives the
// browser. Restoring straight into a portal on that basis meant any visitor
// who had ever opened the demo never saw the landing page again.
//
// sessionStorage is per-tab and dies with it, so this flag draws the line in
// the right place: a new tab or a later visit starts at the landing page,
// while a refresh in the middle of a session still restores the workspace.
const ENTERED_KEY = 'solarflow_entered_demo';
function hasEnteredThisTab(){ try{ return !!sessionStorage.getItem(ENTERED_KEY); }catch{ return false; } }
function markEnteredThisTab(){ try{ sessionStorage.setItem(ENTERED_KEY,'1'); }catch{ /* private mode */ } }
function clearEnteredThisTab(){ try{ sessionStorage.removeItem(ENTERED_KEY); }catch{ /* ignore */ } }

function scheduleBackgroundDemoCleanup(client) {
 if (typeof window === 'undefined') return;
 const cleanupKey = 'solarflow_demo_cleanup_v2';
 if (window.sessionStorage.getItem(cleanupKey)) return;
 const run = () => {
  Promise.allSettled([
   ensureThreeDemoVendors(client),
   ensureThreeDemoDrivers(client),
   ensureGroupedDemoBatches(client)
  ]).then(() => {
   try { window.sessionStorage.setItem(cleanupKey, '1'); } catch { /* storage may be unavailable */ }
  }).catch(err => console.warn('Background cleanup notice:', err));
 };
 if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(run, { timeout: 3000 });
 } else {
  setTimeout(run, 1500);
 }
}

export default function App(){
 const [user,setUser]=useState(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const [recoveryMode, setRecoveryMode]=useState(false);
 const [publicView,setPublicView]=useState(()=>typeof window!=='undefined'&&(/^#\/(plans|quote)(\?|$)/.test(window.location.hash))?'plans':null);
 const [clientQuoteLink,setClientQuoteLink]=useState(()=>typeof window!=='undefined'&&Boolean(readPreparedBriefId(window.location.hash)||readSubmittedEnquiryId(window.location.hash)));
 useEffect(()=>{
  const sync=()=>{
   setClientQuoteLink(Boolean(readPreparedBriefId(window.location.hash)||readSubmittedEnquiryId(window.location.hash)));
   setPublicView(/^#\/(plans|quote)(\?|$)/.test(window.location.hash)?'plans':null);
  };
  window.addEventListener('hashchange',sync);
  window.addEventListener('popstate',sync);
  return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};
 },[]);
 useEffect(()=>{
  let active=true;
  if(typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('type=recovery')){
   setRecoveryMode(true);
  }
  async function restore(){
   try{
    // A shared quotation link always opens its client form, even in a browser
    // that previously entered the demo.
    if(readPreparedBriefId(window.location.hash)||readSubmittedEnquiryId(window.location.hash)
      || (/^#\/plans\?/.test(window.location.hash) && new URLSearchParams(window.location.hash.split('?')[1]).get('admin')==='1'))return;
    const {data}=await supabase.auth.getSession();
    if(!data?.session)return;
    // Fresh visit: show the landing page even though a session is stored.
    // Returning early also skips the profile round-trip, so the landing
    // page paints sooner.
    if(!hasEnteredThisTab())return;
    let userId = data.session.user?.id;
    if(!userId){
     const {data:identity,error:authError}=await supabase.auth.getUser();
     if(authError || !identity.user)return;
     userId = identity.user.id;
    }
    const {data:profile,error:profileError}=await supabase.from('profiles').select('*').eq('id',userId).maybeSingle();
    if(!profileError && profile?.status==='active' && active){
     if(profile.user_type==='vendor')profile.name=demoVendorTarget(profile.name)||profile.name;
     if(active)setUser({...profile,userType:profile.user_type,isDemo:true});
     if(['admin','sales'].includes(profile.user_type)){
      scheduleBackgroundDemoCleanup(supabase);
     }
    }
   }catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}
  }restore();
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{
   if(event==='SIGNED_OUT' && active){clearEnteredThisTab();setUser(null);}
   if(event==='PASSWORD_RECOVERY' && active)setRecoveryMode(true);
  });
  return()=>{active=false;subscription.unsubscribe();};
 },[]);
 // Entering from the landing page. restore() now returns early on a fresh
 // visit, so the cleanup it used to schedule for admin/sales is scheduled
 // here instead - otherwise it would stop running for those visitors.
 function enterDemo(nextUser){
  markEnteredThisTab();
  setPublicView(null);
  setUser(nextUser);
  if(nextUser && ['admin','sales'].includes(nextUser.userType)){
   scheduleBackgroundDemoCleanup(supabase);
  }
 }
 function openPlans(){setClientQuoteLink(false);setPublicView('plans');window.history.pushState(null,'','#/plans');}
 function closePlans(){setClientQuoteLink(false);setPublicView(null);window.history.pushState(null,'',window.location.pathname);}
 function chooseAgain(){
  clearEnteredThisTab();
  try { localStorage.removeItem('solarflow_visitor_name'); } catch { /* storage may be unavailable */ }
  setUser(null);setError('');window.history.replaceState(null,'',window.location.pathname);
  for(const key of ['solarflow_current_view','solarflow_selected_stage','solarflow_selected_customer_id'])sessionStorage.removeItem(key);
 }
 async function switchTourRole(role){
  const {data,error}=await supabase.rpc('start_demo_session',{p_role:role});
  if(error)throw error;if(!data?.id)throw new Error('Could not open this demo role.');
  window.history.replaceState(null,'',window.location.pathname);
  for(const key of ['solarflow_current_view','solarflow_selected_stage','solarflow_selected_customer_id'])sessionStorage.removeItem(key);
  if(data.user_type==='vendor')data.name=demoVendorTarget(data.name)||data.name;
  markEnteredThisTab();
  setUser({...data,userType:data.user_type,isDemo:true});
  if(['admin','sales'].includes(data.user_type)){
   scheduleBackgroundDemoCleanup(supabase);
  }
 }
 if(loading)return <Loader/>;
 const Portal=user?(['agent','agent2'].includes(user.userType)?AgentPortal:user.userType==='vendor'?VendorPortal:user.userType==='stamp'?StampPortal:Dashboard):null;
 return (
  <>
   {recoveryMode && (
    <Suspense fallback={<Loader/>}><PasswordRecoveryModal
     onClose={() => setRecoveryMode(false)}
     onSuccess={() => {
      setRecoveryMode(false);
      window.history.replaceState(null, '', window.location.pathname);
     }}
    /></Suspense>
   )}
   {!user ? (publicView === 'plans' ? (
    <div className="sf-page">
     <div className="sticky top-0 z-20 bg-white/95 border-b border-stone-200 px-4 py-3 backdrop-blur">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
       <button type="button" onClick={closePlans} className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400" aria-label="Back to SolarFlow home">
        <BrandMark size="md" />
        <span className="hidden sm:inline text-xs font-bold text-stone-600">← Back</span>
       </button>
       {!clientQuoteLink && <button type="button" onClick={closePlans} className="sf-btn-primary">Open demo</button>}
      </div>
     </div>
     <div className="px-4"><Suspense fallback={<Loader/>}><PricingView /></Suspense></div>
    </div>
   ) : (
    <LoginScreen initialError={error} onLogin={enterDemo} onOpenPlans={openPlans}/>
   )
   ) : (
    <>
     <DemoHeader user={user} onTourRoleSwitch={switchTourRole}>
      {(controls,startTour)=><div className="demo-app"><Suspense fallback={<Loader/>}><Portal key={user.userType} user={user} onLogout={chooseAgain} demoControls={controls} onStartDemoTour={startTour}/></Suspense></div>}
     </DemoHeader>
     <Suspense fallback={null}><TeamChatDrawer currentUser={user} /></Suspense>
    </>
   )}
  </>
 );
}
