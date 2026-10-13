import { STAGE_BY_ID, STAGE_IDS, customFieldsForStage, isOn } from '../config/index.js';
import { lazyWithRetry, LazyBoundary } from '../lib/lazy.js';
import { LoadingState } from '../ui/index.js';

// One chunk per stage tab, fetched the first time that tab opens. A stage the
// client switched off never renders here, so its code is never downloaded.
const STAGE_TABS = {
    [STAGE_IDS.LEADS]: lazyWithRetry(() => import('./modal-tabs/LeadsTab')),
    [STAGE_IDS.REGISTRATION]: lazyWithRetry(() => import('./modal-tabs/RegistrationTab')),
    [STAGE_IDS.LOAN]: lazyWithRetry(() => import('./modal-tabs/LoanTab')),
    [STAGE_IDS.CASH]: lazyWithRetry(() => import('./modal-tabs/CashTab')),
    [STAGE_IDS.MATERIAL_ORDER]: lazyWithRetry(() => import('./modal-tabs/MaterialOrderTab')),
    [STAGE_IDS.MATERIAL_INTEGRATION]: lazyWithRetry(() => import('./modal-tabs/MaterialIntegrationTab')),
    [STAGE_IDS.MATERIAL_DELIVERY]: lazyWithRetry(() => import('./modal-tabs/MaterialDeliveryTab')),
    [STAGE_IDS.INSTALLATION_STATUS]: lazyWithRetry(() => import('./modal-tabs/InstallationStatusTab')),
    [STAGE_IDS.GEO_TAG_PHOTO]: lazyWithRetry(() => import('./modal-tabs/GeoTagPhotoTab')),
    [STAGE_IDS.DISCOM_SUBMISSION]: lazyWithRetry(() => import('./modal-tabs/DiscomSubmissionTab')),
    [STAGE_IDS.METER_INSTALLATION]: lazyWithRetry(() => import('./modal-tabs/MeterInstallationTab')),
    [STAGE_IDS.DISCOM_INSPECTION]: lazyWithRetry(() => import('./modal-tabs/DiscomInspectionTab')),
    [STAGE_IDS.SUBSIDY_STATUS]: lazyWithRetry(() => import('./modal-tabs/SubsidyStatusTab')),
    [STAGE_IDS.FINAL_REVIEW]: lazyWithRetry(() => import('./modal-tabs/FinalReviewTab')),
    [STAGE_IDS.LOST_PROJECT]: lazyWithRetry(() => import('./modal-tabs/HoldProcurementTab')),
};
const CustomStageTab = lazyWithRetry(() => import('./modal-tabs/CustomStageTab'));
const CustomFieldsSection = lazyWithRetry(() => import('./modal-tabs/CustomFieldsSection'));

const hasCustomFields = stageId => customFieldsForStage(stageId).some(field => field.type !== 'file' || isOn('documentUploads'));

export default function CustomerModalTabsRouter(props) {
    const { activeTab } = props;
    const stage = STAGE_BY_ID[activeTab];
    if (!stage || stage.id === STAGE_IDS.COMPLETED) return null;

    const BuiltinTab = stage.custom ? null : STAGE_TABS[stage.id];
    // The CPO manager may only tick the SFDC photo in Installation Status.
    const tabProps = stage.id === STAGE_IDS.INSTALLATION_STATUS ? { ...props, isEditable: props.isInstallationDetailsEditable } : props;

    return (
        <LazyBoundary key={stage.id} fallback={<LoadingState label="Loading this stage…" />}>
            {stage.custom ? <CustomStageTab {...props} /> : BuiltinTab && <BuiltinTab {...tabProps} />}
            {!stage.custom && hasCustomFields(stage.id) && (
                <CustomFieldsSection
                    {...props}
                    stageId={stage.id}
                    isEditable={props.isEditable && stage.id !== STAGE_IDS.LOST_PROJECT}
                />
            )}
        </LazyBoundary>
    );
}
