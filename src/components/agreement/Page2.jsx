import React from 'react';

export const Page2 = ({ data, fontSizeClass = 'text-[17px]' }) => {
  return (
    <div className={`doc-page font-sans leading-relaxed text-slate-900 bg-white shadow-md print:shadow-none mx-auto relative ${fontSizeClass}`}>
      
      {/* First Party Undertakings (Numbered 1-6) */}
      <div className="space-y-4 mb-6 text-justify font-normal">
        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[22px]">1.</span>
          <div className="flex-1">
            Submission of online application at National Portal for installation of RTS project/system, Submission of application for net-metering and system inspection and upload of the relevant documents on the National Portal of the scheme
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[22px]">2.</span>
          <div className="flex-1">
            Provide secure storage of the material of the RTS plant delivered at the premises till handover of the system.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[22px]">3.</span>
          <div className="flex-1">
            Provide access to the Roof Top during installation of the plant, operation & maintenance, testing of the plant and equipment and for meter reading from solar meter, inverter etc.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[22px]">4.</span>
          <div className="flex-1">
            Provide electricity during plant installation and water for cleaning of the panels.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[22px]">5.</span>
          <div className="flex-1">
            Report any malfunctioning of the plant to the Vendor during the warranty period.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[22px]">6.</span>
          <div className="flex-1">
            Pay the amount as per the payment schedule as mutually agreed with the vendor, including any additional amount to the second party for any additional work /customization required depending upon the building condition
          </div>
        </div>
      </div>

      {/* Second Party Undertakings Header */}
      <div className="mb-4 pt-2">
        <p className="font-bold underline text-justify">
          The Second Party hereby undertakes to perform the following activities:
        </p>
      </div>

      {/* Second Party Undertakings (1-3) */}
      <div className="space-y-5 text-justify font-normal">
        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[22px]">1.</span>
          <div className="flex-1">
            The Vendor must follow all the standards and safety guidelines prescribed under state regulations and technical standards prescribed by MNRE for RTS projects, failing which the vendor is liable for blacklisting from participation in the govt. project/ scheme and other penal actions in accordance with the law. The responsibility of supply, installation and commissioning of the rooftop solar project/system in complete compliance with MNRE scheme guidelines lies with the Vendor.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[22px]">2.</span>
          <div className="flex-1">
            <span className="font-semibold">Site Survey:</span> Site visit, survey and development of detailed project report for installation of RTS system. This also includes, feasibility study of roof, strength of roof and shadow free area. If any additional work or customization is involved for the plant installation as per site condition and requirement of the consumer building, the Vendor shall prepare an estimate and can raise separate invoice including GST in addition to the amount towards standard plant cost. The consumer shall pay the amount for such additional work directly to the Vendor.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[22px]">3.</span>
          <div className="flex-1">
            <span className="font-semibold">Design & Engineering:</span> Design of plant along with drawings and selection of components as per standard provided by the DISCOM/SERC/MNRE for best performance and safety of the plant.
          </div>
        </div>
      </div>

      {/* Page Footer */}
      <div className="absolute bottom-5 left-10 right-10 flex items-end justify-between pt-2 text-[10px] text-black font-sans">
        <div className="flex-1 text-center pr-4">
          <div>Guidelines for PM-Surya Ghar: Muft Bijli Yojana</div>
          <div>Central Financial Assistance to Residential Consumers</div>
        </div>
        <span className="font-normal text-xs text-black flex-shrink-0">23</span>
      </div>
    </div>
  );
};
