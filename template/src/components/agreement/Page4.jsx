import React from 'react';

export const Page4 = ({ data, fontSizeClass = 'text-[17px]' }) => {
  const getHighlightStyle = () => ({
    backgroundColor: data.showHighlights ? data.highlightColor : 'transparent',
    paddingLeft: '2px',
    paddingRight: '2px',
    borderRadius: '2px',
  });

  return (
    <div className={`doc-page font-sans leading-relaxed text-slate-900 bg-white shadow-md print:shadow-none mx-auto relative ${fontSizeClass}`}>
      
      {/* Second Party Undertakings (13-18) */}
      <div className="space-y-3.5 text-justify mb-4 font-normal">
        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">13.</span>
          <div className="flex-1">
            <span className="font-semibold">Insurance:</span> Any insurance cost pertaining to material transfer/storage before commissioning of the system shall be in the scope of the vendor.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">14.</span>
          <div className="flex-1">
            <span className="font-semibold">Applicable Standard:</span> The system must meet the technical standards and specifications notified by MNRE. The vendor is solely responsible to supply component and service which meets the technical standards and specification prescribed by MNRE and State DISCOMs.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">15.</span>
          <div className="flex-1">
            <span className="font-semibold">Project/system cost & payment terms:</span> The cost of the plant and payment schedule should be mutually discussed and decided between the vendor and consumer. The consumer may opt for milestone-based payment to the vendor and the same shall be included in the agreement.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">16.</span>
          <div className="flex-1">
            <span className="font-semibold">Dispute:</span> In-case of any dispute between consumer and vendor (in supply/installation/maintenance of system or payment terms), both parties must settle the same mutually or as per law. MNRE/DISCOM shall not be liable for, and would not be a party to any dispute arising between vendor and consumer.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">17.</span>
          <div className="flex-1">
            <span className="font-semibold">Subsidy / Project Related Documents:</span> Vendor must provide all the documents to consumer and help in uploading the same to National Portal for smooth release of subsidy.
          </div>
        </div>

        <div className="flex gap-2.5 items-start">
          <span className="font-normal flex-shrink-0 min-w-[24px]">18.</span>
          <div className="flex-1">
            <span className="font-semibold">Performance of Plant:</span> The Performance Ratio (PR) of Plant must be 75% at the time of commissioning of the project by DISCOM or its authorised agency. Vendor must provide (returnable basis) radiation sensor with valid calibration certificate of any NABL / International laboratory at the time of commissioning / testing of the plant. Vendor must maintain the PR of the plant till warranty of project i.e. 5 years from the date of commissioning.
          </div>
        </div>

        <div className="flex gap-2.5 items-start pt-1">
          <span className="font-normal flex-shrink-0 min-w-[24px]">19.</span>
          <div className="flex-1">
            <span className="font-normal">{data.paymentTerms || 'Mutually Agreed Terms of Payment …'}</span>
          </div>
        </div>
      </div>

      {/* Execution Signatures Table / Columns */}
      <div className="mt-4 pt-2">
        <div className="grid grid-cols-2 gap-8 text-xs font-normal">
          
          {/* First Party (Consumer) Column */}
          <div className="space-y-3">
            <div className="font-bold text-center text-sm border-b pb-1 mb-2">First Party</div>
            
            <div>
              <span className="font-semibold">Name: </span>
              <span className="font-normal" style={getHighlightStyle()}>
                {data.consumerName || 'DEMO CUSTOMER ONE'}
              </span>
            </div>

            <div>
              <span className="font-semibold">Address </span>
              <span>Vill: </span>
              <span className="font-normal" style={getHighlightStyle()}>{data.village || 'DEMO TOWN'}</span>
              <span> Tal: </span>
              <span className="font-normal" style={getHighlightStyle()}>{data.taluka || 'DEMO TOWN'}</span>
              <span> Dist: </span>
              <span className="font-normal" style={getHighlightStyle()}>{data.district || ''}</span>
            </div>

            {/* Signature Box */}
            <div className="pt-2">
              <span className="font-semibold block mb-1">SIGN:</span>
              {data.firstPartySignature || data.signatureUrl ? (
                <div className="w-full min-h-[85px] h-[85px] flex items-center justify-start">
                  <img 
                    src={data.firstPartySignature || data.signatureUrl} 
                    alt="Consumer Signature" 
                    className="max-h-[78px] max-w-[200px] object-contain" 
                  />
                </div>
              ) : (
                <div 
                  className="w-full min-h-[85px]"
                  style={{ backgroundColor: data.showHighlights ? (data.highlightColor || '#fef08a') : 'transparent' }}
                />
              )}
            </div>

            <div className="pt-2">
              <span className="font-semibold">Date-</span>
              <span className="font-normal" style={getHighlightStyle()}>
                {data.executionDate || '23-06-2026'}
              </span>
            </div>
          </div>

          {/* Second Party (Vendor) Column */}
          <div className="space-y-3">
            <div className="font-bold text-center text-sm border-b pb-1 mb-2">Second Party</div>

            <div>
              <span className="font-semibold">Name - </span>
              <span className="font-normal">{data.vendorName || 'SolarFlow Demo Energy'}</span>
            </div>

            <div>
              <span className="font-semibold">Address- </span>
              <span className="font-normal">{data.vendorAddress || '100 Demo Avenue, Sample City (fictional)'}</span>
            </div>

            {/* Vendor Stamp & Signature Box - Enlarged by 30% and shifted center-right */}
            <div className="pt-2">
              <span className="font-semibold block mb-1">Stamp & Sign:</span>
              {data.secondPartyStamp || data.stampUrl ? (
                <div className="w-full min-h-[85px] h-[85px] flex items-center justify-start pl-2 gap-2" style={{ marginTop: '20px' }}>
                  <img 
                    src={data.secondPartyStamp || data.stampUrl} 
                    alt="Vendor Stamp" 
                    className="object-contain" 
                    style={{ maxHeight: '134px', maxWidth: '390px' }}
                  />
                  {(data.secondPartySignature || data.vendorSignatureUrl) && (
                    <img 
                      src={data.secondPartySignature || data.vendorSignatureUrl} 
                      alt="Vendor Sign" 
                      className="max-h-[75px] max-w-[140px] object-contain" 
                    />
                  )}
                </div>
              ) : (
                <div className="w-full min-h-[85px]" />
              )}
            </div>

            <div className="pt-2 text-right">
              <span className="font-semibold">Date:</span>
              <span className="font-normal" style={getHighlightStyle()}>
                {data.executionDate || '23-06-2026'}
              </span>
            </div>

          </div>

        </div>
      </div>

      {/* Page Footer */}
      <div className="absolute bottom-5 left-10 right-10 flex items-end justify-between pt-2 text-[10px] text-black font-sans">
        <div className="flex-1 text-center pr-4">
          <div>Guidelines for PM-Surya Ghar: Muft Bijli Yojana</div>
          <div>Central Financial Assistance to Residential Consumers</div>
        </div>
        <span className="font-normal text-xs text-black flex-shrink-0">25</span>
      </div>
    </div>
  );
};
