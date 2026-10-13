// Optional artwork for the quotation. Without it the company name is printed
// instead of a logo, and the emblems and banner are left out.
export interface AssetImages {
  logoUrl?: string;
  middleBannerUrl?: string; // replaces both emblems and the banner
  leftEmblemUrl?: string;
  rightEmblemUrl?: string;
  bannerUrl?: string;
  partnerLogoUrl?: string; // footer
}

export interface BrandQuoteOption {
  brandName: string; // panel brand of this price option
  baseValue: number; // e.g., 189000
  discount: number; // e.g., 0
  netPayableAmount: number; // calculated: baseValue - discount
  subsidy: number; // e.g., 78000
  netPriceAfterSubsidy: number; // calculated: netPayableAmount - subsidy
}

export interface QuotationData {
  // Image Assets
  assets?: AssetImages;

  // Company & Header
  company: {
    name: string;
    tagline: string;
    gstNo: string;
    cinNo: string;
    email: string;
    phone?: string;
    logoUrl?: string; // custom uploaded logo
  };

  // Page 1
  page1: {
    customerName: string;
    customerPhone: string;
    quotationNo: string;
    date: string;
    capacityKw: string; // e.g., "3.48 kw"
    yoursTrulyName: string;
    yoursTrulyPhone: string;
    introParagraph1?: string;
    introParagraph2?: string;
    showSchemeBanner?: boolean;
    address?: string;
    email?: string;
    validUntil?: string;
  };

  // Page 2
  page2: {
    solarPanelMake: string; // "Waree 580"
    solarPanelQty: number | string; // "6"
    inverterOption: string; // "Option 1", "Option 2", "Option 3", "Option 4", or "Custom"
    inverterBrand: string;
    gebGedaCharge: 'Including' | 'Excluding';
    chargesLabel?: string; // the client's name for these charges, e.g. "GEB / GEDA"
    projectType: 'Residential' | 'Commercial'; // user prompt: "residential or commericail"

    // Project Size column in Table 2
    projectSize?: string; // e.g., "3.48 kW"

    // 3 Brand / Company Options with their values & totals
    brandOptions: [BrandQuoteOption, BrandQuoteOption, BrandQuoteOption];

    // Financials (legacy fallback support)
    baseValue: number; // ₹1,89,000.00
    discount: number; // ₹0.00
    netPayableAmount: number; // calculated: baseValue - discount
    subsidy: number; // ₹78,000.00
    netPriceAfterSubsidy: number; // calculated: netPayableAmount - subsidy

    // Notes; those from index customNotesFrom on were added to this quotation
    notes: string[];
    customNotesFrom?: number;
  };

  // Page 3
  page3: {
    termsAndConditions: { sr: number; parameter: string; remarks: string }[];
    warranties: { sr: number; parameter: string; remarks: string }[];
    bomItems: {
      sr: number;
      description: string;
      unit: string;
      qty: string;
      size: string;
      make: string;
    }[];
    otherChargesText: string;
    bankDetails: {
      accountName: string;
      accountNumber: string;
      bankName: string;
      branchName: string;
      ifscCode: string;
    };
  };

  // Footer Info
  footer: {
    authorizedPartner: string;
    corporateOffice: string;
    branchOffice: string;
    contact?: string;
  };
}
