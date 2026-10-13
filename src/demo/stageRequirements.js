// Demo progression needs only the essentials. Uploads never gate a stage.
const present = value => value != null && String(value).trim() !== '';
const yes = value => ['yes', 'installed'].includes(String(value || '').trim().toLowerCase());
const positive = value => Number(String(value ?? '').replaceAll(',', '')) > 0;
export const stageRequirements = {
 'LEADS': [['customer_name','Customer Name'],['phone_number','Phone Number']],
 'REGISTRATION': [['registration_date','Registration Date'],['payment_type','Payment Type (Loan or Cash)',v=>['loan','cash'].includes(String(v || '').trim().toLowerCase())]],
 'LOAN': [['jansamarth_application_no','Jansamarth Application No']],
 'CASH': [['payment_type','Payment Type']],
 'MATERIAL ORDER': [['roof_shed','Roof / Shed'],['invoice_value','Invoice Value',positive]],
 'MATERIAL INTEGRATION': [['inverter_make','Inverter Make'],['inverter_serial_no','Inverter Serial Number']],
 'MATERIAL DELIVERY': [['vendor','Vendor Allotment'],['material_delivery_date','Delivery Date']],
 'INSTALLATION STATUS': [['installation_status','Installation Status must be Installed',yes]],
 'GEO TAG PHOTO': [['geo_tag_status','Geo Tag Status must be Proceed',v=>v==='Proceed']],
 'DISCOM SUBMISSION': [['discom_submission','Submitted By and Date',v=>present(v?.submitted_by) && present(v?.date)]],
 'METER INSTALLATION': [['meter_installation','Meter Installation must be Yes',yes],['installation_date','Installation Date']],
 'DISCOM INSPECTION': [['discom_inspection','Discom Inspection must be Yes',yes]],
 'SUBSIDY STATUS': [['subsidy_tag','Subsidy Tag']],
 'FINAL REVIEW': [['customer_name','Customer Name']],
};
export function missingStageRequirements(stage,data){
 return (stageRequirements[stage] || []).filter(([field,,valid=present])=>!valid(data[field])).map(([,label])=>label);
}
