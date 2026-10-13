import React from 'react';
import { QuotationData, AssetImages } from '../../types';
import { DocumentHeader } from '../DocumentHeader';
import { DocumentFooter } from '../DocumentFooter';

interface Page3Props {
  data: QuotationData;
  onOpenAssetSlot?: (slot: keyof AssetImages) => void;
}

export const Page3: React.FC<Page3Props> = ({ data, onOpenAssetSlot }) => {
  const { company, page3, footer, assets } = data;

  return (
    <div className="a4-page bg-white shadow-xl print:shadow-none border border-gray-200 print:border-none mx-auto w-[210mm] min-h-[297mm] max-h-[297mm] p-[8mm_12mm] flex flex-col justify-between text-gray-900 text-xs relative box-border overflow-hidden">
      {/* Top Header & Tables */}
      <div className="w-full">
        <DocumentHeader
          company={company}
          assets={assets}
          onEditLogo={() => onOpenAssetSlot?.('solarflowLogoUrl')}
        />

        {/* Section 1: Terms & Conditions Table */}
        <div className="w-full mt-2 mb-2">
          <table className="quotation-detail-table w-full border-collapse border border-black text-[9px] leading-tight">
            <thead>
              <tr className="bg-white">
                <th colSpan={3} className="border border-black py-0.5 text-center font-bold text-[10.5px] text-[#0c3882]">
                  <span className="quotation-section-label">Terms &amp; Conditions</span>
                </th>
              </tr>
              <tr className="bg-white font-bold text-gray-900">
                <th className="border border-black px-1 py-0.5 text-center w-[5%]">Sr.</th>
                <th className="border border-black px-2 py-0.5 text-left w-[63%]">Parameters</th>
                <th className="border border-black px-2 py-0.5 text-left w-[32%]">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {page3.termsAndConditions.map((item) => (
                <tr key={item.sr}>
                  <td className="border border-black px-1 py-[1.5px] text-center">{item.sr}</td>
                  <td className="border border-black px-2 py-[1.5px] text-gray-900">{item.parameter}</td>
                  <td className="border border-black px-2 py-[1.5px] text-gray-900">{item.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section 2: Warranty Table */}
        <div className="w-full mb-2">
          <table className="quotation-detail-table w-full border-collapse border border-black text-[9px] leading-tight">
            <thead>
              <tr className="bg-white">
                <th colSpan={3} className="border border-black py-0.5 text-center font-bold text-[10.5px] text-[#0c3882]">
                  <span className="quotation-section-label">Warranty</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page3.warranties.map((item) => (
                <tr key={item.sr}>
                  <td className="border border-black px-1 py-[1.5px] text-center w-[5%]">{item.sr}</td>
                  <td className="border border-black px-2 py-[1.5px] text-gray-900 w-[63%]">{item.parameter}</td>
                  <td className="border border-black px-2 py-[1.5px] text-gray-900 w-[32%] whitespace-pre-line">
                    {item.remarks}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section 3: BOM Table */}
        <div className="w-full mb-2">
          <table className="quotation-detail-table quotation-bom-table w-full border-collapse border border-black text-[8.5px] leading-tight">
            <thead>
              <tr className="bg-white">
                <th colSpan={6} className="border border-black py-0.5 text-center font-bold text-[10.5px] text-[#0c3882]">
                  <span className="quotation-section-label">BOM</span>
                </th>
              </tr>
              <tr className="bg-white font-bold text-gray-900">
                <th className="border border-black px-1 py-0.5 text-center w-[4%]">Sr.</th>
                <th className="border border-black px-2 py-0.5 text-left w-[32%]">Description</th>
                <th className="border border-black px-1.5 py-0.5 text-left w-[8%]">Unit</th>
                <th className="border border-black px-1.5 py-0.5 text-left w-[18%]">Qty.</th>
                <th className="border border-black px-1.5 py-0.5 text-left w-[18%]">Size</th>
                <th className="border border-black px-1.5 py-0.5 text-left w-[20%]">Make</th>
              </tr>
            </thead>
            <tbody>
              {page3.bomItems.map((item) => (
                <tr key={item.sr}>
                  <td className="border border-black px-1 py-[1.5px] text-center">{item.sr}</td>
                  <td className="border border-black px-2 py-[1.5px] text-gray-900">{item.description}</td>
                  <td className="border border-black px-1.5 py-[1.5px] text-gray-900">{item.unit}</td>
                  <td className="border border-black px-1.5 py-[1.5px] text-gray-900 text-[8px]">{item.qty}</td>
                  <td className="border border-black px-1.5 py-[1.5px] text-gray-900 text-[8px]">{item.size}</td>
                  <td className="border border-black px-1.5 py-[1.5px] text-gray-900 text-[8px]">{item.make}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section 4: Estimated Other Charges */}
        <div className="w-full mb-2">
          <div className="border border-black">
            <div className="quotation-other-charges-title bg-white text-center font-bold text-[10px] border-b border-black text-[#0c3882]">
              <span className="quotation-section-label">Estimated Other Charges</span>
            </div>
            <div className="flex items-center text-[8.5px] leading-snug">
              <div className="w-[24%] border-r border-black p-1.5 font-bold text-center text-gray-900 flex items-center justify-center self-stretch">
                Account Number
              </div>
              <div className="w-[76%] p-1.5 text-gray-900 text-justify text-[8px] leading-tight">
                {page3.otherChargesText}
              </div>
            </div>
          </div>
        </div>

        {/* Section 5: Company Bank Details */}
        <div className="w-full mb-1">
          <table className="quotation-detail-table w-full border-collapse border border-black text-[9px] leading-tight">
            <thead>
              <tr className="bg-white">
                <th colSpan={2} className="border border-black py-0.5 text-center font-bold text-[10.5px] text-[#0c3882]">
                  <span className="quotation-section-label">Company Bank Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black px-2 py-[1.5px] font-bold text-gray-900 w-[24%]">Account Name</td>
                <td className="border border-black px-2 py-[1.5px] font-bold text-gray-900 w-[76%]">
                  {page3.bankDetails.accountName}
                </td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-[1.5px] font-bold text-gray-900">Account Number</td>
                <td className="border border-black px-2 py-[1.5px] font-bold text-gray-900">
                  {page3.bankDetails.accountNumber}
                </td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-[1.5px] font-bold text-gray-900">Bank Name</td>
                <td className="border border-black px-2 py-[1.5px] text-gray-900">{page3.bankDetails.bankName}</td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-[1.5px] font-bold text-gray-900">Branch Name</td>
                <td className="border border-black px-2 py-[1.5px] text-gray-900">{page3.bankDetails.branchName}</td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-[1.5px] font-bold text-gray-900">IFSC Code</td>
                <td className="border border-black px-2 py-[1.5px] font-bold text-gray-900">{page3.bankDetails.ifscCode}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Footer */}
      <DocumentFooter
        footer={footer}
        assets={assets}
        onEditLogo={() => onOpenAssetSlot?.('demoPartnerLogoUrl')}
      />
    </div>
  );
};
