import React from 'react';
import { QuotationData, AssetImages } from '../../types';
import { DocumentHeader } from '../DocumentHeader';
import { DocumentFooter } from '../DocumentFooter';
import { Emblem, QuoteBanner } from '../CompanyLogos';
import { HighlightWrapper } from '../HighlightWrapper';

interface Page1Props {
  data: QuotationData;
  highlightChanges?: boolean;
  changedFields?: Set<string>;
  onEditField?: (fieldKey: string) => void;
  onOpenAssetSlot?: (slot: keyof AssetImages) => void;
}

export const Page1: React.FC<Page1Props> = ({
  data,
  highlightChanges = false,
  changedFields = new Set(),
  onEditField,
  onOpenAssetSlot,
}) => {
  const { company, page1, footer, assets } = data;
  const bannerUrl = assets?.bannerUrl || (page1.showSchemeBanner ? `${import.meta.env.BASE_URL}banner.png` : '');

  const isFieldChanged = (key: string) => changedFields.has(key);

  return (
    <div className="a4-page bg-white shadow-xl print:shadow-none border border-gray-200 print:border-none mx-auto w-[210mm] min-h-[297mm] p-[12mm_15mm] flex flex-col justify-between text-gray-900 text-sm relative box-border overflow-hidden">
      {/* Top Header */}
      <div>
        <DocumentHeader
          company={company}
          assets={assets}
          onEditLogo={() => onOpenAssetSlot?.('logoUrl')}
        />

        {/* Customer & Quote Meta Section */}
        <div className="flex justify-between items-start mt-3 mb-3 text-[12px] leading-relaxed">
          {/* Customer info */}
          <div className="q-customer-info flex flex-col max-w-[60%] break-words" role="group" aria-label="Customer details">
            <span className="font-bold text-gray-900">To,</span>
            <div className="mt-0.5">
              <HighlightWrapper
                isChanged={isFieldChanged('page1.customerName')}
                active={highlightChanges}
                fieldLabel="Customer Name"
                onClick={() => onEditField?.('page1.customerName')}
              >
                <span className="font-normal text-gray-900 tracking-wide uppercase text-[13px]">
                  {page1.customerName || 'CUSTOMER NAME'}
                </span>
              </HighlightWrapper>
            </div>
            <div className="q-customer-contact-details">
              <div className="q-customer-phone mt-1 text-[13px] text-gray-800">
                <HighlightWrapper
                  isChanged={isFieldChanged('page1.customerPhone')}
                  active={highlightChanges}
                  fieldLabel="Customer Phone"
                  onClick={() => onEditField?.('page1.customerPhone')}
                >
                  <span className="font-normal tracking-normal">{page1.customerPhone || 'PHONE NUMBER'}</span>
                </HighlightWrapper>
              </div>
            </div>
            {page1.address && <p className="mt-1 text-[11px] break-words">{page1.address}</p>}
          </div>

          {/* Quote info */}
          <div className="flex flex-col items-end text-right">
            <div className="flex gap-2">
              <span className="font-bold text-gray-900">Quotation NO :</span>
              <HighlightWrapper
                isChanged={isFieldChanged('page1.quotationNo')}
                active={highlightChanges}
                fieldLabel="Quotation Number"
                onClick={() => onEditField?.('page1.quotationNo')}
              >
                <span className="font-normal text-gray-800">{page1.quotationNo || 'Quote-0000'}</span>
              </HighlightWrapper>
            </div>
            <div className="flex gap-2 mt-0.5">
              <span className="font-bold text-gray-900">Date :</span>
              <HighlightWrapper
                isChanged={isFieldChanged('page1.date')}
                active={highlightChanges}
                fieldLabel="Quotation Date"
                onClick={() => onEditField?.('page1.date')}
              >
                <span className="font-normal text-gray-800">{page1.date}</span>
              </HighlightWrapper>
            </div>
          </div>
        </div>

        {/* Subject */}
        <div className="my-2.5 text-[13px]">
          <span className="font-bold text-gray-900">Subject: </span>
          <HighlightWrapper
            isChanged={isFieldChanged('page1.capacityKw')}
            active={highlightChanges}
            fieldLabel="Capacity (kW)"
            onClick={() => onEditField?.('page1.capacityKw')}
          >
            <span className="font-normal text-gray-800">
              {page1.capacityKw.toLowerCase().includes('kw') ? page1.capacityKw : `${page1.capacityKw} kw`}
            </span>
          </HighlightWrapper>
        </div>

        {/* Empanelment Tagline (Increased 10% and solid black) */}
        <div className="text-center font-bold text-[14.5px] text-black my-2 tracking-tight">
          Proposal for a Grid-Connected Rooftop Solar Power Plant
        </div>

        {/* Logos & Quote Area (Individual emblems and quote banner) */}
        <div className="my-2">
          {assets?.middleBannerUrl ? (
            <div className="w-full my-1 rounded overflow-hidden border border-gray-200">
              <img
                src={assets.middleBannerUrl}
                alt="Solar energy banner and emblems"
                className="w-full h-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <Emblem url={assets?.leftEmblemUrl} alt="Agency emblem" className="h-20" />
                <Emblem url={assets?.rightEmblemUrl} alt="Energy emblem" className="h-20" />
              </div>
              <QuoteBanner url={bannerUrl} />
            </div>
          )}
        </div>

        {/* Body Paragraphs */}
        <div className="space-y-2.5 text-[11px] leading-[1.65] text-justify text-gray-800 font-normal mt-3">
          {page1.introParagraph1 && <p>{page1.introParagraph1}</p>}
          {page1.introParagraph2 && <p>{page1.introParagraph2}</p>}
          <p>
            We hope this is in line with your requirements. Please feel free to contact us for any further details and information as required.
          </p>
          <p>
            We look forward to your acknowledgment and favorable consideration for the offer submitted.
          </p>
        </div>

        {/* Yours Truly Sign-off */}
        <div className="flex flex-col items-end mt-4 text-right pr-2">
          <span className="font-bold text-gray-900 text-[12.5px]">Yours Truly</span>
          <div className="mt-1">
            <HighlightWrapper
              isChanged={isFieldChanged('page1.yoursTrulyName')}
              active={highlightChanges}
              fieldLabel="Representative Name"
              onClick={() => onEditField?.('page1.yoursTrulyName')}
            >
              <span className="font-normal text-gray-900 text-[13px]">
                {page1.yoursTrulyName || company.name}
              </span>
            </HighlightWrapper>
          </div>
          {(page1.yoursTrulyPhone || company.phone) && <div className="mt-0.5 text-[12px] text-gray-900">
            <span className="font-bold">Phone No: </span>
            <HighlightWrapper
              isChanged={isFieldChanged('page1.yoursTrulyPhone')}
              active={highlightChanges}
              fieldLabel="Representative Phone"
              onClick={() => onEditField?.('page1.yoursTrulyPhone')}
            >
              <span className="font-normal text-gray-800">{page1.yoursTrulyPhone || company.phone}</span>
            </HighlightWrapper>
          </div>}
        </div>
      </div>

      {/* Bottom Footer */}
      <DocumentFooter
        footer={footer}
        assets={assets}
        onEditLogo={() => onOpenAssetSlot?.('partnerLogoUrl')}
      />
    </div>
  );
};
