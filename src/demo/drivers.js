// Remove only numbered demo drivers, after moving their assignments.
export const demoDriverTarget=name=>{
 const match=/^(?:Demo )?Driver(?: (\d+))?$/i.exec(String(name||'').trim());
 return match?`Driver ${match[1]?1+(Number(match[1])-1)%3:1}`:null;
};
export async function ensureThreeDemoDrivers(client){
 const checked=async query=>{const result=await query;if(result.error)throw result.error;return result.data;};
 const drivers=await checked(client.from('drivers').select('*'));
 const obsolete=drivers.filter(d=>demoDriverTarget(d.name)&&d.name!==demoDriverTarget(d.name));
 if(!obsolete.length&&drivers.length===3&&drivers.every(d=>demoDriverTarget(d.name)===d.name))return;
 for(let n=1;n<=3;n++){
  const name=`Driver ${n}`,phone=`000000000${n}`;
  await checked(client.from('drivers').upsert({name,phone,vehicle_number:`VEHICLE-00${n}`},{onConflict:'name',ignoreDuplicates:true}));
  // Retain an existing canonical driver's contact details, including user edits.
  const contact=drivers.find(d=>d.name===name)?.phone||phone;
  const names=obsolete.filter(d=>demoDriverTarget(d.name)===name).map(d=>d.name);if(!names.length)continue;
  await checked(client.from('admin').update({driver_name:name,driver_phone_number:contact}).in('driver_name',names).select('id'));
  await checked(client.from('delivery_batches').update({driver_name:name,driver_phone:contact}).in('driver_name',names).select('id'));
 }
 const ids=obsolete.map(d=>d.id);
 const removed=await checked(client.from('drivers').delete().in('id',ids).select('id'));
 if(removed.length!==ids.length)throw new Error('Some old demo drivers could not be removed. Refresh to retry.');
}
