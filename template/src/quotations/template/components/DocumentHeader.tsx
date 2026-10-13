import React from 'react';
import { SolarFlowLogo } from './CompanyLogos';
import { QuotationData } from '../types';

interface DocumentHeaderProps {
  company: QuotationData['company'];
  assets?: QuotationData['assets'];
  onEditLogo?: () => void;
}

export const DocumentHeader: React.FC<DocumentHeaderProps> = ({ company, assets }) => (
  <div className="q-document-header w-full mb-3 select-none">
    <div className="q-document-header-row">
      <div className="q-document-logo">
        <SolarFlowLogo customLogoUrl={assets?.solarflowLogoUrl || company.logoUrl} className="h-[75px]" />
      </div>

      <div className="q-company-details" role="group" aria-label="Company details">
        <div className="q-company-id text-[14px] text-[#0c3882] tracking-wide leading-tight">
          <span className="font-bold">GST NO :</span>{' '}
          <span className="font-normal text-[#0c3882]">{company.gstNo}</span>
        </div>
        <div className="q-company-id text-[13.5px] text-[#0c3882] mt-1 tracking-wide leading-tight">
          <span className="font-bold">CIN NO :</span>{' '}
          <span className="font-normal text-[#0c3882]">{company.cinNo}</span>
        </div>
        <div className="q-company-id text-[13.5px] text-[#0c3882] mt-1 tracking-wide leading-tight">
          <span className="font-bold">Mail :</span>{' '}
          <span className="font-normal text-[#0c3882]">{company.email}</span>
        </div>
      </div>
    </div>

    <div className="w-full h-[2.5px] bg-[#1e488f] mt-1" />
  </div>
);
