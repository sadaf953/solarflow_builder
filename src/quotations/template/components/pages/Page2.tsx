import React from 'react';
import { QuotationData, AssetImages } from '../../types';
import { DocumentHeader } from '../DocumentHeader';
import { DocumentFooter } from '../DocumentFooter';
import { formatINR } from '../../utils/formatters';
import { HighlightWrapper } from '../HighlightWrapper';

interface Page2Props {
  data: QuotationData;
  highlightChanges?: boolean;
  changedFields?: Set<string>;
  onEditField?: (fieldKey: string) => void;
  onOpenAssetSlot?: (slot: keyof AssetImages) => void;
}

export const Page2: React.FC<Page2Props> = ({
  data,
  highlightChanges = false,
  changedFields = new Set(),
  onEditField,
  onOpenAssetSlot,
}) => {
  const { company, page1, page2, footer, assets } = data;

  const isFieldChanged = (key: string) => changedFields.has(key);

  // Format capacity display
  const displayKw = page1.capacityKw.toLowerCase().includes('kw')
    ? page1.capacityKw
    : `${page1.capacityKw} kw`;

  const displayProjectSize = page2.projectSize || displayKw;

  // 3 Brand Options with graceful fallback
  const defaultBrands = [
    {
      brandName: 'SolarFlow Essential',
      baseValue: page2.baseValue || 189000,
      discount: page2.discount || 0,
      netPayableAmount: page2.netPayableAmount || 189000,
      subsidy: page2.subsidy || 78000,
      netPriceAfterSubsidy: page2.netPriceAfterSubsidy || 111000,
    },
    {
      brandName: 'SolarFlow Plus',
      baseValue: 198000,
      discount: 0,
      netPayableAmount: 198000,
      subsidy: 78000,
      netPriceAfterSubsidy: 120000,
    },
    {
      brandName: 'SolarFlow Premium',
      baseValue: 205000,
      discount: 0,
      netPayableAmount: 205000,
      subsidy: 78000,
      netPriceAfterSubsidy: 127000,
    },
  ];

  const brands = page2.brandOptions && page2.brandOptions.length === 3
    ? page2.brandOptions
    : defaultBrands;

  return (
    <div className="a4-page bg-white shadow-xl print:shadow-none border border-gray-200 print:border-none mx-auto w-[210mm] min-h-[297mm] p-[12mm_15mm] flex flex-col justify-between text-gray-900 text-sm relative box-border overflow-hidden">
      {/* Top Section */}
      <div>
        <DocumentHeader
          company={company}
          assets={assets}
          onEditLogo={() => onOpenAssetSlot?.('solarflowLogoUrl')}
        />

        {/* Title Header (Corporate Blue in proposal) */}
        <div className="text-center my-3">
          <h2 className="text-xl font-bold text-[#0c3882] tracking-tight">
            Techno Commercial Proposal For
          </h2>
          <div className="text-2xl font-black text-[#0c3882] mt-0.5 tracking-tight">
            <HighlightWrapper
              isChanged={isFieldChanged('page1.capacityKw')}
              active={highlightChanges}
              fieldLabel="System Capacity"
              onClick={() => onEditField?.('page1.capacityKw')}
            >
              <span>{displayKw}</span>
            </HighlightWrapper>
          </div>
          <p className="text-sm font-semibold text-[#0c3882] mt-0.5">
            Solar power system
          </p>
        </div>

        {/* Table 1: Equipment & Project Details matching PDF structure */}
        <div className="w-full my-3">
          <table className="w-full border-collapse border border-black text-[12px]">
            <thead>
              <tr className="bg-gray-50/70">
                <th className="border border-black px-3 py-1.5 text-left font-bold w-[40%]">
                  Description
                </th>
                <th className="border border-black px-3 py-1.5 text-left font-bold w-[60%]">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Solar panels are compared in the pricing table below. */}
              {/* Row 1: Inverter (Merged Make & Quantity - line removed) */}
              <tr>
                <td className="border border-black px-3 py-1.5 font-bold text-gray-900">
                  Inverter
                </td>
                <td className="border border-black px-3 py-1.5 text-gray-800 font-medium">
                  <HighlightWrapper
                    isChanged={isFieldChanged('page2.inverterBrand') || isFieldChanged('page2.inverterOption')}
                    active={highlightChanges}
                    fieldLabel="Inverter Brand / Option"
                    onClick={() => onEditField?.('page2.inverterOption')}
                  >
                    <span>{page2.inverterBrand}</span>
                  </HighlightWrapper>
                </td>
              </tr>

              {/* Row 3: GEB / GEDA Charge (Merged Make & Quantity - line removed) */}
              <tr>
                <td className="border border-black px-3 py-1.5 font-bold text-gray-900">
                  Geb / Geda Charge
                </td>
                <td className="border border-black px-3 py-1.5 text-gray-800 font-medium">
                  <HighlightWrapper
                    isChanged={isFieldChanged('page2.gebGedaCharge')}
                    active={highlightChanges}
                    fieldLabel="Geb / Geda Charge"
                    onClick={() => onEditField?.('page2.gebGedaCharge')}
                  >
                    <span>{page2.gebGedaCharge}</span>
                  </HighlightWrapper>
                </td>
              </tr>

              {/* Row 4: Project (Merged Make & Quantity - line removed) */}
              <tr>
                <td className="border border-black px-3 py-1.5 font-bold text-gray-900">
                  Project
                </td>
                <td className="border border-black px-3 py-1.5 text-gray-800 font-medium">
                  <HighlightWrapper
                    isChanged={isFieldChanged('page2.projectType')}
                    active={highlightChanges}
                    fieldLabel="Project Type"
                    onClick={() => onEditField?.('page2.projectType')}
                  >
                    <span>{page2.projectType}</span>
                  </HighlightWrapper>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Table 2: Financial Proposal with Project Size, 3 Brand Columns, 3 Values & 3 Totals */}
        <div className="w-full my-3">
          <table className="quotation-financial-table w-full border-collapse border border-black text-[11px]">
            <colgroup>
              <col className="w-[4%]" />
              <col className="w-[34%]" />
              <col className="w-[11%]" />
              <col className="w-[17%]" />
              <col className="w-[17%]" />
              <col className="w-[17%]" />
            </colgroup>
            <thead>
              <tr className="bg-gray-100/90">
                <th className="border border-black px-1.5 py-1 text-center font-bold w-[4%]">Sr</th>
                <th className="border border-black px-2 py-1 text-left font-bold w-[34%]">Description</th>
                <th className="border border-black px-1.5 py-1 text-center font-bold w-[11%]">Project Size</th>
                {brands.map((brand, idx) => (
                  <th
                    key={idx}
                    className="border border-black px-1.5 py-1 text-center font-bold text-[10.5px] text-[#0c3882] w-[17%]"
                  >
                    <HighlightWrapper
                      isChanged={isFieldChanged(`page2.brandOptions.${idx}.brandName`)}
                      active={highlightChanges}
                      fieldLabel={`Brand / Company ${idx + 1}`}
                      onClick={() => onEditField?.(`page2.brandOptions.${idx}.brandName`)}
                    >
                      <span className="block leading-tight font-extrabold">{brand.brandName}</span>
                    </HighlightWrapper>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Row 1: System Scope, Project Size & 3 Base Values */}
              <tr className="quotation-financial-main-row">
                <td className="border border-black px-1.5 py-2 text-center align-top font-bold text-gray-900">
                  1
                </td>
                <td className="border border-black px-2 py-2 text-justify text-[9.5px] leading-snug text-gray-800">
                  Design, supply, erection and commissioning of a rooftop grid-tied solar PV power
                  generation plant with standard lengths of wires. The solar power plant will consist of
                  required no. of SPV panels, inverter, and all the electrical items suitable to the
                  designed installed capacity.
                </td>
                <td className="border border-black px-1.5 py-2 text-center align-middle font-bold text-gray-900 text-[10.5px] whitespace-nowrap">
                  <HighlightWrapper
                    isChanged={isFieldChanged('page2.projectSize') || isFieldChanged('page1.capacityKw')}
                    active={highlightChanges}
                    fieldLabel="Project Size"
                    onClick={() => onEditField?.('page2.projectSize')}
                  >
                    <span>{displayProjectSize}</span>
                  </HighlightWrapper>
                </td>
                {brands.map((brand, idx) => (
                  <td
                    key={idx}
                    className="border border-black px-1.5 py-2 text-right align-middle font-bold text-gray-950 whitespace-nowrap text-[11px]"
                  >
                    <HighlightWrapper
                      isChanged={isFieldChanged(`page2.brandOptions.${idx}.baseValue`)}
                      active={highlightChanges}
                      fieldLabel={`${brand.brandName} Base Value`}
                      onClick={() => onEditField?.(`page2.brandOptions.${idx}.baseValue`)}
                    >
                      <span>{formatINR(brand.baseValue)}</span>
                    </HighlightWrapper>
                  </td>
                ))}
              </tr>

              {/* Row 2: Discount */}
              <tr className="quotation-financial-summary-row">
                <td colSpan={3} className="border border-black px-2.5 py-1 text-right font-medium text-gray-900 text-[10.5px]">
                  Discount
                </td>
                {brands.map((brand, idx) => (
                  <td
                    key={idx}
                    className="border border-black px-1.5 py-1 text-right font-semibold text-gray-900 whitespace-nowrap text-[10.5px]"
                  >
                    <HighlightWrapper
                      isChanged={isFieldChanged(`page2.brandOptions.${idx}.discount`)}
                      active={highlightChanges}
                      fieldLabel={`${brand.brandName} Discount`}
                      onClick={() => onEditField?.(`page2.brandOptions.${idx}.discount`)}
                    >
                      <span>{formatINR(brand.discount)}</span>
                    </HighlightWrapper>
                  </td>
                ))}
              </tr>

              {/* Row 3: Net Payable Amount (Sub-Totals) */}
              <tr className="quotation-financial-summary-row bg-gray-50/50">
                <td colSpan={3} className="border border-black px-2.5 py-1 text-right font-bold text-gray-950 text-[10.5px]">
                  Net Payable Amount
                </td>
                {brands.map((brand, idx) => (
                  <td
                    key={idx}
                    className="border border-black px-1.5 py-1 text-right font-bold text-gray-950 whitespace-nowrap text-[11px]"
                  >
                    <span>{formatINR(brand.netPayableAmount)}</span>
                  </td>
                ))}
              </tr>

              {/* Row 4: Subsidy */}
              <tr className="quotation-financial-summary-row">
                <td colSpan={3} className="border border-black px-2.5 py-1 text-right text-[9.5px] text-gray-800">
                  Subsidy (Subsidy Will be credited To The Customer Account)
                </td>
                {brands.map((brand, idx) => (
                  <td
                    key={idx}
                    className="border border-black px-1.5 py-1 text-right font-semibold text-gray-900 whitespace-nowrap text-[10.5px]"
                  >
                    <HighlightWrapper
                      isChanged={isFieldChanged(`page2.brandOptions.${idx}.subsidy`)}
                      active={highlightChanges}
                      fieldLabel={`${brand.brandName} Subsidy`}
                      onClick={() => onEditField?.(`page2.brandOptions.${idx}.subsidy`)}
                    >
                      <span>{formatINR(brand.subsidy)}</span>
                    </HighlightWrapper>
                  </td>
                ))}
              </tr>

              {/* Row 5: Net Price After Receiving Subsidies (Three Totals) */}
              <tr className="quotation-financial-summary-row bg-blue-50/50">
                <td colSpan={3} className="border border-black px-2.5 py-1.5 text-right font-extrabold text-[#0c3882] text-[11px]">
                  Net Price After Receiving Subsidies
                </td>
                {brands.map((brand, idx) => (
                  <td
                    key={idx}
                    className="border border-black px-1.5 py-1.5 text-right font-black text-[#0c3882] whitespace-nowrap text-[11.5px]"
                  >
                    <HighlightWrapper
                      isChanged={isFieldChanged(`page2.brandOptions.${idx}.netPriceAfterSubsidy`)}
                      active={highlightChanges}
                      fieldLabel={`${brand.brandName} Total Price`}
                    >
                      <span>{formatINR(brand.netPriceAfterSubsidy)}</span>
                    </HighlightWrapper>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Note Section (Consolidated as per user directive) */}
        <div className="w-full my-3">
          <div className="font-bold text-[13px] text-[#0c3882] mb-1">
            Note :
          </div>
          <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed text-gray-800 pl-1">
            {page2.notes.map((note, idx) => {
              // Check if this note is a custom appended point
              const isCustom = idx >= 6;
              return (
                <li key={idx} className="marker:text-gray-900">
                  <HighlightWrapper
                    isChanged={isCustom || isFieldChanged('page2.notes')}
                    active={highlightChanges}
                    fieldLabel={`Note Item #${idx + 1}`}
                    onClick={() => onEditField?.('page2.notes')}
                  >
                    <span>{note}</span>
                  </HighlightWrapper>
                </li>
              );
            })}
          </ul>
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
