import React from 'react';
import { CompanyLogo } from './CompanyLogos';
import { QuotationData } from '../types';

interface DocumentHeaderProps {
  company: QuotationData['company'];
  assets?: QuotationData['assets'];
  onEditLogo?: () => void;
}

export const DocumentHeader: React.FC<DocumentHeaderProps> = ({ company, assets }) => {
  const details = [
    ['GSTIN', company.gstNo],
    ['CIN NO', company.cinNo],
    ['Phone', company.phone],
    ['Mail', company.email],
  ].filter(([, value]) => value);
  return (
    <div className="q-document-header w-full mb-3 select-none">
      <div className="q-document-header-row">
        <div className="q-document-logo">
          <CompanyLogo url={assets?.logoUrl || company.logoUrl} name={company.name} className="h-[75px]" />
        </div>

        {details.length > 0 && (
          <div className="q-company-details" role="group" aria-label="Company details">
            {details.map(([label, value], i) => (
              <div key={label} className={`q-company-id text-[13.5px] text-[#0c3882] tracking-wide leading-tight${i ? ' mt-1' : ''}`}>
                <span className="font-bold">{label} :</span>{' '}
                <span className="font-normal text-[#0c3882]">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="w-full h-[2.5px] bg-[#1e488f] mt-1" />
    </div>
  );
};
