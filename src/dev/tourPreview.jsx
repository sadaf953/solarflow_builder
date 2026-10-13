// Development-only UI fixture. No Auth requests or database operations.
import { createRoot } from 'react-dom/client';
import App from '../App';
import inventoryReference from '../inventory/reference.json';
import { supabase } from '../supabase';
import { APP_ROLES, PRIMARY_STAGES, LOAN_TAGS, SUBSIDY_TAGS } from '../constants';
import { GlobalPopupProvider } from '../components/GlobalPopup';
import '../index.css';
import { generate200Customers } from '../demo/seed200';
if(import.meta.env.DEV){
 const id='11111111-1111-4111-8111-111111111111';
 let profile=null;
 const people=APP_ROLES.map((role,i)=>({id:`44444444-4444-4444-8444-${String(i+1).padStart(12,'0')}`,name:role.user_type==='vendor'?'Vendor 1':role.user_type==='agent2'?'Dealer 1':role.user_type==='agent'?'Surya Shakti Solar':role.user_type==='stamp'?'Stamp Guy':`Staff ${i+1}`,user_type:role.user_type,role:role.role,channel_partner:'Surya Shakti Solar',status:'active'}));
 for(const [i,name] of ['Ravi','Nikhil','Suresh'].entries())people.push({id:`55555555-5555-4555-8555-${String(i+1).padStart(12,'0')}`,name,user_type:'integration',role:'Integration Staff',status:'active',channel_partner:'Surya Shakti Solar'});
 const cpoPerson=people.find(p=>p.user_type==='channel_partner_office');
 const dealerPerson=people.find(p=>p.user_type==='agent2');
 for(const p of people)if(['agent2','office2'].includes(p.user_type))p.parent_profile_id=cpoPerson.id;
 const otherCpo={id:'77777777-7777-4777-8777-000000000001',name:'Ahmedabad Solar Office',user_type:'channel_partner_office',role:'Channel Partner Office',channel_partner:'Surya Shakti Solar',status:'active'};
 const otherDealer={id:'77777777-7777-4777-8777-000000000002',name:'City Solar Dealer',user_type:'agent2',role:'Dealer',channel_partner:'Surya Shakti Solar',status:'active',parent_profile_id:otherCpo.id};people.push(otherCpo,otherDealer);
 const inventoryItems=inventoryReference.catalog.map((item,i)=>({...item,id:`66666666-6666-4666-8666-${String(i+1).padStart(12,'0')}`,stock_on_hand:item.opening_stock}));
 const inventoryMoves=inventoryItems.filter(i=>i.stock_on_hand>0).map(i=>({id:crypto.randomUUID(),item_id:i.id,kind:'opening',quantity:i.stock_on_hand,note:'Sample opening stock',created_at:new Date().toISOString()}));
 const inventoryLines=Array.from({length:200},(_,i)=>inventoryReference.scenarios[i%2?'SHED':'ROOF'][i%3].items.map((item,j)=>({...item,id:`bom-${i}-${j}`,bom_id:`bom-${i}`}))).flat();
 const stampPerson=people.find(p=>p.user_type==='stamp');
 const adminPerson=people.find(p=>p.user_type==='admin');
 const customers=generate200Customers(cpoPerson.id, dealerPerson.id, otherDealer.id, adminPerson.id, stampPerson.id);
 supabase.auth.stopAutoRefresh();
 supabase.auth.getSession=async()=>({data:{session:profile?{user:{id}}:null},error:null});
 supabase.auth.getUser=async()=>({data:{user:{id}},error:null});
 supabase.auth.signInAnonymously=async()=>({data:{user:{id}},error:null});
 supabase.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});
 supabase.rpc=async(name,args)=>{
  if(name==='get_inventory_bom_lines')return {data:inventoryLines.map(line=>{const index=Number(line.bom_id.split('-')[1]);return {...line,customer_id:customers[index].id,customer_name:customers[index].customer_name,line_index:Number(line.id.split('-')[2]),issued:false};}),error:null};
  if(name==='set_bom_stock_quantity'){const customerIndex=customers.findIndex(c=>c.id===args.p_customer_id);const line=inventoryLines.find(l=>l.id===`bom-${customerIndex}-${args.p_line_index}`);if(line)line.stock_quantity=args.p_quantity;return {data:null,error:line?null:{message:'Line unavailable'}};}
  if(name==='sync_inventory_catalog')return {data:null,error:null};
  if(name==='record_inventory_movement'){const item=inventoryItems.find(i=>i.id===args.p_item_id);if(args.p_kind==='issue'&&item.stock_on_hand<args.p_quantity)return {error:{message:'Insufficient stock'}};item.stock_on_hand+=args.p_kind==='issue'?-args.p_quantity:args.p_quantity;inventoryMoves.unshift({id:crypto.randomUUID(),item_id:item.id,kind:args.p_kind,quantity:args.p_quantity,note:args.p_note,created_at:new Date().toISOString()});return {data:item,error:null};}
  if(name==='start_demo_session'){const role=APP_ROLES.find(r=>r.user_type===args.p_role);profile={cpo_profile_id:['channel_partner_office','office2'].includes(role.user_type)?cpoPerson.id:null,demo_profile_id:people.find(p=>p.user_type===role.user_type).id,id,user_type:role.user_type,userType:role.user_type,role:role.role,name:role.user_type==='vendor'?'Vendor 1':role.user_type==='agent2'?'Dealer 1':role.user_type==='stamp'?'Stamp Guy':'Surya Shakti Solar',email:'demo@example.invalid',channel_partner:'Surya Shakti Solar',status:'active'};return {data:profile,error:null};}
  const scoped=customers.filter(c=>(name!=='get_cpo_dashboard_metrics'||[cpoPerson.id,dealerPerson.id].includes(c.lead_creator_profile_id))&&(!args?.p_channel_partner||c.channel_partner===args.p_channel_partner)&&(!args?.p_dealer||c.sub_channel_partner===args.p_dealer));
  const stages={};for(const c of scoped)stages[c.stage]=(stages[c.stage]||0)+1;
  return {data:{totalProjects:scoped.length,liveProjects:scoped.filter(c=>!['COMPLETED','LOST PROJECT'].includes(c.stage)).length,completedCount:stages.COMPLETED||0,stageCounts:stages,loanCount:scoped.filter(c=>c.payment_type==='Loan').length,cashCount:scoped.filter(c=>c.payment_type==='Cash').length,loanTagCount:scoped.filter(c=>c.loan_tag).length,subsidyTagCount:scoped.filter(c=>c.subsidy_tag).length,installationTagCount:stages['INSTALLATION STATUS']||0},error:null};
 };
 supabase.from=table=>{
  let rows=table==='drivers'?[1,2,3].map(n=>({id:`driver-${n}`,name:`Driver ${n}`,phone:`000000000${n}`,vehicle_number:`VEHICLE-00${n}`})):table==='vendors'?[1,2,3].map(n=>({id:`vendor-${n}`,name:`Vendor ${n}`,email:`vendor.${n}@solarflow.example` })):table==='cpo_leads'?customers.filter(c=>[cpoPerson.id,dealerPerson.id].includes(c.lead_creator_profile_id)):table==='admin'?customers:table==='profiles'&&profile?[profile]:table==='inventory_items'?inventoryItems:table==='inventory_movements'?inventoryMoves:table==='bom_items'?inventoryLines:table==='demo_profiles'?people:table==='metadata'?people.filter(p=>p.user_type==='integration').map(p=>({id:p.id,category:'integration_by',label:p.name})):[],single=false;
  const q=new Proxy({}, {get(_,method){
   if(method==='then')return (resolve,reject)=>Promise.resolve({data:single?(rows[0]||null):rows,error:null,count:rows.length}).then(resolve,reject);
   return (key,value,third)=>{
    if(method==='eq')rows=rows.filter(r=>key.includes('->>')?String(r[key.split('->>')[0]]?.[key.split('->>')[1]])===value:r[key]===value);
    if(method==='not'&&value==='is')rows=rows.filter(r=>r[key]!=third);
    if(method==='ilike')rows=rows.filter(r=>String(r[key]||'').toLowerCase().includes(String(value).replaceAll('%','').toLowerCase()));
    if(method==='limit')rows=rows.slice(0,key);
    if(method==='range')rows=rows.slice(key,value+1);
    if(method==='neq')rows=rows.filter(r=>r[key]!==value);
    if(method==='is')rows=rows.filter(r=>r[key]==value);
    if(method==='in')rows=rows.filter(r=>value.includes(r[key]));
    if(method==='single'||method==='maybeSingle')single=true;
    return q;
   };
  }});return q;
 };
 supabase.channel=()=>{const channel={on(){return channel;},subscribe(){return channel;},unsubscribe(){}};return channel;};
 supabase.removeChannel=async()=>{};
 createRoot(document.getElementById('root')).render(<GlobalPopupProvider><App/></GlobalPopupProvider>);
}else document.getElementById('root').textContent='Development-only fixture.';
