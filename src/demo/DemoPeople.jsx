import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { APP_ROLES } from '../constants';

export default function DemoPeople() {
 const [people,setPeople]=useState([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 async function refresh(){
  setLoading(true);setError('');
  const {data,error:failure}=await supabase.from('demo_profiles').select('*').order('name');
  if(failure)setError('Run 03_connected_demo_scenarios.sql in the demo database to load connected profiles.');
  else setPeople(data||[]);
  setLoading(false);
 }
 useEffect(()=>{refresh();},[]);
 return <section className="p-4 md:p-6 space-y-4"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-bold">Demo people</h2><p className="text-sm text-stone-500">Each login role has a persistent profile. Integration staff appear in the material preparation and loading selectors.</p></div><button className="px-4 py-2 rounded-lg border bg-white" onClick={refresh} disabled={loading}>Refresh</button></div>
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 {loading?<p role="status">Loading profiles…</p>:<div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm text-left"><thead className="bg-stone-50"><tr>{['Name','Login / assignment','Partner','Status'].map(label=><th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{people.map(person=><tr className="border-t" key={person.id}><td className="p-3 font-semibold">{person.name}</td><td className="p-3">{APP_ROLES.find(role=>role.user_type===person.user_type)?.label||'Integration staff'}</td><td className="p-3">{person.channel_partner||'—'}</td><td className="p-3">{person.status}</td></tr>)}</tbody></table></div>}
 <p className="text-xs text-stone-500">Use Switch role to enter a login above. Staff assignments share this visitor’s demo workspace; no separate passwords are needed.</p></section>;
}
