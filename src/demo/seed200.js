// src/demo/seed200.js
// 200 realistic demo solar customers spanning Last Year (2025) and This Year (2026).
import { PRIMARY_STAGES, SUBSIDY_TAGS, LOAN_TAGS } from '../constants';

const INDIAN_FIRST_NAMES = [
  'Ramesh', 'Suresh', 'Rajesh', 'Amit', 'Priya', 'Nikhil', 'Sanjay', 'Sunita',
  'Dinesh', 'Manoj', 'Vijay', 'Anjali', 'Bhavin', 'Chetan', 'Divya', 'Gautam',
  'Harish', 'Ishwar', 'Jignesh', 'Kalpesh', 'Lalit', 'Mukesh', 'Naresh', 'Paresh',
  'Rohit', 'Sandeep', 'Tarun', 'Umesh', 'Vipul', 'Yogesh', 'Aarav', 'Deepak',
  'Ketan', 'Mahesh', 'Pradeep', 'Sachin', 'Tushar', 'Vinod', 'Ashok', 'Bhavesh'
];

const INDIAN_LAST_NAMES = [
  'Patel', 'Shah', 'Sharma', 'Mehta', 'Verma', 'Gupta', 'Joshi', 'Trivedi',
  'Prajapati', 'Solanki', 'Chauhan', 'Makwana', 'Vaghela', 'Soni', 'Dave', 'Panchal',
  'Rana', 'Bhatt', 'Vyas', 'Parmar', 'Desai', 'Pandey', 'Rawal', 'Kumar', 'Rao'
];

const CITIES = ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh', 'Anand', 'Navsari'];

