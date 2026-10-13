import { ClipboardList } from 'lucide-react';
import { STAGE_BY_ID, customFieldsForStage, isOn } from '../../config/index.js';
import { EmptyState } from '../../ui/index.js';
import CustomFieldsSection from './CustomFieldsSection';

// A stage the client added in setup: its guidance and its extra fields.
export default function CustomStageTab(props) {
    const stage = STAGE_BY_ID[props.activeTab];
    if (!stage) return null;
    const hasFields = customFieldsForStage(stage.id).some(field => field.type !== 'file' || isOn('documentUploads'));

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {hasFields ? (
                <CustomFieldsSection {...props} stageId={stage.id} title={stage.label} subtitle={stage.guidance} icon={stage.icon || ClipboardList} />
            ) : (
                <EmptyState icon={stage.icon || ClipboardList} title={stage.label}>
                    {stage.guidance || 'Nothing to fill in at this stage. Add a stage remark above if needed, then move the customer on.'}
                </EmptyState>
            )}
        </div>
    );
}
