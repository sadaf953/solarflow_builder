export interface AssetImages {
  solarflowLogoUrl?: string; // Screenshot 1: SolarFlow Logo
  screenshot2MiddleBannerUrl?: string; // Screenshot 2: Full Page 1 Middle Block (GEDA + MNRE + Modi Banner)
  demoQualityLogoUrl?: string;
  demoEnergyLogoUrl?: string;
  demoBannerUrl?: string;
  demoPartnerLogoUrl?: string; // Screenshot 3: SolarFlow Plusoof Logo
}

export interface BrandQuoteOption {
  brandName: string; // e.g., "SolarFlow Essential", "SolarFlow Plus", "SolarFlow Premium"
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
  };

  // Page 2
  page2: {
    solarPanelMake: string; // "Waree 580"
    solarPanelQty: number | string; // "6"
    inverterOption: string; // "Option 1", "Option 2", "Option 3", "Option 4", or "Custom"
    inverterBrand: string; // "DemoVolt"
    gebGedaCharge: 'Including' | 'Excluding'; // user prompt: "feda, inclusive or exclusive"
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

    // Notes
    notes: string[];
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
  };
}

export type InverterPreset = {
  id: string;
  label: string;
  brand: string;
  specs: string;
};