export function generate200Customers(cpoPersonId = '44444444-4444-4444-8444-000000000003', dealerPersonId = '44444444-4444-4444-8444-000000000005', otherDealerId = '77777777-7777-4777-8777-000000000002', adminPersonId = '44444444-4444-4444-8444-000000000001', stampPersonId = '44444444-4444-4444-8444-000000000008') {
  const customers = [];

  for (let i = 0; i < 200; i++) {
    const isLastYear = i < 100; // First 100 in 2025, next 100 in 2026
    const year = isLastYear ? 2025 : 2026;
    // Spread dates naturally across past months without generating future dates beyond today (Sept 17, 2026)
    let month = 1 + ((i * 7 + 3) % 12);
    let day = 1 + ((i * 11 + 5) % 27);
    if (!isLastYear) {
      // 2026: cap month to 1..9 (Jan to Sep)
      month = 1 + ((i * 5 + 2) % 9);
      if (month === 9) {
        day = 1 + ((i * 7 + 1) % 17); // Max Sept 17
      }
    }
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;
    const isoDate = new Date(`${dateStr}T10:30:00Z`).toISOString();

    const firstName = INDIAN_FIRST_NAMES[i % INDIAN_FIRST_NAMES.length];
    const lastName = INDIAN_LAST_NAMES[Math.floor(i / INDIAN_FIRST_NAMES.length) % INDIAN_LAST_NAMES.length];
    const fullName = `${firstName} ${lastName}`;
    const city = CITIES[i % CITIES.length];

    const stage = PRIMARY_STAGES[i % PRIMARY_STAGES.length].id;
    const isLoan = i % 2 === 1;
    const capacityKwp = Number((3.0 + (i % 8) * 0.55).toFixed(2));
    const modules = Math.round((capacityKwp * 1000) / 580);
    const invoiceVal = 145000 + (modules * 12000);

    const vendor = `Vendor ${1 + (i % 3)}`;

    // Realistic delivery, installation, and commission calculations
    const regDateObj = new Date(dateStr);
    const delivDateObj = new Date(regDateObj);
    delivDateObj.setDate(delivDateObj.getDate() + 7 + (i % 5));
    const materialDeliveryDate = delivDateObj.toISOString().split('T')[0];

    const instDateObj = new Date(delivDateObj);
    instDateObj.setDate(instDateObj.getDate() + 5 + (i % 4));
    const installationDate = instDateObj.toISOString().split('T')[0];

    const isInstalled = ['INSTALLATION STATUS', 'GEO TAG PHOTO', 'DISCOM SUBMISSION', 'METER INSTALLATION', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW', 'COMPLETED'].includes(stage);
    const vendorQuote = Math.round(capacityKwp * 2200);
    const isPaid = isInstalled && (isLastYear ? (i % 3 !== 0) : (i % 4 === 0));
    const vendorPaidDate = isPaid ? installationDate : null;

    customers.push({
      id: `22222222-2222-4222-8222-${String(i + 1).padStart(12, '0')}`,
      demo_seed_key: `solarflow-200-v1-${i + 1}`,
      customer_name: fullName,
      phone_number: `98${String(10000000 + (i * 137)).slice(0, 8)}`,
      email_address: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i + 1}@example.invalid`,
      villages: `${city} Rural Area`,
      sub_divisions: `${city} East Sub-Division`,
      district: city,
      pincode: `38${String(2000 + (i * 19)).slice(0, 4)}`,
      consumer_no: `CONS-${year}-${String(1000 + i)}`,
      folder_no: `FL-${year}-${String(100 + i)}`,
      stage,
      registration_date: dateStr,
      registration_no: `REG-${year}-${String(5000 + i)}`,
      registration_by: i % 2 === 0 ? 'Ahmedabad Central Office' : 'Surat Operations Hub',
      channel_partner: i < 70 ? 'Surya Shakti Solar' : i < 140 ? 'Pawan Green Energy' : 'Gujarat Suntech',
      sub_channel_partner: i % 3 === 0 ? 'City Solar Dealer' : i % 3 === 1 ? 'Apex Energy Partner' : null,
      lead_creator_profile_id: i < 40 ? cpoPersonId : i < 80 ? dealerPersonId : i < 140 ? otherDealerId : adminPersonId,
      vendor,
      installation_status: isInstalled ? 'Installed' : 'Pending',
      material_delivery_date: isInstalled || stage === 'MATERIAL DELIVERY' ? materialDeliveryDate : null,
      installation_date: isInstalled ? installationDate : null,
      vendor_quote: isInstalled ? String(vendorQuote) : null,
      vendor_payment_status: isPaid ? 'Paid' : 'Pending',
      vendor_paid_date: vendorPaidDate,
      payment_type: isLoan ? 'Loan' : 'Cash',
      subsidy_tag: SUBSIDY_TAGS[i % SUBSIDY_TAGS.length].id,
      loan_tag: isLoan ? LOAN_TAGS[Math.floor(i / 2) % LOAN_TAGS.length].id : null,
      system_capacity_kwp: capacityKwp,
      no_of_modules: modules,
      module_brand: i % 2 === 0 ? 'ADANI' : 'WAAREE',
      module_wp: '580',
      inverter_make: i % 2 === 0 ? 'Goodwe' : 'Solax',
      inverter_serial_no: `INV-${year}-${String(8000 + i)}`,
      roof_shed: i % 4 === 0 ? 'SHED' : 'ROOF',
      invoice_value: String(invoiceVal),
      google_drive_link: i % 3 !== 2 ? `https://drive.google.com/drive/folders/solarflow-demo-${i + 1}` : '',
      location_link: i % 2 === 0 ? `https://maps.google.com/?q=${23.0225 + (i * 0.005)},${72.5714 + (i * 0.005)}` : '',
      deleted_at: null,
      created_at: isoDate,
      follow_ups: [
        { date: dateStr, remark: 'Initial project consultation and feasibility review' }
      ],
      discom_submission: [9, 25, 41, 14, 65, 89, 120, 155].includes(i) ? {
        sent_to_stamp_maker: true,
        assigned_stamp_maker: 'Stamp Guy',
        assigned_stamp_maker_id: stampPersonId,
        stamp_sent: [14, 65, 120].includes(i),
        stamp_completed_at: [14, 65, 120].includes(i) ? isoDate : null,
        stamp_completed_by: [14, 65, 120].includes(i) ? 'Stamp Guy' : null,
        first_party: fullName,
        second_party: 'SolarFlow Energy',
        stamp_value: '300',
        stamp_description: 'Rooftop solar system installation agreement.'
      } : {}
    });
  }

  return customers;
}
