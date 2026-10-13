// src/components/ToolboxView.jsx
// SolarFlow Operational Toolbox
// Includes: EMI Calculator, GST Calculator, Solar Savings & ROI,
// Customer Payment Receipt, Staff Payment Receipt, Vendor Payment Receipt,
// Warranty Card & Certificate, 1-Page Quick Quotation.

import { useState, useRef, useMemo } from 'react';
import {
    Calculator, Receipt, IndianRupee, Sun, ShieldCheck,
    FileText, UserCheck, Truck, Printer, RotateCcw,
    CheckCircle2, ArrowRight, Sparkles, Building2, Phone, Calendar, ChevronRight
} from 'lucide-react';

const TOOL_GROUPS = [
    {
        label: 'Solar calculations',
        description: 'Customer estimates and tax working',
        tools: [
            { id: 'emi', label: 'Loan EMI', description: 'Monthly finance estimate', icon: Calculator },
            { id: 'gst', label: 'GST calculation', description: 'Taxable value and GST split', icon: Receipt },
            { id: 'savings', label: 'Savings & ROI', description: 'Generation, payback and savings', icon: Sun },
        ],
    },
    {
        label: 'Business documents',
        description: 'Print-ready operational paperwork',
        tools: [
            { id: 'customer_receipt', label: 'Customer receipt', description: 'Payment acknowledgement', icon: IndianRupee },
            { id: 'staff_receipt', label: 'Staff payment', description: 'Internal payment voucher', icon: UserCheck },
            { id: 'vendor_receipt', label: 'Vendor payment', description: 'Contractor payment voucher', icon: Truck },
            { id: 'warranty', label: 'Warranty certificate', description: 'Customer warranty record', icon: ShieldCheck },
            { id: 'quick_quote', label: 'Quick quotation', description: 'One-page customer proposal', icon: FileText },
        ],
    },
];

const TOOL_COUNT = TOOL_GROUPS.reduce((total, group) => total + group.tools.length, 0);

