export function projectAssignedElsewhere(project,editingBatch){
 return Boolean(project.delivery_batch_id && project.delivery_batch_id!==editingBatch?.batch_no);
}
export function filterDeliveryProjects(customers,{selectedIds=[],stage='MATERIAL DELIVERY',query=''}){
 const selected=new Set(selectedIds);const search=query.trim().toLowerCase();
 return customers.filter(project=>{
  if(project.deleted_at)return false;
  if(selected.has(project.id))return true;
  return (stage==='ALL'||project.stage===stage) && (!search||['customer_name','phone_number','villages','consumer_no'].some(key=>String(project[key]||'').toLowerCase().includes(search)));
 }).sort((a,b)=>Number(selected.has(b.id))-Number(selected.has(a.id)));
}
