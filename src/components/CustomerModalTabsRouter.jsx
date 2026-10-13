import React from 'react';
import { STAGE_IDS } from "../constants";
import LeadsTab from './modal-tabs/LeadsTab';
import RegistrationTab from './modal-tabs/RegistrationTab';
import LoanTab from './modal-tabs/LoanTab';
import CashTab from './modal-tabs/CashTab';
import MaterialOrderTab from './modal-tabs/MaterialOrderTab';
import MaterialIntegrationTab from './modal-tabs/MaterialIntegrationTab';
import HoldProcurementTab from './modal-tabs/HoldProcurementTab';
import MaterialDeliveryTab from './modal-tabs/MaterialDeliveryTab';
import InstallationStatusTab from './modal-tabs/InstallationStatusTab';
import GeoTagPhotoTab from './modal-tabs/GeoTagPhotoTab';
import DiscomSubmissionTab from './modal-tabs/DiscomSubmissionTab';
import MeterInstallationTab from './modal-tabs/MeterInstallationTab';
import DiscomInspectionTab from './modal-tabs/DiscomInspectionTab';
import SubsidyStatusTab from './modal-tabs/SubsidyStatusTab';
import FinalReviewTab from './modal-tabs/FinalReviewTab';

export default function CustomerModalTabsRouter(props) {
    const { activeTab } = props;

    return (
        <>
            {activeTab === STAGE_IDS.LEADS && <LeadsTab {...props} />}
            {activeTab === STAGE_IDS.REGISTRATION && <RegistrationTab {...props} />}
            {activeTab === STAGE_IDS.LOAN && <LoanTab {...props} />}
            {activeTab === STAGE_IDS.CASH && <CashTab {...props} />}
            {activeTab === STAGE_IDS.MATERIAL_ORDER && <MaterialOrderTab {...props} />}
            {activeTab === STAGE_IDS.MATERIAL_INTEGRATION && <MaterialIntegrationTab {...props} />}
            {(activeTab === STAGE_IDS.LOST_PROJECT) && <HoldProcurementTab {...props} />}
            {activeTab === STAGE_IDS.MATERIAL_DELIVERY && <MaterialDeliveryTab {...props} />}
            {activeTab === STAGE_IDS.INSTALLATION_STATUS && (
                <InstallationStatusTab {...props} isEditable={props.isInstallationDetailsEditable} />
            )}
            {activeTab === STAGE_IDS.GEO_TAG_PHOTO && <GeoTagPhotoTab {...props} />}
            {activeTab === STAGE_IDS.DISCOM_SUBMISSION && <DiscomSubmissionTab {...props} />}
            {activeTab === STAGE_IDS.METER_INSTALLATION && <MeterInstallationTab {...props} />}
            {activeTab === STAGE_IDS.DISCOM_INSPECTION && <DiscomInspectionTab {...props} />}
            {activeTab === STAGE_IDS.SUBSIDY_STATUS && <SubsidyStatusTab {...props} />}
            {activeTab === STAGE_IDS.FINAL_REVIEW && <FinalReviewTab {...props} />}
        </>
    );
}
