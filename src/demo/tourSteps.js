const step=(title,body,role,view,extra={})=>({title,body,role,view,...extra});
const admin=(title,body,view,extra)=>step(title,body,'admin',view,extra);
const customer=(title,body,stage)=>admin(title,body,'stages',{stage,action:'customer'});
export const workflowTour = [
 admin('The complete customer journey','This tour opens example records across every stage of the solar journey. Use the minus button to hide the guide while editing; resume it when ready. Save your edits before Next. Examples come from different customers already at each stage; Next only navigates and never submits work or records a payment.','dashboard'),
 admin('1. Adding a customer (Way 1: Via Quotation Maker)','There are two ways to add a customer into SolarFlow: (1) Via Quotation Maker, and (2) Direct Lead Entry. Way 1 starts here: Create Quotation lets you draft custom proposals with capacity sizing, pricing, logos, and banners. Preview or download the PDF to send to the client.','quotations'),
 admin('2. Convert quotation to an active lead','When the customer approves the proposal, choose Convert to Lead. This automatically creates the linked customer record in Admin → Leads with their contact and capacity details already filled in — no re-typing needed! If not proceeding, choose Mark Lost with a reason. Converted and lost quotes both stay in your ledger.','quotations'),
 admin('3. Adding a customer (Way 2: Direct lead entry)','Way 2 is direct entry without creating a quote first. Click the "+ Add Lead" button in the top-right header anytime. Only customer name and a valid 10-digit phone number are required to create the record immediately; all other details, documents, and photos can be added now or later. Close this form if you are only browsing.','stages',{stage:'LEADS',action:'addLead'}),
 admin('4. Dealer or partner adds the lead directly','Channel Partners and Dealers also enter leads directly from their dedicated portals using the same simple form. Admin sees all leads across every partner, while parent offices see only their own and their linked dealers. Ownership stays tied to the creator.','stages',{stage:'LEADS'}),
 customer('5. Open the customer record','Open a customer tab to enter contact, system and payment details. Choose Loan or Cash to set the finance route. Edit and save the section, then Save & Move advances the project. The notice above the form lists the one or two essentials for its current stage.','LEADS'),
 customer('6. Register the project','Enter Registration Date and choose Payment Type (Loan or Cash). Registration By, feasibility number, acknowledgment, subsidy token and photos can be added later. Save & Move continues to the customer’s Loan or Cash route.','REGISTRATION'),
 customer('7. Loan application','For a financed project, enter the Jansamarth Application Number. Add bank and branch details when available. Supporting feasibility files are optional for demo progression. The project stage and the Loan Tag track different parts of the same customer.','LOAN'),
 admin('8. Pull up Loan Tags: Inprocess','Loan Tags follows the finance record across project stages. This filter shows Inprocess applications. Open a customer to review the loan details, change the tag and save its dated history.','loan_tags',{tag:'Inprocess'}),
 admin('9. Loan sanction and exceptions','Sanctioned means the bank has approved the loan. Returned records need correction; Reject records record a declined application. These tags stay attached to the customer as materials and installation move forward.','loan_tags',{tag:'Sanctioned'}),
 customer('10. The cash alternative','Cash customers use the Cash stage instead of Loan. Record payment amounts, dates and method as they become available. Save & Move continues to Material Order.','CASH'),
 customer('11. Agent fills the material order','In Material Order, Roof / Shed and Invoice Value are the two essentials. Agents enter actual cable lengths and structure dimensions in their portal, or Admin completes it here before sending the order to Material Integration.','MATERIAL ORDER'),
 customer('12. Prepare the customer BOM','Admin opens Material Integration. Check the active Roof or Shed BOM against the order, edit item quantities, and save it. Enter inverter make and serial number before advancing. The BOM defines the stock needed for this customer.','MATERIAL INTEGRATION'),
 customer('13. Print and export customer BOM','Preview and print the official two-page Material Integration & Equipment Loading Checklist. Page 1 summarizes customer and inverter specifications; Page 2 formats the full equipment quantities and clean verification checklist ready for warehouse dispatch or PDF export.','MATERIAL INTEGRATION',{action:'printBom'}),
 admin('14. Inventory: stock on hand','Inventory lists materials and sample opening quantities. Select a material to add received quantity or record an issue with a note.','inventory',{tab:'stock'}),
 admin('15. Review individual customer BOM','Each customer’s BOM is reviewed and configured individually in their Material Integration tab. Inventory shows all available warehouse quantities ready to be allocated when delivery trips are prepared.','inventory',{tab:'stock'}),
 admin('16. Open Delivery Batches','Create a trip and choose the driver and vehicle. In Select Projects to Club on this Truck, add several eligible customers. Selected rows remain visible; a project assigned to another trip is labelled so you can manage its existing assignment.','delivery_batches'),
 customer('17. Assign the installation vendor','In the customer’s Delivery tab, choose Vendor 1, 2 or 3 and a Delivery Date. Save the assignment. The chosen vendor sees that customer in its own portal; a trip can contain several customers with their own vendor assignments.','MATERIAL DELIVERY'),
 admin('18. Dispatch and mark the trip delivered','Open a batch to review all customers, driver, vehicle and rent. Mark Delivered only when the materials reach site. Each customer’s saved BOM quantity is deducted once. Missing quantities or insufficient stock block delivery and show what to fix.','delivery_batches'),
 admin('19. Verify outgoing stock','Movements records receipts and issues. Delivery creates customer-linked stock issues automatically. Creating a BOM alone does not reduce stock, and marking an already-issued customer delivered again does not deduct twice.','inventory',{tab:'movements'}),
 admin('20. Daily godown report','Choose a day to review opening stock, incoming quantity, outgoing quantity and closing stock for every material. Use this to reconcile the godown after trips and incoming supplies.','inventory',{tab:'daily'}),
 customer('21. Vendor receives assigned work','When a vendor logs into their portal, they see this customer under their assigned Delivery tab with dispatch details. Jobs assigned to other vendors belong to their respective accounts.','MATERIAL DELIVERY'),
 customer('22. Vendor completes installation','The assigned vendor completes physical installation on site and updates Installation Status to Installed / Yes with the installation date. Save & Move sends the project to Geo Tag Photo.','INSTALLATION STATUS'),
 customer('23. Vendor completes the geo stage','The vendor reviews the site and sets Geo Tag Status to Proceed, then Save & Move to Discom Submission. Photos can be uploaded with 1 click; missing photos do not block this demo stage.','GEO TAG PHOTO'),
 admin('24. Vendor work and installation payment','A vendor assignment links the job; an installed status makes it eligible here. Review capacity, rate and amount, then record the vendor’s payment details and mark payment status only after the payment is actually recorded. This demo does not transfer money.','installation_payments'),
 admin('25. First loan payment','Return to Loan Tags → 1st Payment. Open the customer, record the bank’s first release and save the tag/history. These records remain available even though the installation stage has moved forward.','loan_tags',{tag:'1st Payment'}),
 customer('26. Discom sends work to Stamp Maker','In Discom Submission, enter Submitted By and Date, choose the linked Stamp Maker, stamp value and description, then use the send action. The assignment routes this customer’s document work to that maker’s queue. Optional photos do not block stage progression.','DISCOM SUBMISSION'),
 customer('27. Stamp Maker uploads and returns the file','The assigned Stamp Maker receives this customer card in their Stamp Maker portal, uploads the completed stamp agreement, and marks it Complete. The completed file is instantly attached back to this customer.','DISCOM SUBMISSION'),
 customer('28. Stamp Maker completed record','Completed stamp agreements appear in the Stamp Maker’s Record ledger with dates and monthly totals, providing full reconciliation between Admin and document makers.','DISCOM SUBMISSION'),
 customer('29. Returned stamp file in Discom','Back in Admin → Discom Submission, open the customer that was sent to the maker. The returned stamp file and status appear in the same customer record. Review or download the file; use Send Back with a remark if it needs correction.','DISCOM SUBMISSION'),
 customer('30. Meter installation','Set Meter Installation to Yes and enter Installation Date. Meter photos and other attachments are optional. Save & Move continues to Discom Inspection.','METER INSTALLATION'),
 customer('31. Discom inspection','Set Discom Inspection to Yes after the inspection is complete. Save the status and advance to Subsidy Status. Add inspection notes or supporting documents when available.','DISCOM INSPECTION'),
 admin('32. Pull up Subsidy Tags','Subsidy Tags follows the customer’s subsidy independently of its project stage. Start with Inprocess and open a customer to save a tag change with its dated history.','subsidy',{tag:'Inprocess'}),
 admin('33. Redeemed and returned subsidy','Redeemed applications remain visible here. Use Returned when corrections are needed, record the reason, then update the status when the corrected application progresses.','subsidy',{tag:'Redeemed'}),
 admin('34. Approved subsidy','Approved shows applications awaiting receipt. Check the customer’s history and amount details before recording the final subsidy receipt.','subsidy',{tag:'Approved'}),
 admin('35. Subsidy received','Received is the final subsidy tag. Review the payment evidence and dated history before saving it; final tags lock the record. The customer and its earlier history remain available.','subsidy',{tag:'Received'}),
 admin('36. Second loan payment','Pull up Loan Tags → 2nd Payment. Record the second bank release and the corresponding history on the customer. Project progress does not automatically mean the money has been received.','loan_tags',{tag:'2nd Payment'}),
 admin('37. Total loan payment received','Once all bank payments are reconciled, select Total Loan Payment Received. It is the final loan tag, so check the amounts and history before saving.','loan_tags',{tag:'Total Loan Payment Received'}),
 customer('38. Final review','Review customer details, installation, vendor payments, loan and subsidy history, and any files supplied. Save remaining corrections and move to Completed when the work is finished.','FINAL REVIEW'),
 admin('39. Completed customer records','Completed projects stay in the CRM with their customer details, documents and history. Dashboard totals reflect the final project stage.','stages',{stage:'COMPLETED'}),
 customer('40. Paused projects belong in Lost Project','Use Pause / Move to Lost Project from an active customer. Its origin stage is saved. Add a reason or follow-up date here; Resume returns it to that origin stage. Lost Project also has its own dashboard count.','LOST PROJECT'),
 admin('41. Review the audit trail','Activity Log records saved changes and stage moves. Use the customer history and this log to check which role completed each handoff. You can replay the tour or continue working from any portal.','activity'),
 admin('42. Operations: Drivers, Vendors & Directories','In Operations (Channel Partner Management), Admin can register installation vendors, drivers with vehicle numbers, branch offices, and technical staff. These directories automatically populate project delivery batches and vendor assignments across the CRM.','channel_partner_mgmt'),
 admin('43. Adding and managing users','User Management lets Admin add team members, assign any of the 8 roles, map users to branch channel partners, and manage authentication. Click "+ Create User" to onboard staff, set passwords directly, or dispatch password recovery links via email.','users',{action:'createUser'}),
];

