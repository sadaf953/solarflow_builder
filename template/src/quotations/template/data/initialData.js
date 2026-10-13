// The standard quotation for this client: company details from the branding
// in client.config.js plus the fixed terms, warranties and bill of materials.
// Each saved quotation keeps its own copy, so later changes here never alter
// a quotation that was already issued.

import { BRANDING, METADATA_DEFAULTS } from '../../../config/index.js';

const companyName = BRANDING.companyName || BRANDING.appName || '';
const discom = BRANDING.discomName || 'DISCOM';
// Only an https logo is used; without one the company name is printed instead.
const logoUrl = /^https:\/\//i.test(BRANDING.logoUrl || '') ? BRANDING.logoUrl : '';

// The three price options start as the first three configured panel brands.
const tierNames = [0, 1, 2].map(i => (METADATA_DEFAULTS.module_brand || [])[i] || `Option ${i + 1}`);

export const INITIAL_QUOTATION = {
  assets: {},

  company: {
    name: companyName,
    tagline: '',
    gstNo: BRANDING.gstin || '',
    cinNo: '',
    email: BRANDING.email || '',
    phone: BRANDING.phone || '',
    logoUrl,
  },

  page1: {
    customerName: '',
    customerPhone: '',
    quotationNo: '',
    date: '',
    capacityKw: '',
    yoursTrulyName: '',
    yoursTrulyPhone: '',
    // The PM Surya Ghar banner carries the Gujarat agency logo.
    showSchemeBanner: /gujarat/i.test(BRANDING.state || ''),
    introParagraph1: `Thank you for considering ${companyName || 'us'} for your rooftop solar power plant. We design, supply, install and commission grid-connected solar systems, and look after the paperwork with ${discom} on your behalf.`,
    introParagraph2: 'This quotation sets out the system we propose for your site, with prices for three panel options, the government subsidy where it applies, and our terms.',
  },

  page2: {
    solarPanelMake: '',
    solarPanelQty: '',
    inverterOption: '',
    inverterBrand: '',
    gebGedaCharge: 'Including',
    chargesLabel: BRANDING.chargesLabel || `${discom} registration`,
    projectType: 'Residential',

    projectSize: '',
    brandOptions: tierNames.map(brandName => ({
      brandName,
      baseValue: 0,
      discount: 0,
      netPayableAmount: 0,
      subsidy: 0,
      netPriceAfterSubsidy: 0,
    })),

    baseValue: 0,
    discount: 0,
    netPayableAmount: 0,
    subsidy: 0,
    netPriceAfterSubsidy: 0,

    notes: [
      'All GST is inclusive',
      '70% Solar Power System-(HSN CODE-8541)-5% @GST',
      '30% Solar Power System-(HSN CODE-9954)-18% @GST',
    ],
  },

  page3: {
    termsAndConditions: [
      { sr: 1, parameter: 'Rooftop area @10 Sq.Mtr./KWp to be provided', remarks: 'Customer Scope' },
      { sr: 2, parameter: 'Civil works', remarks: 'Included' },
      { sr: 3, parameter: 'Mounting, Erection, and Commissioning', remarks: 'Included' },
      { sr: 4, parameter: 'Power evacuations (solar plant to mains)', remarks: 'Included' },
      { sr: 5, parameter: 'Lightening arrester systems', remarks: 'Included' },
      { sr: 6, parameter: 'Earthing systems', remarks: 'Included' },
      { sr: 7, parameter: 'Free Operation & Maintenance (Cleaning has to be done by the customer)', remarks: 'Included for 5 Years' },
      { sr: 8, parameter: 'Transport charges', remarks: 'Included' },
      { sr: 9, parameter: 'Supply, Erection & Commissioning Period', remarks: 'Generally, it is 1 month.' },
      { sr: 10, parameter: 'Validity period for this quote', remarks: '15 days from the date of this offer' },
      { sr: 11, parameter: 'All extra and additional material/work', remarks: 'As per the bill raised on actual expenditure' },
    ],

    warranties: [
      { sr: 1, parameter: 'SPV modules (for Manufacturing Defects)', remarks: '15 Years' },
      {
        sr: 2,
        parameter: 'SPV modules (for performance)',
        remarks: '90% Power output for the 1st 10 years\n80% power output for the 2nd 30 years',
      },
      { sr: 3, parameter: 'Inverter (for Manufacturing Defects) Back to Back', remarks: '10 Years' },
    ],

    bomItems: [
      { sr: 1, description: 'Solar modules', unit: 'Nos', qty: 'As Per the Above First Page', size: 'As Per the Project', make: 'As Per the Above First Page' },
      { sr: 2, description: 'Module mounting structure (GI)', unit: 'Set', qty: 'As per design', size: '(max up to 8 FT from Ground)', make: 'Standard' },
      { sr: 3, description: 'String type Grid Tied Inverter', unit: 'Nos', qty: 'As per design', size: 'As Per the Project', make: 'As Per the Above First Page' },
      { sr: 4, description: 'AJB with accessories', unit: 'Nos', qty: 'As per design', size: '****', make: 'Standard' },
      { sr: 5, description: 'ACDB', unit: 'Nos', qty: 'At actual', size: 'As per design', make: 'Standard' },
      { sr: 6, description: 'DC cable with UV protected', unit: 'Mtr.', qty: 'At actual', size: 'As per design', make: 'Standard / Equivalent' },
      { sr: 7, description: 'AC Cable', unit: 'Mtr.', qty: 'At actual', size: 'As per design', make: 'Standard / Equivalent' },
      { sr: 8, description: 'Earthing systems', unit: 'Nos', qty: 'At actual', size: 'As per design', make: 'Standard' },
      { sr: 9, description: 'Lightening arrester systems', unit: 'Nos', qty: 'At actual', size: '****', make: 'Standard' },
      { sr: 10, description: 'LA Cable', unit: 'MTR', qty: 'At actual', size: '16 Sqmm Aluminium', make: 'Standard / Equivalent' },
    ],

    otherChargesText:
      `* The 50% advance includes the ${discom} registration charges. If a customer cancels after the registration has been paid, the advance is refunded after deducting the ${discom} charges, with a receipt and account statement.`,

    // Shown on the quotation only when the account number is filled in.
    bankDetails: {
      accountName: BRANDING.bankAccountName || '',
      accountNumber: BRANDING.bankAccountNumber || '',
      bankName: BRANDING.bankName || '',
      branchName: BRANDING.bankBranch || '',
      ifscCode: BRANDING.bankIfsc || '',
    },
  },

  footer: {
    authorizedPartner: companyName,
    corporateOffice: BRANDING.address || '',
    branchOffice: '',
    contact: [BRANDING.phone, BRANDING.email, BRANDING.website].filter(Boolean).join(' · '),
  },
};