export default function ToolboxView({ currentUser }) {
    const [activeTool, setActiveTool] = useState('emi');

    return (
        <div className="solar-toolbox max-w-[1500px] mx-auto p-4 md:p-6 lg:p-8 space-y-6">
            <header className="rounded-3xl border border-stone-200 bg-white px-5 py-5 md:px-7 md:py-6 print:hidden">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 text-orange-600">
                            <Sun className="h-6 w-6" />
                        </span>
                        <div>
                            <p className="sf-kicker">Operations workspace</p>
                            <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">Solar Toolbox</h1>
                            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-500">
                                Calculate project figures and prepare consistent, print-ready business documents from one workspace.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 self-start sm:self-center">
                        <div className="rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-right">
                            <strong className="block text-sm text-stone-900">{TOOL_COUNT} tools</strong>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Calculation &amp; print</span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="toolbox-workspace grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                <nav aria-label="Solar Toolbox tools" className="rounded-2xl border border-stone-200 bg-white p-3 print:hidden lg:sticky lg:top-24">
                    {TOOL_GROUPS.map((group, groupIndex) => (
                        <section key={group.label} className={groupIndex ? 'mt-4 border-t border-stone-100 pt-4' : ''}>
                            <div className="px-2 pb-2">
                                <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-700">{group.label}</h2>
                                <p className="mt-0.5 text-[11px] leading-snug text-stone-400">{group.description}</p>
                            </div>
                            <div className="space-y-1">
                                {group.tools.map(tool => (
                                    <ToolTabBtn
                                        key={tool.id}
                                        active={activeTool === tool.id}
                                        onClick={() => setActiveTool(tool.id)}
                                        icon={tool.icon}
                                        label={tool.label}
                                        description={tool.description}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </nav>

                <main className="toolbox-content min-w-0 rounded-3xl border border-stone-200 bg-white p-4 md:p-6 lg:p-7">
                    {activeTool === 'emi' && <EmiCalculator />}
                    {activeTool === 'gst' && <GstCalculator />}
                    {activeTool === 'savings' && <SolarSavingsCalculator />}
                    {activeTool === 'customer_receipt' && <CustomerReceiptGenerator currentUser={currentUser} />}
                    {activeTool === 'staff_receipt' && <StaffReceiptGenerator currentUser={currentUser} />}
                    {activeTool === 'vendor_receipt' && <VendorReceiptGenerator currentUser={currentUser} />}
                    {activeTool === 'warranty' && <WarrantyCardGenerator currentUser={currentUser} />}
                    {activeTool === 'quick_quote' && <OnePageQuotationGenerator currentUser={currentUser} />}
                </main>
            </div>
        </div>
    );
}

function ToolTabBtn({ active, onClick, icon: Icon, label, description }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? 'page' : undefined}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                active
                    ? 'border-orange-200 bg-orange-50 text-stone-900'
                    : 'border-transparent bg-white text-stone-700 hover:border-stone-200 hover:bg-stone-50'
            }`}
        >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-orange-500 text-stone-900' : 'bg-stone-100 text-stone-500 group-hover:text-stone-700'}`}>
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs font-bold">{label}</strong>
                <small className="mt-0.5 block truncate text-[10px] font-medium text-stone-400">{description}</small>
            </span>
            <ChevronRight className={`h-4 w-4 shrink-0 ${active ? 'text-orange-600' : 'text-stone-300'}`} />
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. EMI CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
function EmiCalculator() {
    const [loanAmount, setLoanAmount] = useState(150000);
    const [interestRate, setInterestRate] = useState(9.5);
    const [tenureYears, setTenureYears] = useState(5);

    const P = Number(loanAmount) || 0;
    const annualRate = Number(interestRate) || 0;
    const r = (annualRate / 12) / 100;
    const n = (Number(tenureYears) || 0) * 12;

    const monthlyEmi = useMemo(() => {
        if (P <= 0 || r <= 0 || n <= 0) return 0;
        return Math.round((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
    }, [P, r, n]);

    const totalPayment = monthlyEmi * n;
    const totalInterest = Math.max(0, totalPayment - P);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-stone-900">Solar Loan EMI Calculator</h2>
                <p className="text-xs text-stone-500">Calculate monthly loan installment and interest for rooftop solar financing.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4 md:col-span-1 border-r border-stone-100 pr-0 md:pr-6">
                    <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">Loan Amount (₹)</label>
                        <input
                            type="number"
                            min="10000"
                            step="5000"
                            value={loanAmount}
                            onChange={e => setLoanAmount(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-semibold"
                        />
                        <div className="flex gap-1.5 mt-2">
                            {[100000, 150000, 200000, 300000].map(amt => (
                                <button
                                    key={amt}
                                    type="button"
                                    onClick={() => setLoanAmount(amt)}
                                    className="px-2 py-1 bg-stone-100 text-[10px] font-medium rounded hover:bg-stone-200"
                                >
                                    ₹{(amt / 100000).toFixed(1)}L
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">Interest Rate (% p.a.)</label>
                        <input
                            type="number"
                            step="0.1"
                            min="1"
                            max="30"
                            value={interestRate}
                            onChange={e => setInterestRate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-semibold"
                        />
                        <div className="flex gap-1.5 mt-2">
                            {[7.5, 8.5, 9.5, 10.5].map(rate => (
                                <button
                                    key={rate}
                                    type="button"
                                    onClick={() => setInterestRate(rate)}
                                    className="px-2 py-1 bg-stone-100 text-[10px] font-medium rounded hover:bg-stone-200"
                                >
                                    {rate}%
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">Tenure (Years)</label>
                        <input
                            type="number"
                            min="1"
                            max="15"
                            value={tenureYears}
                            onChange={e => setTenureYears(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-semibold"
                        />
                        <div className="flex gap-1.5 mt-2">
                            {[3, 5, 7, 10].map(yr => (
                                <button
                                    key={yr}
                                    type="button"
                                    onClick={() => setTenureYears(yr)}
                                    className="px-2 py-1 bg-stone-100 text-[10px] font-medium rounded hover:bg-stone-200"
                                >
                                    {yr} Yrs
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 flex flex-col justify-between space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl">
                            <span className="text-xs text-amber-800 font-medium">Monthly Installment</span>
                            <div className="text-2xl font-black text-amber-900 mt-1">₹{monthlyEmi.toLocaleString('en-IN')}</div>
                            <span className="text-[10px] text-amber-700">for {n} months</span>
                        </div>

                        <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                            <span className="text-xs text-stone-500 font-medium">Total Interest</span>
                            <div className="text-2xl font-bold text-stone-900 mt-1">₹{totalInterest.toLocaleString('en-IN')}</div>
                            <span className="text-[10px] text-stone-400">Total extra charge</span>
                        </div>

                        <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                            <span className="text-xs text-stone-500 font-medium">Total Amount Payable</span>
                            <div className="text-2xl font-bold text-stone-900 mt-1">₹{totalPayment.toLocaleString('en-IN')}</div>
                            <span className="text-[10px] text-stone-400">Principal + Interest</span>
                        </div>
                    </div>

                    {/* Visual Proportion */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-stone-600 font-medium">
                            <span>Principal: ₹{P.toLocaleString('en-IN')} ({totalPayment ? Math.round((P / totalPayment) * 100) : 0}%)</span>
                            <span>Interest: ₹{totalInterest.toLocaleString('en-IN')} ({totalPayment ? Math.round((totalInterest / totalPayment) * 100) : 0}%)</span>
                        </div>
                        <div className="w-full h-3 bg-stone-200 rounded-full overflow-hidden flex">
                            <div
                                style={{ width: `${totalPayment ? (P / totalPayment) * 100 : 0}%` }}
                                className="h-full bg-amber-500"
                            />
                            <div
                                style={{ width: `${totalPayment ? (totalInterest / totalPayment) * 100 : 0}%` }}
                                className="h-full bg-stone-700"
                            />
                        </div>
                    </div>

                    <div className="p-4 bg-stone-50 rounded-xl text-xs text-stone-600 space-y-1">
                        <div className="font-semibold text-stone-800">💡 Solar Pro Tip for Customers:</div>
                        <div>
                            A 3 kW rooftop solar plant generates ~360 units/month, saving approx ₹2,700–₹3,200 on monthly power bills.
                            This electricity bill saving directly pays off a monthly EMI of ₹{monthlyEmi.toLocaleString('en-IN')}, making the solar plant virtually self-funding!
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. GST CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
function GstCalculator() {
    const [amount, setAmount] = useState(200000);
    const [gstRate, setGstRate] = useState(13.8); // standard solar blended
    const [mode, setMode] = useState('exclusive'); // exclusive (add gst) or inclusive (extract gst)

    const val = Number(amount) || 0;
    const rate = Number(gstRate) || 0;

    let baseAmount = 0;
    let gstAmount = 0;
    let totalAmount = 0;

    if (mode === 'exclusive') {
        baseAmount = val;
        gstAmount = (val * rate) / 100;
        totalAmount = baseAmount + gstAmount;
    } else {
        totalAmount = val;
        baseAmount = val / (1 + rate / 100);
        gstAmount = totalAmount - baseAmount;
    }

    const cgst = gstAmount / 2;
    const sgst = gstAmount / 2;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-stone-900">Solar GST Calculator</h2>
                <p className="text-xs text-stone-500">Calculate GST additions and deductions for solar equipment, inverters and EPC works.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4 md:col-span-1 border-r border-stone-100 pr-0 md:pr-6">
                    <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">Amount (₹)</label>
                        <input
                            type="number"
                            min="0"
                            step="1000"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">Calculation Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setMode('exclusive')}
                                className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                                    mode === 'exclusive' ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-50 text-stone-700 border-stone-200'
                                }`}
                            >
                                + Add GST (Exclusive)
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('inclusive')}
                                className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                                    mode === 'inclusive' ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-50 text-stone-700 border-stone-200'
                                }`}
                            >
                                - Extract GST (Inclusive)
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">GST Rate (%)</label>
                        <input
                            type="number"
                            step="0.1"
                            value={gstRate}
                            onChange={e => setGstRate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold"
                        />
                        <div className="grid grid-cols-3 gap-1.5 mt-2">
                            <button type="button" onClick={() => setGstRate(13.8)} className="px-2 py-1.5 bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold rounded">
                                13.8% (Solar System)
                            </button>
                            <button type="button" onClick={() => setGstRate(12)} className="px-2 py-1.5 bg-stone-100 text-stone-800 text-[10px] font-medium rounded hover:bg-stone-200">
                                12% (Inverter/Panels)
                            </button>
                            <button type="button" onClick={() => setGstRate(18)} className="px-2 py-1.5 bg-stone-100 text-stone-800 text-[10px] font-medium rounded hover:bg-stone-200">
                                18% (Services/EPC)
                            </button>
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                            <span className="text-xs text-stone-500 font-medium">Base Price (Taxable)</span>
                            <div className="text-xl font-bold text-stone-900 mt-1">₹{Math.round(baseAmount).toLocaleString('en-IN')}</div>
                        </div>

                        <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl">
                            <span className="text-xs text-amber-800 font-medium">Total GST ({rate}%)</span>
                            <div className="text-xl font-black text-amber-900 mt-1">₹{Math.round(gstAmount).toLocaleString('en-IN')}</div>
                        </div>

                        <div className="p-4 bg-stone-900 text-white rounded-2xl">
                            <span className="text-xs text-stone-300 font-medium">Gross Total</span>
                            <div className="text-xl font-bold text-white mt-1">₹{Math.round(totalAmount).toLocaleString('en-IN')}</div>
                        </div>
                    </div>

                    <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 space-y-3">
                        <div className="text-xs font-semibold text-stone-700">Tax Invoice Breakdown:</div>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="flex justify-between py-1 border-b border-stone-200">
                                <span className="text-stone-500">CGST ({(rate / 2).toFixed(2)}%):</span>
                                <span className="font-semibold text-stone-800">₹{Math.round(cgst).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-stone-200">
                                <span className="text-stone-500">SGST ({(rate / 2).toFixed(2)}%):</span>
                                <span className="font-semibold text-stone-800">₹{Math.round(sgst).toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                        <p className="text-[11px] text-stone-400">
                            * Note: For composite solar project contracts under GST council guidelines, 70% of gross contract value is treated as supply of goods (12% GST) and 30% as supply of service (18% GST), producing an effective blended rate of ~13.8%.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SOLAR SAVINGS & PAYBACK CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
function SolarSavingsCalculator() {
    const [capacityKw, setCapacityKw] = useState(3.3);
    const [tariffPerUnit, setTariffPerUnit] = useState(7.5);
    const [systemCost, setSystemCost] = useState(195000);
    const [subsidyAmount, setSubsidyAmount] = useState(78000); // PM Surya Ghar 3kW max

    const kw = Number(capacityKw) || 0;
    const rate = Number(tariffPerUnit) || 0;
    const cost = Number(systemCost) || 0;
    const sub = Number(subsidyAmount) || 0;

    const dailyUnits = kw * 4.2; // approx 4.2 units per kW per day in India
    const monthlyUnits = dailyUnits * 30;
    const annualUnits = dailyUnits * 365;

    const monthlySavings = monthlyUnits * rate;
    const annualSavings = annualUnits * rate;
    const lifetimeSavings25Yrs = annualSavings * 25 * 0.92; // 0.92 degradation factor average

    const netInvestment = Math.max(0, cost - sub);
    const paybackYears = annualSavings > 0 ? (netInvestment / annualSavings).toFixed(1) : 0;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-stone-900">Solar Savings & Payback Period Calculator</h2>
                <p className="text-xs text-stone-500">Demonstrate instant power bill savings and return on investment for residential and commercial customers.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4 md:col-span-1 border-r border-stone-100 pr-0 md:pr-6">
                    <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">System Capacity (kW)</label>
                        <input
                            type="number"
                            step="0.1"
                            value={capacityKw}
                            onChange={e => setCapacityKw(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold"
                        />
                        <div className="flex gap-1.5 mt-2">
                            {[1, 2, 3.3, 5, 10].map(k => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => {
                                        setCapacityKw(k);
                                        if (k <= 2) setSubsidyAmount(k * 30000);
                                        else if (k <= 3) setSubsidyAmount(78000);
                                        else setSubsidyAmount(78000);
                                    }}
                                    className="px-2 py-1 bg-stone-100 text-[10px] font-medium rounded hover:bg-stone-200"
                                >
                                    {k} kW
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">Electricity Tariff (₹/Unit)</label>
                        <input
                            type="number"
                            step="0.5"
                            value={tariffPerUnit}
                            onChange={e => setTariffPerUnit(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">Gross System Cost (₹)</label>
                        <input
                            type="number"
                            step="5000"
                            value={systemCost}
                            onChange={e => setSystemCost(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">Govt. Subsidy (₹) - PM Surya Ghar</label>
                        <input
                            type="number"
                            step="1000"
                            value={subsidyAmount}
                            onChange={e => setSubsidyAmount(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold"
                        />
                    </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                            <span className="text-[10px] text-stone-500 font-medium">Daily Generation</span>
                            <div className="text-lg font-bold text-stone-900 mt-0.5">{Math.round(dailyUnits)} units</div>
                        </div>
                        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                            <span className="text-[10px] text-stone-500 font-medium">Monthly Generation</span>
                            <div className="text-lg font-bold text-stone-900 mt-0.5">{Math.round(monthlyUnits)} units</div>
                        </div>
                        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                            <span className="text-[10px] text-stone-500 font-medium">Annual Generation</span>
                            <div className="text-lg font-bold text-stone-900 mt-0.5">{Math.round(annualUnits).toLocaleString('en-IN')} units</div>
                        </div>
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <span className="text-[10px] text-amber-800 font-bold">Payback Period</span>
                            <div className="text-lg font-black text-amber-900 mt-0.5">{paybackYears} Years</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                            <span className="text-xs text-stone-500 font-medium">Monthly Bill Reduction</span>
                            <div className="text-xl font-bold text-emerald-700 mt-1">₹{Math.round(monthlySavings).toLocaleString('en-IN')} / mo</div>
                        </div>

                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                            <span className="text-xs text-emerald-800 font-medium">Annual Savings</span>
                            <div className="text-2xl font-black text-emerald-900 mt-1">₹{Math.round(annualSavings).toLocaleString('en-IN')} / yr</div>
                        </div>

                        <div className="p-4 bg-stone-900 text-white rounded-2xl">
                            <span className="text-xs text-amber-400 font-semibold">25-Year Lifetime Savings</span>
                            <div className="text-2xl font-black text-white mt-1">₹{Math.round(lifetimeSavings25Yrs).toLocaleString('en-IN')}</div>
                        </div>
                    </div>

                    <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-2xl flex items-center justify-between">
                        <div>
                            <span className="text-xs text-stone-500">Net Customer Out-of-Pocket Cost:</span>
                            <div className="text-xl font-bold text-stone-900">₹{netInvestment.toLocaleString('en-IN')}</div>
                            <span className="text-[10px] text-stone-400">Total cost (₹{cost.toLocaleString('en-IN')}) minus Subsidy (₹{sub.toLocaleString('en-IN')})</span>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-stone-500">Carbon Offset:</span>
                            <div className="text-base font-bold text-emerald-700">~{((annualUnits * 0.82) / 1000).toFixed(1)} Tonnes CO₂ / yr</div>
                            <span className="text-[10px] text-stone-400">Equivalent to ~{Math.round(annualUnits * 0.04)} trees planted</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CUSTOMER PAYMENT RECEIPT
// ─────────────────────────────────────────────────────────────────────────────
const money = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;

function ProfessionalDocument({
    title,
    documentNo,
    date,
    recipientLabel = 'Issued To',
    recipientLines = [],
    referenceLines = [],
    rows = [],
    amountHeading = 'Amount (₹)',
    totalLabel,
    totalValue,
    notes = [],
    signatures = ['Prepared By', 'Authorized Signatory', 'Recipient Signature'],
}) {
    return (
        <article className="professional-document mx-auto max-w-4xl bg-white text-stone-900">
            <div className="professional-document-header">
                <div>
                    <div className="professional-document-brand">SOLARFLOW ENERGY</div>
                    <p>Rooftop Solar EPC · Engineering · Installation · Service</p>
                    <p>GSTIN: 24AAACS1234F1Z9 · +91 98765 43210 · solarcrm.deeprootsystems.in</p>
                </div>
                <div className="professional-document-title">
                    <h3>{title}</h3>
                    <dl>
                        <div><dt>Document No.</dt><dd>{documentNo}</dd></div>
                        <div><dt>Date</dt><dd>{date}</dd></div>
                    </dl>
                </div>
            </div>

            <section className="professional-document-parties">
                <div>
                    <h4>{recipientLabel}</h4>
                    {recipientLines.filter(Boolean).map((line, index) => <p key={index} className={index === 0 ? 'party-name' : ''}>{line}</p>)}
                </div>
                <div>
                    <h4>Reference Details</h4>
                    {referenceLines.filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
                </div>
            </section>

            <table className="professional-document-table">
                <thead>
                    <tr>
                        <th className="serial-column">Sr. No.</th>
                        <th>Description</th>
                        <th className="amount-column">{amountHeading}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={`${row.description}-${index}`}>
                            <td className="serial-column">{index + 1}</td>
                            <td><strong>{row.description}</strong>{row.details && <small>{row.details}</small>}</td>
                            <td className="amount-column">{row.amount}</td>
                        </tr>
                    ))}
                    {totalLabel && <tr className="document-total-row">
                        <td colSpan={2}>{totalLabel}</td>
                        <td className="amount-column">{totalValue}</td>
                    </tr>}
                </tbody>
            </table>

            {notes.length > 0 && <section className="professional-document-notes">
                <h4>Notes &amp; Terms</h4>
                {notes.filter(Boolean).map((note, index) => <p key={index}>{index + 1}. {note}</p>)}
            </section>}

            <div className="professional-document-signatures">
                {signatures.map(label => <div key={label}><span /><strong>{label}</strong><small>Signature, name and date</small></div>)}
            </div>
            <p className="professional-document-footer">This is a system-generated business document from SolarFlow CRM.</p>
        </article>
    );
}

function CustomerReceiptGenerator({ currentUser }) {
    const [receiptData, setReceiptData] = useState({
        receiptNo: `SF-REC-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toISOString().split('T')[0],
        customerName: 'Anand Verma',
        consumerNo: '02819482910',
        phone: '9876543210',
        address: '12, Sunrise Residency, SG Highway, Ahmedabad',
        capacityKw: '3.3',
        amount: '50000',
        paymentMode: 'UPI / Bank Transfer',
        transactionRef: 'UPI/492819482910',
        paymentStage: 'Material Delivery Payment (40%)',
        notes: 'Full payment received against rooftop solar equipment delivery.'
    });

    const printReceipt = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
                <div>
                    <h2 className="text-lg font-bold text-stone-900">Customer Payment Receipt Generator</h2>
                    <p className="text-xs text-stone-500">Generate clean, official payment acknowledgements for clients with 1-click print.</p>
                </div>
                <button
                    onClick={printReceipt}
                    className="sf-btn-primary shadow-sm"
                >
                    <Printer className="w-4 h-4" /> Print / Save PDF Receipt
                </button>
            </div>

            {/* Input Form (Hidden on Print) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-200 print:hidden text-xs">
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Receipt No.</label>
                    <input
                        type="text"
                        value={receiptData.receiptNo}
                        onChange={e => setReceiptData({ ...receiptData, receiptNo: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Date</label>
                    <input
                        type="date"
                        value={receiptData.date}
                        onChange={e => setReceiptData({ ...receiptData, date: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Customer Name</label>
                    <input
                        type="text"
                        value={receiptData.customerName}
                        onChange={e => setReceiptData({ ...receiptData, customerName: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Consumer / Account No.</label>
                    <input
                        type="text"
                        value={receiptData.consumerNo}
                        onChange={e => setReceiptData({ ...receiptData, consumerNo: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>

                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Amount Received (₹)</label>
                    <input
                        type="number"
                        value={receiptData.amount}
                        onChange={e => setReceiptData({ ...receiptData, amount: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white font-bold text-amber-700"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Payment Mode</label>
                    <select
                        value={receiptData.paymentMode}
                        onChange={e => setReceiptData({ ...receiptData, paymentMode: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    >
                        <option>UPI / Online Transfer</option>
                        <option>NEFT / RTGS / IMPS</option>
                        <option>Cheque / Demand Draft</option>
                        <option>Cash</option>
                        <option>Bank Loan Disbursement</option>
                    </select>
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Txn / UTR / Cheque Ref No.</label>
                    <input
                        type="text"
                        value={receiptData.transactionRef}
                        onChange={e => setReceiptData({ ...receiptData, transactionRef: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Payment For / Milestone</label>
                    <select
                        value={receiptData.paymentStage}
                        onChange={e => setReceiptData({ ...receiptData, paymentStage: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    >
                        <option>Booking Advance (10%)</option>
                        <option>Discom Registration Fee</option>
                        <option>Material Delivery Payment (40%)</option>
                        <option>Installation & Commissioning Balance (50%)</option>
                        <option>Full Payment Settlement</option>
                    </select>
                </div>
            </div>

            {/* Printable Receipt Preview Card */}
            <ProfessionalDocument
                title="Payment Receipt"
                documentNo={receiptData.receiptNo}
                date={receiptData.date}
                recipientLabel="Received From"
                recipientLines={[receiptData.customerName, receiptData.address, `Phone: ${receiptData.phone}`, `Consumer No.: ${receiptData.consumerNo}`]}
                referenceLines={[`System capacity: ${receiptData.capacityKw} kWp`, `Payment mode: ${receiptData.paymentMode}`, `Transaction reference: ${receiptData.transactionRef}`]}
                rows={[{ description: receiptData.paymentStage, details: `Payment received for ${receiptData.capacityKw} kWp rooftop solar project`, amount: money(receiptData.amount) }]}
                totalLabel="Total Amount Received"
                totalValue={money(receiptData.amount)}
                notes={[receiptData.notes, 'Payment is subject to realization where received by cheque or electronic transfer.']}
                signatures={['Received By', 'Authorized Signatory', 'Customer / Depositor']}
            />
            <div className="hidden max-w-3xl mx-auto p-8 bg-white border border-stone-300 rounded-2xl shadow-sm text-stone-800 space-y-6">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-stone-900 pb-4">
                    <div>
                        <div className="text-2xl font-black tracking-wider text-stone-900">SOLARFLOW ENERGY</div>
                        <p className="text-xs text-stone-500 font-medium">Solar EPC, Rooftop Systems & Renewable Solutions</p>
                        <p className="text-[11px] text-stone-400">GST: 24AAACS1234F1Z9 | Phone: +91 98765 43210</p>
                    </div>
                    <div className="text-right">
                        <span className="inline-block px-3 py-1 bg-stone-900 text-white text-xs font-bold uppercase rounded-md tracking-wider">
                            Payment Receipt
                        </span>
                        <div className="text-xs font-semibold text-stone-700 mt-2">No: <span className="font-mono">{receiptData.receiptNo}</span></div>
                        <div className="text-xs text-stone-500">Date: {receiptData.date}</div>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                        <span className="text-stone-400 font-semibold uppercase text-[10px]">Received From:</span>
                        <div className="font-bold text-sm text-stone-900">{receiptData.customerName}</div>
                        <div className="text-stone-600">{receiptData.address}</div>
                        <div className="text-stone-600">Phone: {receiptData.phone}</div>
                    </div>
                    <div className="space-y-1 text-right">
                        <span className="text-stone-400 font-semibold uppercase text-[10px]">Project Details:</span>
                        <div className="font-semibold text-stone-800">Consumer No: <span className="font-mono">{receiptData.consumerNo}</span></div>
                        <div className="text-stone-600">Capacity: {receiptData.capacityKw} kWp Rooftop Solar</div>
                        <div className="text-stone-600">Milestone: {receiptData.paymentStage}</div>
                    </div>
                </div>

                {/* Amount Table */}
                <div className="border border-stone-200 rounded-xl overflow-hidden text-xs">
                    <div className="bg-stone-100 p-3 font-semibold text-stone-700 flex justify-between">
                        <span>Description</span>
                        <span>Amount</span>
                    </div>
                    <div className="p-4 flex justify-between items-center border-t border-stone-200 bg-white">
                        <div>
                            <div className="font-bold text-stone-900">{receiptData.paymentStage}</div>
                            <div className="text-stone-500 text-[11px] mt-0.5">Mode: {receiptData.paymentMode} | Ref: {receiptData.transactionRef}</div>
                        </div>
                        <div className="text-xl font-black text-stone-900">
                            ₹{Number(receiptData.amount || 0).toLocaleString('en-IN')}
                        </div>
                    </div>
                </div>

                {/* Signatures */}
                <div className="pt-8 flex justify-between items-end text-xs border-t border-stone-100">
                    <div>
                        <div className="text-stone-400 text-[11px]">Authorized Signatory</div>
                        <div className="font-semibold text-stone-800 mt-6">SolarFlow Operations Team</div>
                    </div>
                    <div className="text-right">
                        <div className="w-32 border-b border-stone-400 mb-1" />
                        <div className="text-stone-400 text-[10px]">Customer / Depositor Signature</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. STAFF PAYMENT RECEIPT / SALARY VOUCHER
// ─────────────────────────────────────────────────────────────────────────────
function StaffReceiptGenerator({ currentUser }) {
    const [staffData, setStaffData] = useState({
        voucherNo: `SF-VOUCH-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toISOString().split('T')[0],
        employeeName: 'Ramesh Patel',
        employeeId: 'EMP-042',
        designation: 'Solar Site Engineer / Installer',
        paymentType: 'Site Visit & Installation Allowance',
        month: 'September 2026',
        amount: '18500',
        paymentMode: 'Direct Bank Transfer',
        notes: 'Payment for 5 site installations completed in Surat & Navsari.'
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
                <div>
                    <h2 className="text-lg font-bold text-stone-900">Staff Payment Voucher Generator</h2>
                    <p className="text-xs text-stone-500">Record salary, travel allowance, site commissions or advance vouchers for internal personnel.</p>
                </div>
                <button
                    onClick={() => window.print()}
                    className="sf-btn-primary"
                >
                    <Printer className="w-4 h-4" /> Print Payment Voucher
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-200 print:hidden text-xs">
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Employee Name</label>
                    <input
                        type="text"
                        value={staffData.employeeName}
                        onChange={e => setStaffData({ ...staffData, employeeName: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Designation</label>
                    <input
                        type="text"
                        value={staffData.designation}
                        onChange={e => setStaffData({ ...staffData, designation: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Payment Category</label>
                    <select
                        value={staffData.paymentType}
                        onChange={e => setStaffData({ ...staffData, paymentType: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    >
                        <option>Monthly Salary</option>
                        <option>Site Visit & Installation Allowance</option>
                        <option>Travel & Fuel Allowance (TA/DA)</option>
                        <option>Sales Commission / Incentive</option>
                        <option>Salary Advance</option>
                    </select>
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Amount Paid (₹)</label>
                    <input
                        type="number"
                        value={staffData.amount}
                        onChange={e => setStaffData({ ...staffData, amount: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white font-bold text-amber-700"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Payment Mode</label>
                    <input
                        type="text"
                        value={staffData.paymentMode}
                        onChange={e => setStaffData({ ...staffData, paymentMode: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Notes / Narration</label>
                    <input
                        type="text"
                        value={staffData.notes}
                        onChange={e => setStaffData({ ...staffData, notes: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
            </div>

            {/* Printable Voucher Card */}
            <ProfessionalDocument
                title="Staff Payment Voucher"
                documentNo={staffData.voucherNo}
                date={staffData.date}
                recipientLabel="Paid To"
                recipientLines={[staffData.employeeName, `Employee ID: ${staffData.employeeId}`, staffData.designation]}
                referenceLines={[`Payment period: ${staffData.month}`, `Payment mode: ${staffData.paymentMode}`, `Category: ${staffData.paymentType}`]}
                rows={[{ description: staffData.paymentType, details: staffData.notes, amount: money(staffData.amount) }]}
                totalLabel="Total Amount Paid"
                totalValue={money(staffData.amount)}
                notes={['The recipient confirms that the stated amount has been received for the purpose described above.']}
                signatures={['Prepared By (Accounts)', 'Authorized Signatory', 'Employee / Recipient']}
            />
            <div className="hidden max-w-2xl mx-auto p-6 bg-white border border-stone-300 rounded-2xl shadow-sm text-stone-800 space-y-4">
                <div className="flex justify-between items-center border-b border-stone-300 pb-3">
                    <div>
                        <div className="text-xl font-black text-stone-900">SOLARFLOW ENERGY</div>
                        <div className="text-[11px] text-stone-500 font-semibold uppercase">Staff Expense / Payment Voucher</div>
                    </div>
                    <div className="text-right text-xs">
                        <div className="font-bold text-stone-800">Voucher: <span className="font-mono">{staffData.voucherNo}</span></div>
                        <div className="text-stone-500">Date: {staffData.date}</div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs bg-stone-50 p-4 rounded-xl">
                    <div>
                        <span className="text-stone-400">Employee Name:</span>
                        <div className="font-bold text-stone-900">{staffData.employeeName}</div>
                        <div className="text-stone-500">{staffData.designation}</div>
                    </div>
                    <div className="text-right">
                        <span className="text-stone-400">Payment Type:</span>
                        <div className="font-bold text-stone-900">{staffData.paymentType}</div>
                        <div className="text-stone-500">Period: {staffData.month}</div>
                    </div>
                </div>

                <div className="p-4 border border-stone-200 rounded-xl flex justify-between items-center text-xs">
                    <div>
                        <span className="text-stone-500">Narration / Remark:</span>
                        <div className="font-medium text-stone-800">{staffData.notes}</div>
                        <div className="text-stone-400 text-[11px] mt-0.5">Mode: {staffData.paymentMode}</div>
                    </div>
                    <div className="text-right">
                        <span className="text-stone-400 text-[10px] uppercase font-bold">Total Amount Paid</span>
                        <div className="text-2xl font-black text-stone-900">₹{Number(staffData.amount || 0).toLocaleString('en-IN')}</div>
                    </div>
                </div>

                <div className="pt-8 flex justify-between items-end text-xs">
                    <div>
                        <div className="w-28 border-b border-stone-400 mb-1" />
                        <div className="text-stone-400 text-[10px]">Prepared By (Accounts)</div>
                    </div>
                    <div className="text-center">
                        <div className="w-28 border-b border-stone-400 mb-1" />
                        <div className="text-stone-400 text-[10px]">Authorized Signatory</div>
                    </div>
                    <div className="text-right">
                        <div className="w-28 border-b border-stone-400 mb-1" />
                        <div className="text-stone-400 text-[10px]">Employee Receiver Signature</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. VENDOR PAYMENT RECEIPT / VOUCHER
// ─────────────────────────────────────────────────────────────────────────────
function VendorReceiptGenerator({ currentUser }) {
    const [vendorData, setVendorData] = useState({
        voucherNo: `SF-VEND-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toISOString().split('T')[0],
        vendorName: 'Demo Vendor 1',
        serviceType: 'Module Mounting & Fabrication Work',
        siteReference: '3.3 kWp Project - Bhavesh Shah (Surat)',
        grossAmount: '24000',
        tdsDeduction: '480',
        paymentMode: 'NEFT / Bank Transfer',
        utrNo: 'AXISN09281948',
        status: 'Paid in Full'
    });

    const netPayable = (Number(vendorData.grossAmount) || 0) - (Number(vendorData.tdsDeduction) || 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
                <div>
                    <h2 className="text-lg font-bold text-stone-900">Vendor & Contractor Payment Voucher</h2>
                    <p className="text-xs text-stone-500">Record payments made to installation contractors, fabrication teams, and equipment suppliers.</p>
                </div>
                <button
                    onClick={() => window.print()}
                    className="sf-btn-primary"
                >
                    <Printer className="w-4 h-4" /> Print Vendor Voucher
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-200 print:hidden text-xs">
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Vendor Name</label>
                    <input
                        type="text"
                        value={vendorData.vendorName}
                        onChange={e => setVendorData({ ...vendorData, vendorName: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Work / Service Type</label>
                    <input
                        type="text"
                        value={vendorData.serviceType}
                        onChange={e => setVendorData({ ...vendorData, serviceType: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Site / Batch Reference</label>
                    <input
                        type="text"
                        value={vendorData.siteReference}
                        onChange={e => setVendorData({ ...vendorData, siteReference: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Gross Bill Amount (₹)</label>
                    <input
                        type="number"
                        value={vendorData.grossAmount}
                        onChange={e => setVendorData({ ...vendorData, grossAmount: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">TDS / Retention Deducted (₹)</label>
                    <input
                        type="number"
                        value={vendorData.tdsDeduction}
                        onChange={e => setVendorData({ ...vendorData, tdsDeduction: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">UTR / Ref No.</label>
                    <input
                        type="text"
                        value={vendorData.utrNo}
                        onChange={e => setVendorData({ ...vendorData, utrNo: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
            </div>

            {/* Printable Vendor Voucher */}
            <ProfessionalDocument
                title="Vendor Payment Voucher"
                documentNo={vendorData.voucherNo}
                date={vendorData.date}
                recipientLabel="Vendor / Contractor"
                recipientLines={[vendorData.vendorName, vendorData.serviceType, vendorData.siteReference]}
                referenceLines={[`Payment status: ${vendorData.status}`, `Payment mode: ${vendorData.paymentMode}`, `UTR / reference: ${vendorData.utrNo}`]}
                rows={[
                    { description: 'Gross work / service value', details: `${vendorData.serviceType} — ${vendorData.siteReference}`, amount: money(vendorData.grossAmount) },
                    { description: 'Less: TDS / retention deduction', details: 'Deduction from gross payable value', amount: `− ${money(vendorData.tdsDeduction)}` },
                ]}
                totalLabel="Net Amount Disbursed"
                totalValue={money(netPayable)}
                notes={['Payment is recorded against the referenced work assignment and banking reference.', 'The vendor confirms completion or acceptance of the work covered by this voucher.']}
                signatures={['Verified By', 'Authorized Signatory', 'Vendor Stamp / Signature']}
            />
            <div className="hidden max-w-2xl mx-auto p-6 bg-white border border-stone-300 rounded-2xl shadow-sm text-stone-800 space-y-4">
                <div className="flex justify-between items-center border-b border-stone-300 pb-3">
                    <div>
                        <div className="text-xl font-black text-stone-900">SOLARFLOW ENERGY</div>
                        <div className="text-[11px] text-stone-500 font-semibold uppercase">Vendor / Contractor Payment Certificate</div>
                    </div>
                    <div className="text-right text-xs">
                        <div className="font-bold text-stone-800">Voucher: <span className="font-mono">{vendorData.voucherNo}</span></div>
                        <div className="text-stone-500">Date: {vendorData.date}</div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs bg-stone-50 p-4 rounded-xl">
                    <div>
                        <span className="text-stone-400">Vendor / Payee:</span>
                        <div className="font-bold text-stone-900">{vendorData.vendorName}</div>
                        <div className="text-stone-500">Service: {vendorData.serviceType}</div>
                    </div>
                    <div className="text-right">
                        <span className="text-stone-400">Site Assignment:</span>
                        <div className="font-semibold text-stone-800">{vendorData.siteReference}</div>
                        <div className="text-stone-500">Bank Ref: {vendorData.utrNo}</div>
                    </div>
                </div>

                <div className="border border-stone-200 rounded-xl p-4 text-xs space-y-2">
                    <div className="flex justify-between text-stone-600">
                        <span>Gross Billed Amount:</span>
                        <span>₹{Number(vendorData.grossAmount || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                        <span>Less: TDS / Deductions:</span>
                        <span>- ₹{Number(vendorData.tdsDeduction || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-stone-200 text-sm font-bold text-stone-900">
                        <span>Net Amount Disbursed:</span>
                        <span className="text-base text-emerald-800 font-black">₹{netPayable.toLocaleString('en-IN')}</span>
                    </div>
                </div>

                <div className="pt-8 flex justify-between items-end text-xs">
                    <div>
                        <div className="w-28 border-b border-stone-400 mb-1" />
                        <div className="text-stone-400 text-[10px]">Verified By</div>
                    </div>
                    <div className="text-center">
                        <div className="w-28 border-b border-stone-400 mb-1" />
                        <div className="text-stone-400 text-[10px]">Authorized Signatory</div>
                    </div>
                    <div className="text-right">
                        <div className="w-28 border-b border-stone-400 mb-1" />
                        <div className="text-stone-400 text-[10px]">Vendor Stamp / Signature</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. WARRANTY CARD & CERTIFICATE
// ─────────────────────────────────────────────────────────────────────────────
function WarrantyCardGenerator({ currentUser }) {
    const [warranty, setWarranty] = useState({
        certNo: `SF-WAR-${Math.floor(1000 + Math.random() * 9000)}`,
        customerName: 'Rajesh Sharma',
        consumerNo: '02819482910',
        siteAddress: 'Plot 45, Green Park Society, Surat, Gujarat',
        installationDate: new Date().toISOString().split('T')[0],
        systemCapacity: '3.3 kWp',
        moduleBrand: 'SolarFlow Essential 550W Mono PERC',
        moduleSerial: 'SF550-2026-001 to SF550-2026-006 (6 Nos)',
        inverterBrand: 'SolarFlow 3.3kW On-Grid String Inverter',
        inverterSerial: 'INV-2026-9482',
        structureWarrantyYears: '5',
        inverterWarrantyYears: '10',
        panelProductWarrantyYears: '12',
        panelPerformanceWarrantyYears: '25'
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
                <div>
                    <h2 className="text-lg font-bold text-stone-900">Solar System Warranty Card & Certificate</h2>
                    <p className="text-xs text-stone-500">Official handover certificate covering Solar PV modules, inverter, structure and workmanship warranties.</p>
                </div>
                <button
                    onClick={() => window.print()}
                    className="sf-btn-primary shadow-sm"
                >
                    <Printer className="w-4 h-4" /> Print Warranty Certificate
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-200 print:hidden text-xs">
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Customer Name</label>
                    <input
                        type="text"
                        value={warranty.customerName}
                        onChange={e => setWarranty({ ...warranty, customerName: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Consumer No.</label>
                    <input
                        type="text"
                        value={warranty.consumerNo}
                        onChange={e => setWarranty({ ...warranty, consumerNo: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Installation Date</label>
                    <input
                        type="date"
                        value={warranty.installationDate}
                        onChange={e => setWarranty({ ...warranty, installationDate: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">PV Modules Make & Model</label>
                    <input
                        type="text"
                        value={warranty.moduleBrand}
                        onChange={e => setWarranty({ ...warranty, moduleBrand: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Inverter Make & Serial</label>
                    <input
                        type="text"
                        value={warranty.inverterBrand}
                        onChange={e => setWarranty({ ...warranty, inverterBrand: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Plant Capacity</label>
                    <input
                        type="text"
                        value={warranty.systemCapacity}
                        onChange={e => setWarranty({ ...warranty, systemCapacity: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
            </div>

            {/* Printable Warranty Certificate */}
            <ProfessionalDocument
                title="Warranty Certificate"
                documentNo={warranty.certNo}
                date={warranty.installationDate}
                recipientLabel="System Owner"
                recipientLines={[warranty.customerName, warranty.siteAddress, `Consumer No.: ${warranty.consumerNo}`]}
                referenceLines={[`Plant capacity: ${warranty.systemCapacity}`, `Commissioning date: ${warranty.installationDate}`, 'System type: Grid-interactive rooftop solar PV']}
                amountHeading="Warranty Coverage"
                rows={[
                    { description: 'Solar PV modules', details: `${warranty.moduleBrand} · Serial(s): ${warranty.moduleSerial} · Product warranty: ${warranty.panelProductWarrantyYears} years`, amount: `${warranty.panelPerformanceWarrantyYears} years` },
                    { description: 'Solar inverter', details: `${warranty.inverterBrand} · Serial: ${warranty.inverterSerial}`, amount: `${warranty.inverterWarrantyYears} years` },
                    { description: 'Mounting structure & workmanship', details: 'Hot-dip GI structure, civil installation and workmanship', amount: `${warranty.structureWarrantyYears} years` },
                ]}
                notes={['Module performance coverage remains subject to the manufacturer’s published warranty conditions.', 'Keep modules clean and provide safe site access for inspection and service.', 'For service assistance, contact SolarFlow Energy with the certificate number and equipment serial number.']}
                signatures={['Technical Head', 'Authorized Signatory & Seal', 'Customer Acknowledgement']}
            />
            <div className="hidden max-w-3xl mx-auto p-10 bg-white border-4 border-double border-amber-600/60 rounded-3xl shadow-sm text-stone-800 space-y-6">
                <div className="text-center space-y-1 border-b border-stone-200 pb-5">
                    <div className="flex items-center justify-center gap-2 text-amber-600 font-bold text-xs uppercase tracking-widest">
                        <ShieldCheck className="w-5 h-5" /> Official Quality Assurance
                    </div>
                    <div className="text-3xl font-black text-stone-900 tracking-tight">WARRANTY CERTIFICATE</div>
                    <p className="text-xs text-stone-500">SOLARFLOW ROOFTOP SOLAR PHOTOVOLTAIC POWER SYSTEM</p>
                    <div className="text-[10px] font-mono text-stone-400">Certificate No: {warranty.certNo} | Date: {warranty.installationDate}</div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs bg-stone-50/80 p-4 rounded-xl border border-stone-100">
                    <div>
                        <span className="text-stone-400 text-[10px] font-bold uppercase">Customer Details</span>
                        <div className="font-bold text-stone-900 text-sm">{warranty.customerName}</div>
                        <div className="text-stone-600">{warranty.siteAddress}</div>
                        <div className="text-stone-600">Consumer No: {warranty.consumerNo}</div>
                    </div>
                    <div className="text-right">
                        <span className="text-stone-400 text-[10px] font-bold uppercase">Commissioning Details</span>
                        <div className="font-bold text-stone-900 text-sm">Capacity: {warranty.systemCapacity}</div>
                        <div className="text-stone-600">Commissioned: {warranty.installationDate}</div>
                        <div className="text-emerald-700 font-semibold">Grid-Interactive System</div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="text-xs font-bold uppercase text-stone-900 tracking-wider">Equipment Warranty Coverage</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="p-3 border border-stone-200 rounded-xl bg-white">
                            <div className="font-bold text-stone-900">Solar PV Modules</div>
                            <div className="text-stone-500 text-[11px] mt-0.5">{warranty.moduleBrand}</div>
                            <div className="mt-2 text-amber-700 font-bold text-sm">{warranty.panelPerformanceWarrantyYears} Years</div>
                            <div className="text-[10px] text-stone-400">Linear Peak Output Warranty (≥80% at year 25)</div>
                        </div>

                        <div className="p-3 border border-stone-200 rounded-xl bg-white">
                            <div className="font-bold text-stone-900">Solar Inverter</div>
                            <div className="text-stone-500 text-[11px] mt-0.5">{warranty.inverterBrand}</div>
                            <div className="mt-2 text-amber-700 font-bold text-sm">{warranty.inverterWarrantyYears} Years</div>
                            <div className="text-[10px] text-stone-400">Manufacturer Replacement Warranty</div>
                        </div>

                        <div className="p-3 border border-stone-200 rounded-xl bg-white">
                            <div className="font-bold text-stone-900">Structure & Workmanship</div>
                            <div className="text-stone-500 text-[11px] mt-0.5">Hot-Dip GI & Civil Installation</div>
                            <div className="mt-2 text-amber-700 font-bold text-sm">{warranty.structureWarrantyYears} Years</div>
                            <div className="text-[10px] text-stone-400">Corrosion & Workmanship Warranty</div>
                        </div>
                    </div>
                </div>

                <div className="text-[11px] text-stone-500 bg-stone-50 p-3 rounded-xl space-y-1">
                    <div className="font-semibold text-stone-700">Helpline & Service Terms:</div>
                    <div>• For annual maintenance or service assistance, call: <strong>+91 98765 43210</strong> or email <strong>support@solarflow.example</strong>.</div>
                    <div>• Regular dust cleaning of module surfaces ensures peak power generation.</div>
                </div>

                <div className="pt-8 flex justify-between items-end text-xs">
                    <div>
                        <div className="w-36 border-b border-stone-400 mb-1" />
                        <div className="text-stone-600 font-semibold">Technical Head</div>
                        <div className="text-stone-400 text-[10px]">SolarFlow Engineering Division</div>
                    </div>
                    <div className="text-right">
                        <div className="w-36 border-b border-stone-400 mb-1" />
                        <div className="text-stone-600 font-semibold">Authorized Signatory & Seal</div>
                        <div className="text-stone-400 text-[10px]">SolarFlow Energy</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. 1-PAGE QUICK QUOTATION
// ─────────────────────────────────────────────────────────────────────────────
function OnePageQuotationGenerator({ currentUser }) {
    const [quote, setQuote] = useState({
        quoteNo: `SF-Q-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toISOString().split('T')[0],
        customerName: 'Kishore Trivedi',
        customerPhone: '9825012345',
        city: 'Ahmedabad, Gujarat',
        systemCapacityKw: '3.3',
        moduleType: '550W Tier-1 Bi-Facial Mono PERC (6 Panels)',
        inverterType: '3.3 kW Single Phase Grid-Tied Inverter',
        grossPrice: '198000',
        centralSubsidy: '78000',
        discomCharges: 'Included',
        structureType: 'Elevated GI Structure (8 ft Ground Clearance)'
    });

    const netPayable = (Number(quote.grossPrice) || 0) - (Number(quote.centralSubsidy) || 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
                <div>
                    <h2 className="text-lg font-bold text-stone-900">1-Page Quick Quotation Proposal</h2>
                    <p className="text-xs text-stone-500">Fast, 1-page commercial offer summary for instant on-site customer presentation and closing.</p>
                </div>
                <button
                    onClick={() => window.print()}
                    className="sf-btn-primary shadow-sm"
                >
                    <Printer className="w-4 h-4" /> Print 1-Page Quotation
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-200 print:hidden text-xs">
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Customer Name</label>
                    <input
                        type="text"
                        value={quote.customerName}
                        onChange={e => setQuote({ ...quote, customerName: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Phone Number</label>
                    <input
                        type="text"
                        value={quote.customerPhone}
                        onChange={e => setQuote({ ...quote, customerPhone: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">City / Location</label>
                    <input
                        type="text"
                        value={quote.city}
                        onChange={e => setQuote({ ...quote, city: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">System Capacity (kW)</label>
                    <input
                        type="number"
                        step="0.1"
                        value={quote.systemCapacityKw}
                        onChange={e => setQuote({ ...quote, systemCapacityKw: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">Gross Project Cost (₹)</label>
                    <input
                        type="number"
                        step="1000"
                        value={quote.grossPrice}
                        onChange={e => setQuote({ ...quote, grossPrice: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
                <div>
                    <label className="font-semibold text-stone-600 block mb-1">PM Surya Ghar Subsidy (₹)</label>
                    <input
                        type="number"
                        step="1000"
                        value={quote.centralSubsidy}
                        onChange={e => setQuote({ ...quote, centralSubsidy: e.target.value })}
                        className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    />
                </div>
            </div>

            {/* Printable 1-Page Quotation */}
            <ProfessionalDocument
                title="Solar Project Quotation"
                documentNo={quote.quoteNo}
                date={quote.date}
                recipientLabel="Quotation For"
                recipientLines={[quote.customerName, quote.city, `Mobile: ${quote.customerPhone}`]}
                referenceLines={[`Proposed capacity: ${quote.systemCapacityKw} kWp on-grid`, `Estimated generation: ${Math.round(Number(quote.systemCapacityKw) * 125)} units / month`, 'Offer validity: 15 days from issue date']}
                rows={[
                    { description: `${quote.systemCapacityKw} kWp turnkey rooftop solar power plant`, details: `${quote.moduleType}; ${quote.inverterType}; ${quote.structureType}`, amount: money(quote.grossPrice) },
                    { description: 'Government subsidy benefit', details: 'Estimated PM Surya Ghar subsidy, subject to eligibility and approval', amount: `− ${money(quote.centralSubsidy)}` },
                ]}
                totalLabel="Net Cost to Customer"
                totalValue={money(netPayable)}
                notes={['Price includes solar modules, inverter, mounting structure, BOS protection, delivery, installation and commissioning.', `DISCOM and net-metering scope: ${quote.discomCharges}.`, 'Subsidy is credited by the competent authority and remains subject to scheme eligibility, inspection and approval.']}
                signatures={['Prepared By / Sales', 'Authorized Signatory', 'Customer Acceptance']}
            />
            <div className="hidden max-w-3xl mx-auto p-8 bg-white border border-stone-300 rounded-2xl shadow-sm text-stone-800 space-y-6">
                <div className="flex justify-between items-start border-b-2 border-stone-900 pb-4">
                    <div>
                        <div className="text-2xl font-black text-stone-900">SOLARFLOW ENERGY</div>
                        <p className="text-xs text-stone-500 font-medium">Turnkey Rooftop Solar Power Plant Proposal</p>
                        <p className="text-[11px] text-stone-400">www.solarflow.example | Helpline: +91 98765 43210</p>
                    </div>
                    <div className="text-right">
                        <span className="inline-block px-3 py-1 bg-amber-500 text-stone-900 text-xs font-bold uppercase rounded-md">
                            Proposal / Offer
                        </span>
                        <div className="text-xs font-semibold text-stone-700 mt-2">Ref: <span className="font-mono">{quote.quoteNo}</span></div>
                        <div className="text-xs text-stone-500">Date: {quote.date}</div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs bg-stone-50 p-4 rounded-xl border border-stone-100">
                    <div>
                        <span className="text-stone-400 text-[10px] uppercase font-bold">Proposal For:</span>
                        <div className="font-bold text-sm text-stone-900">{quote.customerName}</div>
                        <div className="text-stone-600">{quote.city}</div>
                        <div className="text-stone-600">Mobile: {quote.customerPhone}</div>
                    </div>
                    <div className="text-right">
                        <span className="text-stone-400 text-[10px] uppercase font-bold">Proposed Solar Plant:</span>
                        <div className="font-black text-lg text-amber-900">{quote.systemCapacityKw} kWp On-Grid</div>
                        <div className="text-stone-600 text-[11px]">Est. Generation: ~{Math.round(Number(quote.systemCapacityKw) * 125)} Units / Month</div>
                        <div className="text-emerald-700 font-semibold text-[11px]">Est. Bill Savings: ~₹{Math.round(Number(quote.systemCapacityKw) * 125 * 7.5).toLocaleString('en-IN')} / mo</div>
                    </div>
                </div>

                {/* Technical Specifications */}
                <div className="space-y-2">
                    <div className="text-xs font-bold uppercase text-stone-900 tracking-wider">Technical Specifications Included:</div>
                    <table className="w-full text-xs border border-stone-200 rounded-xl overflow-hidden">
                        <tbody>
                            <tr className="border-b border-stone-100"><td className="p-2.5 bg-stone-50 font-semibold w-1/3">Solar Modules</td><td className="p-2.5">{quote.moduleType} (25 Yrs Warranty)</td></tr>
                            <tr className="border-b border-stone-100"><td className="p-2.5 bg-stone-50 font-semibold">Inverter</td><td className="p-2.5">{quote.inverterType} (10 Yrs Warranty)</td></tr>
                            <tr className="border-b border-stone-100"><td className="p-2.5 bg-stone-50 font-semibold">Mounting Structure</td><td className="p-2.5">{quote.structureType}</td></tr>
                            <tr className="border-b border-stone-100"><td className="p-2.5 bg-stone-50 font-semibold">BOS & Protection</td><td className="p-2.5">ACDB, DCDB, SPD, Dual Chemical Earthing, Lightning Arrester</td></tr>
                            <tr><td className="p-2.5 bg-stone-50 font-semibold">Discom Liasoning</td><td className="p-2.5">Net-metering application, inspection & meter synchronization included</td></tr>
                        </tbody>
                    </table>
                </div>

                {/* Commercial Breakdown */}
                <div className="border-2 border-stone-900 rounded-2xl p-5 bg-stone-50/50 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-stone-600 font-medium">Gross Turnkey Project Cost (Inclusive of GST):</span>
                        <span className="text-sm font-bold text-stone-900">₹{Number(quote.grossPrice).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-emerald-700 font-medium">
                        <span>Less: PM Surya Ghar Central Govt. Direct Subsidy:</span>
                        <span className="text-sm font-bold">- ₹{Number(quote.centralSubsidy).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t-2 border-stone-900">
                        <div>
                            <span className="text-sm font-black text-stone-900 uppercase tracking-wide">Net Cost to Customer:</span>
                            <div className="text-[10px] text-stone-500">Includes complete hardware, delivery, civil structure, installation & 5-year free maintenance</div>
                        </div>
                        <div className="text-2xl font-black text-stone-900">
                            ₹{netPayable.toLocaleString('en-IN')}
                        </div>
                    </div>
                </div>

                <div className="pt-6 flex justify-between items-end text-xs border-t border-stone-100">
                    <div>
                        <div className="font-semibold text-stone-800">SolarFlow Sales Representative</div>
                        <div className="text-stone-400 text-[10px]">Offer Valid for 15 Days from Date of Issue</div>
                    </div>
                    <div className="text-right">
                        <div className="font-semibold text-stone-800">Customer Acceptance Signature</div>
                        <div className="text-stone-400 text-[10px]">Date: ________________________</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
