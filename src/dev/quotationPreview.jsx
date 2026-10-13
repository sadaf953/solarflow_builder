// Development-only fixture. No production API calls or real customer records.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { GlobalPopupProvider } from '../components/GlobalPopup';
import QuotationModule from '../quotations/QuotationModule';
import { supabase } from '../supabase';
import { memoryClient } from '../../tests/quotations/memoryClient.mjs';
import { newForm,payload } from '../quotations/model';
import { brandedTemplate } from '../quotations/branding';
import { quotationRepository } from '../quotations/client';
import { generateQuotationPdf } from '../quotations/pdf';

if (import.meta.env.DEV) {
    const user={id:'11111111-1111-4111-8111-111111111111',name:'Test Agent',phone:'0000000000',userType:new URLSearchParams(location.search).get('role') || 'agent'};
    const id='22222222-2222-4222-8222-222222222222';
    const lead={id:'33333333-3333-4333-8333-333333333333',customer_name:'Existing Test Customer',phone_number:'0000000001',email_address:'test@example.com',full_address:'12 Test Street',villages:'Demo Town',sub_divisions:'Demo Town',district:'Demo District',pincode:'000000',system_capacity_kwp:3.48,module_brand:'SolarFlow',no_of_modules:6,module_wp:580,stage:'LEADS'};
    const form={...newForm(user),customer_name:'Test Customer A',customer_phone:'0000000001',customer_email:'testcustomer@example.com',full_address:'12 Test Society, Demo Town',village:'Demo Town',taluka:'Demo Town',district:'Demo District',pincode:'000000',capacity_kw:3.48,solar_panel_make:'SolarFlow 580',solar_panel_qty:6,panel_wattage:580,inverter_option:'Option 1',inverter_brand:'DemoVolt',geb_geda_charge:'Including',options:['SolarFlow Essential','SolarFlow Plus','SolarFlow Premium'].map((brandName,i)=>({brandName,baseValue:189000+i*8000,discount:0,subsidy:78000}))};
    const row={...payload(form,brandedTemplate()),id,owner_id:user.id,quotation_no:3255,status:'draft',created_at:'2026-09-10T12:00:00Z',updated_at:'seed'};
    const seed=JSON.parse(sessionStorage.getItem('solarflow-demo-v2-fixture') || 'null') || {quotations:[row],admin:[lead],profiles:[{...user,phone_number:user.phone}]};
    const client=memoryClient(seed);
    supabase.from=client.from;
    window.addEventListener('beforeunload',()=>sessionStorage.setItem('solarflow-demo-v2-fixture',JSON.stringify(client.state.tables)));
    window.quotationFixture={client,row,user,repo:quotationRepository,generateQuotationPdf};
    if(!location.hash) location.hash='/quotations';
    createRoot(document.getElementById('root')).render(<GlobalPopupProvider><QuotationModule embedded user={user} meta={{}} onViewLead={selected=>window.alert(`View Lead: ${selected.customer_name}`)} onCreateLead={async(data,files,quote)=>quotationRepository.insertConversionLead(quote,data,user)} /></GlobalPopupProvider>);
} else { document.getElementById('root').textContent='This test fixture is available only in development.'; }
