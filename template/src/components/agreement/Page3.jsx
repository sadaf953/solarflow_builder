import React from 'react';

export const Page3 = ({ data, fontSizeClass = 'text-[17px]' }) => {
  return (
    <div className={`doc-page font-sans leading-relaxed text-slate-900 bg-white shadow-md print:shadow-none mx-auto relative ${fontSizeClass}`}>
      
      {/* Second Party Undertakings (4-12) */}
      <div className="space-y-4 text-justify font-normal">
        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">4.</span>
          <div className="flex-1">
            <span className="font-semibold">Module and Inverter:</span> The solar modules, including the solar cells, should be manufactured in India. Both the solar modules and inverters shall conform to the relevant standards and specifications prescribed by MNRE. Any other requirement, viz. star labelling (solar modules), quality control orders and standards & labelling (inverters) etc., shall also be complied.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">5.</span>
          <div className="flex-1">
            <span className="font-semibold">Procurement & Supply:</span> Procurement of complete system as per BIS/IS/IEC standard (whatever applicable) & safety guidelines for installation of rooftop solar plants. The supplied materials should comply with all MNRE standards for release of subsidy.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">6.</span>
          <div className="flex-1">
            <span className="font-semibold">Installation & Civil work:</span> Complete civil work, structure work and electrical work (including drawings) following all the safety and relevant BIS standards.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">7.</span>
          <div className="flex-1">
            <span className="font-semibold">Documentation (Technical Catalogues/Warranty Certificates/BIS certificates/other test reports etc):</span> All such documents shall be provided to the consumer for online uploading and submission of technical specifications, IEC/BIS report, Sr. Nos, Warranty card of Solar Panel & Inverter, Layout & Electrical SLD, Structure Design and Drawing, Cable and other detailed documents.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">8.</span>
          <div className="flex-1">
            <span className="font-semibold">Project completion report (PCR):</span> Assisting the consumer in filling and uploading of signed documents (Consumer & Vendor) on the national portal.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">9.</span>
          <div className="flex-1">
            <span className="font-semibold">Warranty:</span> System warranty certificates should be provided to the consumer. The complete system should be warranted for 5 years from the date of commissioning by DISCOM. Individual component warranty documents provided by the manufacturer shall be provided to the consumer and all possible assistance should be extended to the consumer for claiming the warranty from the manufacturer.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">10.</span>
          <div className="flex-1">
            <span className="font-semibold">NET meter & Grid Connectivity:</span> Net meter supply/procurement, testing and approvals shall be in the scope of vendor. Grid connection of the plant shall be in the scope of the vendor.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">11.</span>
          <div className="flex-1">
            <span className="font-semibold">Testing and Commissioning:</span> The vendor shall be present at the time of testing and commissioning by the DISCOM.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">12.</span>
          <div className="flex-1">
            <span className="font-semibold">Operation & Maintenance:</span> Five (5) years Comprehensive Operation and Maintenance including overhauling, wear and tear and regular checking of healthiness of system at proper interval shall be in the scope of vendor. The vendor shall also educate the consumer on best practices for cleaning of the modules and system maintenance.
          </div>
        </div>
      </div>

      {/* Page Footer */}
      <div className="absolute bottom-5 left-10 right-10 flex items-end justify-between pt-2 text-[10px] text-black font-sans">
        <div className="flex-1 text-center pr-4">
          <div>Guidelines for PM-Surya Ghar: Muft Bijli Yojana</div>
          <div>Central Financial Assistance to Residential Consumers</div>
        </div>
        <span className="font-normal text-xs text-black flex-shrink-0">24</span>
      </div>
    </div>
  );
};