// Chapter starts refer to the complete workflow, including its opening step.
export const workflowChapters = [
 {title:'Sales & customer setup', start:0},
 {title:'Registration & finance', start:6},
 {title:'Materials & delivery', start:11},
 {title:'Installation & vendor payments', start:21},
 {title:'Electricity approvals & documents', start:26},
 {title:'Subsidy & final payments', start:32},
 {title:'Completion & team management', start:38},
];

export function tourSteps(role){
 if(['channel_partner_office','office2'].includes(role)) return [
  step('Your office and linked dealers','Only leads created by this CPO and its linked dealers are visible. Other offices and unrelated dealers stay outside this view.',role,'dashboard'),
  step('Two ways to add a customer','Customers enter your pipeline in two ways: (1) via Quotation Maker and converted to a lead upon approval, or (2) entered directly via "+ Add Lead" with customer name and 10-digit phone number.',role,'stages',{stage:'LEADS'}),
  step('Customer stages','Open your own or linked-dealer customer to review details and move through the project stages. Each stage needs only one or two essential fields; photos are optional.',role,'stages',{stage:'LEADS',action:'customer'}),
  step('Add team members and dealers','Create sub-user accounts for your branch managers and field dealers. Assign their roles and manage credentials securely.',role,'users',{action:'createUser'}),
  step('Print and export customer BOM','Preview and print the official two-page Material Integration & Equipment Loading Checklist with customer and equipment specifications.',role,'stages',{stage:'MATERIAL INTEGRATION',action:'printBom'}),
  step('Loan tracking','Follow your customers’ loan applications and releases through Loan Tags, including first and second payment.',role,'loan_tags'),
  step('Subsidy tracking','Follow your own network’s subsidy progress and customer history here.',role,'subsidy'),
  step('Paused projects','Paused projects are kept in Lost Project with their origin stage so they can resume later.',role,'stages',{stage:'LOST PROJECT'})
 ];

 if(['agent','agent2'].includes(role)) return [
  step('Channel Partner & Dealer Portal','Welcome to your dedicated partner portal. Manage quotations, leads, and orders without seeing unrelated partner data.',role,'menu'),
  step('1. Adding a customer (Way 1: Via Quotation Maker)','Generate customized quotations with capacity sizing, custom logos, pricing breakdown, and instant PDF download. Once approved by the customer, convert the quote directly into an active lead.',role,'quotations'),
  step('2. Adding a customer (Way 2: Direct lead entry)','Capture leads directly with just a customer name and 10-digit phone number using the "+ Add Lead" button. Ownership stays permanently tied to your account.',role,'workdesk',{stage:'LEADS',action:'addLead'}),
  step('3. Customer workdesk','Open assigned customers to update registration info, customer documents, and stage notes.',role,'workdesk',{stage:'LEADS',action:'customer'}),
  step('4. Material ordering','Specify roof or shed structure type, structure dimensions, and cable lengths to trigger godown preparation.',role,'workdesk',{stage:'MATERIAL ORDER',action:'customer'}),
  step('5. Print and export customer BOM','Preview and print the official two-page Material Integration & Equipment Loading Checklist with customer and equipment specifications.',role,'workdesk',{stage:'MATERIAL INTEGRATION',action:'printBom'})
 ];

 if(role === 'vendor') return [
  step('Vendor Installation Portal','Welcome to the Vendor portal. Only solar projects assigned to your vendor account appear here.',role,'DELIVERY'),
  step('1. Assigned deliveries','Review incoming dispatch schedules, driver contacts, and site customer details ready for installation.',role,'DELIVERY'),
  step('2. Mark physical installation','Update installation dates and set Installation Status to Installed / Yes once field work is completed.',role,'INSTALLATION',{action:'customer'}),
  step('3. Geo-tag photo verification','Submit site coordinates and geo-tag photos to verify completion for DISCOM submission.',role,'GEO',{action:'customer'})
 ];

 if(role === 'stamp') return [
  step('Stamp Maker Portal','Welcome to the Stamp Maker portal. Review agreement requests dispatched directly from DISCOM Submission.',role,'queue'),
  step('1. Document queue','Review customer details, stamp duty amounts, and agreement parties requiring preparation.',role,'queue'),
  step('2. Upload executed stamp agreement','Upload the notarized/executed stamp file and mark the card Complete to route it back to the Admin Discom team.',role,'queue'),
  step('3. Completed records ledger','Track completed agreements, monthly volumes, and billing reconciliation records.',role,'record')
 ];

 return workflowTour;
}

// A short, read-only introduction. Each stage opens an existing example;
// moving between examples never advances or saves a customer record.
export const quickTour = [
 admin('Your business at a glance', 'See active projects, completed installations and your project pipeline. This six-step tour opens sample records; Next only navigates.', 'dashboard'),
 admin('Turn an enquiry into a quotation', 'Choose Preview on a sample quotation to see the proposal your customer receives. Close the preview before continuing.', 'quotations'),
 customer('Meet a sample customer', 'Review the customer details and current stage. This is where your team keeps the project together. No edits are needed for this tour.', 'LEADS'),
 customer('Plan the materials', 'Review this example’s roof or shed details and material requirements. Your team prepares the order here before arranging delivery.', 'MATERIAL ORDER'),
 customer('Follow installation progress', 'This example is at the installation stage. Review the assigned work and installation details without changing its status.', 'INSTALLATION STATUS'),
 customer('Track the final subsidy step', 'This example is at the subsidy stage. Review its progress, then finish the tour to explore freely. The full walkthrough is available from the tour menu.', 'SUBSIDY STATUS'),
];
