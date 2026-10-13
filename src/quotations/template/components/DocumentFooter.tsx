import React from 'react';
import { DemoPartnerLogo } from './CompanyLogos';
import { QuotationData } from '../types';

interface DocumentFooterProps {
  footer: QuotationData['footer'];
  assets?: QuotationData['assets'];
  onEditLogo?: () => void;
}

export const DocumentFooter: React.FC<DocumentFooterProps> = ({ footer, assets, onEditLogo }) => {
  const footerOrange = '#F89520';
  const corporateParts = footer.corporateOffice.split(',').map((part) => part.trim()).filter(Boolean);
  const hasBalancedCorporateLines = corporateParts.length >= 3;
  const corporateLine1 = hasBalancedCorporateLines
    ? corporateParts.slice(0, -2).join(', ')
    : footer.corporateOffice;
  const corporateLine2 = hasBalancedCorporateLines
    ? corporateParts.slice(-2).join(', ')
    : '';

  return (
    <div className="w-full mt-auto pt-3 select-none">
      <div className="flex items-end justify-between gap-2">
        {/* Left: Authorized Partner */}
        <div className="ml-5 flex w-[252px] shrink-0 flex-col items-start">
          <span className="mb-1 whitespace-nowrap text-[11.5px] font-extrabold font-sans text-[#0c3882] tracking-tight">
            Fictional Demo Aurora Solar
          </span>
          <div className="mb-2">
            <DemoPartnerLogo customLogoUrl={assets?.demoPartnerLogoUrl} className="h-[52px]" />
          </div>
        </div>

        {/* Right: Office Address Badge with exact rounded diagonal slant & orange accent matching reference */}
        <div className="relative flex-1 max-w-[369px] min-h-[64px] flex items-center justify-end">
          <svg
            viewBox="0 0 510 74"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          >
            <defs>
              <linearGradient id="footerNavyRef" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#083884" />
                <stop offset="100%" stopColor="#072d6b" />
              </linearGradient>
            </defs>

            {/* Fill reaches the very bottom so there is no white seam above the navy strip. */}
            <path
              d="M 0,74 L 510,74 L 510,3 L 68,3 Q 54,3 46,15 L 0,74 Z"
              fill="url(#footerNavyRef)"
            />

            {/* Orange exists only on the top and curved diagonal edge. */}
            <path
              d="M 510,3 L 68,3 Q 54,3 46,15 L 0,74"
              stroke={footerOrange}
              strokeWidth="3.5"
              strokeLinecap="butt"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>

          {/* Address Text Content matching reference screenshot (pure white text with bold headings) */}
          <div className="relative z-10 py-1.5 pr-2 pl-[29px] flex flex-col justify-center min-h-[64px] w-full">
            <div
              className="flex flex-col gap-1 text-[9.9px] leading-[1.2] text-center text-white"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              <div>
                <span className="font-bold">Corporate Office:</span>{' '}
                <span className="font-semibold">
                  {corporateLine1}
                  {hasBalancedCorporateLines && <><br />{corporateLine2}</>}
                </span>
              </div>
              <div>
                <span className="font-bold">Branch Office:</span>{' '}
                <span className="font-semibold">{footer.branchOffice}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Continue the diagonal accent as the single bottom rule across the footer. */}
      <div className="w-full h-[3px]" style={{ backgroundColor: footerOrange }} />
    </div>
  );
};
