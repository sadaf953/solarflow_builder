import { useMemo, useState } from 'react';
// ─── DashboardView.jsx ────────────────────────────────────────────────────────
// Metrics overview: project counts, financial summary, stage pipeline bar chart.
// • "Total" = all non-deleted records
// • "Live"  = non-deleted AND stage !== 'Completed'
// • "Completed" = stage === 'Completed' (non-deleted)
// Numbers use Indian locale (₹1,00,000)
// ──────────────────────────────────────────────────────────────────────────────

import { FolderOpen, Activity, CheckCircle2, XCircle, PanelsTopLeft, Zap, Gauge, CircuitBoard, CalendarPlus, BadgeCheck, ListChecks, Truck } from 'lucide-react';
import { PRIMARY_STAGES } from '../constants';
import { formatINRCompact } from '../utils';
import CustomizationEnquiryForm from './CustomizationEnquiryForm';

const fmtLakh = formatINRCompact;

const MetricBox = ({ label, value, sub, icon: Icon, color }) => {
    const colorMap = {
        neutral: 'bg-stone-100 text-stone-600',
        amber:   'bg-amber-50 text-amber-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        blue:    'bg-sky-50 text-sky-600',
        rose:    'bg-rose-50 text-rose-600',
    };
    return (
        <div className="bg-white p-6 rounded-[28px] border border-stone-100 shadow-sm">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${colorMap[color] || colorMap.neutral}`}>
                <Icon size={16} />
            </div>
            <p className="text-2xl font-bold text-stone-800 tracking-tight">{value}</p>
            {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">{label}</p>
        </div>
    );
};

const formatNumber = value => Number(value || 0).toLocaleString('en-IN');

const EquipmentMetric = ({ label, value, sub, icon: Icon, tone }) => {
    const tones = {
        orange: 'bg-orange-50 text-orange-600',
        yellow: 'bg-yellow-50 text-yellow-700',
        green: 'bg-green-50 text-green-700',
        blue: 'bg-blue-50 text-blue-700',
    };
    return <div className="min-w-0 p-5 rounded-2xl border border-stone-200 bg-white">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tones[tone] || tones.orange}`}>
            <Icon size={18} aria-hidden="true" />
        </div>
        <p className="mt-4 text-2xl font-bold text-stone-900 truncate" title={String(value)}>{value}</p>
        <p className="mt-1 text-xs font-semibold text-stone-700">{label}</p>
        <p className="mt-1 text-xs text-stone-500 leading-relaxed">{sub}</p>
    </div>;
};

const EquipmentMix = ({ title, items, unit, color }) => {
    const bar = color === 'green' ? 'bg-green-500' : 'bg-orange-500';
    return <div className="min-w-0">
        <h4 className="text-xs font-bold text-stone-800">{title}</h4>
        <div className="mt-4 space-y-4">
            {items.length ? items.map(item => <div key={item.name}>
                <div className="flex items-center justify-between gap-4 text-xs">
                    <span className="font-semibold text-stone-700 truncate" title={item.name}>{item.name}</span>
                    <span className="text-stone-500 whitespace-nowrap">{formatNumber(item.count)} {unit}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-stone-100 overflow-hidden">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(item.percentage, 3)}%` }} />
                </div>
            </div>) : <p className="text-sm text-stone-500">No equipment details recorded yet.</p>}
        </div>
    </div>;
};

const TodayMetric = ({ label, value, sub, icon: Icon, tone }) => {
    const tones = {
        orange: 'bg-orange-50 text-orange-600',
        green: 'bg-emerald-50 text-emerald-600',
        yellow: 'bg-yellow-50 text-yellow-700',
        blue: 'bg-sky-50 text-sky-600',
    };
    return <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tones[tone] || tones.orange}`}>
            <Icon size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0">
            <p className="text-xl font-bold text-stone-900">{formatNumber(value)}</p>
            <p className="text-xs font-semibold text-stone-700">{label}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{sub}</p>
        </div>
    </div>;
};

export default function DashboardView({ metrics, loading, scoped = false }) {
    const [showEnquiryModal, setShowEnquiryModal] = useState(false);
    const {
        totalProjects = 0,
        completedCount = 0,
        liveProjects = 0,
        loanCount = 0,
        cashCount = 0,
        stageCounts = {}
    } = metrics || {};
    const equipment = metrics?.solarEquipment;
    const today = metrics?.todaySummary;

    // Loan vs Cash (memoized)
    const { loanPerc, cashPerc } = useMemo(() => {
        const totalCategorized = loanCount + cashCount;
        const loanPerc = totalCategorized > 0 ? (loanCount / totalCategorized) * 100 : 0;
        const cashPerc = totalCategorized > 0 ? (cashCount / totalCategorized) * 100 : 0;
        return { loanPerc, cashPerc };
    }, [loanCount, cashCount]);

    if (!metrics) return (
        <div className="p-20 text-center text-stone-400 font-medium italic animate-pulse">
            Loading project summary…
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Customization enquiry modal and banner commented out
            {showEnquiryModal && (
                <CustomizationEnquiryForm isModal={true} onClose={() => setShowEnquiryModal(false)} />
            )}

            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-black text-base flex-shrink-0 shadow-sm">
                        ☀️
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">Customized per your business workflow</h4>
                        <p className="text-xs text-stone-600 mt-0.5">
                            Available with a clean fresh database or full historical data migration. Basic &amp; Advance versions tailored to your needs.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={() => setShowEnquiryModal(true)}
                        className="flex-shrink-0 bg-stone-900 hover:bg-stone-800 text-amber-400 hover:text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                        <span>Custom Setup / Enquiry →</span>
                    </button>
                    <a
                        href="mailto:enquiry@deeprootsystems.in"
                        className="flex-shrink-0 text-stone-500 hover:text-stone-800 text-xs font-semibold px-2 py-1 transition-all"
                    >
                        enquiry@deeprootsystems.in
                    </a>
                </div>
            </div>
            */}

            {/* Project counts */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <MetricBox label={scoped ? "My Office & Dealers" : "Total projects"} value={totalProjects}  icon={FolderOpen}   color="neutral"    sub={`${liveProjects} projects in progress`} />
                <MetricBox label="Projects in progress"  value={liveProjects}   icon={Activity}     color="amber"   sub="Excluding completed and lost" />
                <MetricBox label="Completed"      value={completedCount} icon={CheckCircle2} color="emerald" sub="Installation completed" />
                <MetricBox label="Lost Projects" value={metrics.lostCount ?? stageCounts['LOST PROJECT'] ?? 0} icon={XCircle} color="rose" sub="Projects marked lost" />
            </div>

            {/* Today's operational picture */}
            <section className="rounded-[28px] border border-stone-200 bg-stone-50 p-5 md:p-6" aria-labelledby="today-summary-title">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">Today</p>
                        <h3 id="today-summary-title" className="mt-1 text-lg font-bold text-stone-900">What needs attention today</h3>
                    </div>
                    {today?.date && <p className="text-xs text-stone-500">{new Date(`${today.date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
                </div>
                {!today ? <div className="py-8 text-center text-sm text-stone-500" role="status">Loading today’s activity…</div> : (
                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        <TodayMetric label="Registered today" value={today.registeredToday} sub="Projects with today’s registration date" icon={CalendarPlus} tone="orange" />
                        <TodayMetric label="Installed today" value={today.installedToday} sub="Installations marked complete today" icon={BadgeCheck} tone="green" />
                        <TodayMetric label="Installed in live projects" value={today.installedLive} sub="Installed projects still moving through approvals" icon={ListChecks} tone="yellow" />
                        <TodayMetric
                            label="Deliveries due today"
                            value={today.deliveriesDueToday}
                            sub={today.canViewDeliveries ? `${formatNumber(today.deliveryProjectsToday)} projects scheduled across today’s trips` : 'Available to Admin and Office users'}
                            icon={Truck}
                            tone="blue"
                        />
                    </div>
                )}
            </section>

            {/* Solar equipment overview */}
            <section className="bg-white rounded-[28px] p-6 md:p-8 border border-stone-200" aria-labelledby="solar-equipment-title">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                    <div>
                        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Solar equipment</p>
                        <h3 id="solar-equipment-title" className="mt-1 text-xl font-bold text-stone-900">What projects are using</h3>
                    </div>
                    <p className="text-xs text-stone-500">Calculated from active and completed project records</p>
                </div>

                {!equipment ? <div className="mt-6 py-8 text-center text-sm text-stone-500" role="status">Loading solar equipment summary…</div> : <>
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        <EquipmentMetric
                            label="Panels across projects"
                            value={formatNumber(equipment.panelsAcrossProjects)}
                            sub={`${formatNumber(equipment.completedPanels)} installed on completed projects`}
                            icon={PanelsTopLeft}
                            tone="orange"
                        />
                        <EquipmentMetric
                            label="Most-used panel brand"
                            value={equipment.topPanelBrand?.name || 'Not recorded'}
                            sub={equipment.topPanelBrand ? `${formatNumber(equipment.topPanelBrand.count)} panels across projects` : 'Add panel details to project records'}
                            icon={CircuitBoard}
                            tone="yellow"
                        />
                        <EquipmentMetric
                            label="Most-used inverter"
                            value={equipment.topInverterBrand?.name || 'Not recorded'}
                            sub={equipment.topInverterBrand ? `Selected in ${formatNumber(equipment.topInverterBrand.count)} projects` : 'Add inverter details during integration'}
                            icon={Zap}
                            tone="green"
                        />
                        <EquipmentMetric
                            label="Installed capacity"
                            value={`${formatNumber(equipment.installedCapacityKwp)} kWp`}
                            sub={`${formatNumber(equipment.averageSystemKwp)} kWp average project size`}
                            icon={Gauge}
                            tone="blue"
                        />
                    </div>

                    <div className="mt-7 pt-7 border-t border-stone-200 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                        <EquipmentMix title="Panel usage by brand" items={equipment.panelMix} unit="panels" color="orange" />
                        <EquipmentMix title="Inverter preference" items={equipment.inverterMix} unit="projects" color="green" />
                    </div>
                </>}
            </section>

            {/* Financial Analytics */}
            <div className="bg-white rounded-[32px] p-8 border border-stone-100 shadow-sm">
                <h3 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-6">How customers are paying</h3>
                <div className="flex justify-between items-end mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span>Loan ({loanCount})</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        <span>Cash ({cashCount})</span>
                    </div>
                </div>
                <div className="h-4 bg-stone-100 rounded-full overflow-hidden flex">
                    {loanPerc > 0 && (
                        <div
                            className="h-full bg-emerald-500 transition-all duration-500 flex items-center justify-center text-[9px] font-bold text-white"
                            style={{ width: `${loanPerc}%` }}
                        >
                            {loanPerc > 15 ? `${loanPerc.toFixed(0)}%` : ''}
                        </div>
                    )}
                    {cashPerc > 0 && (
                        <div
                            className="h-full bg-amber-500 transition-all duration-500 flex items-center justify-center text-[9px] font-bold text-white"
                            style={{ width: `${cashPerc}%` }}
                        >
                            {cashPerc > 15 ? `${cashPerc.toFixed(0)}%` : ''}
                        </div>
                    )}
                </div>
            </div>

            {/* Stage pipeline bar chart */}
            <div className="bg-white rounded-[32px] p-8 border border-stone-100 shadow-sm">
                <h3 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-8">Projects by stage</h3>
                <div className="space-y-5">
                    {PRIMARY_STAGES.map(stage => {
                        const count = stageCounts[stage.id] || 0;
                        const perc  = totalProjects > 0 ? (count / totalProjects) * 100 : 0;
                        return (
                            <div key={stage.id} className="group">
                                <div className="flex justify-between text-[10px] font-bold text-stone-600 mb-1.5 uppercase tracking-tight">
                                    <span className="group-hover:text-amber-600 transition-colors">{stage.label}</span>
                                    <span className="text-stone-400">{count}</span>
                                </div>
                                <div className="h-1.5 bg-stone-50 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-1000 rounded-full ${stage.id === 'COMPLETED' ? 'bg-emerald-400' : 'bg-amber-400'}`}
                                        style={{ width: `${perc}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
