// The subsidy, loan and installation trackers: one TagTrackingView, three configs.
import { IndianRupee, Tag, Wrench } from 'lucide-react';
import {
    INSTALLATION_TAGS, INSTALLATION_TAG_COLORS, LOAN_TAGS, LOAN_TAG_COLORS, SUBSIDY_TAGS, SUBSIDY_TAG_COLORS,
} from '../constants';

/**
 * column       the admin column holding the tag
 * activeOnly   leave out COMPLETED projects (list and per-tag counts)
 * total        'tagged' = every row with a tag; 'loan' = LOAN-stage rows plus
 *              tagged rows outside the LOAN and COMPLETED stages
 * aliases      older stored values that mean a tag ({ tagId: storedValue })
 * dropBlank    hide rows whose tag is only spaces (the database filter keeps them)
 * card         'stage' shows the current stage; 'installation' shows delivery date and installer
 */
export const TAG_VIEWS = {
    subsidy: {
        column: 'subsidy_tag', tags: SUBSIDY_TAGS, colors: SUBSIDY_TAG_COLORS,
        activeOnly: false, total: 'tagged', card: 'stage',
        icon: Tag, allLabel: 'All subsidies', noun: 'subsidy',
    },
    loan: {
        column: 'loan_tag', tags: LOAN_TAGS, colors: LOAN_TAG_COLORS,
        activeOnly: true, total: 'loan', dropBlank: true, card: 'stage',
        icon: IndianRupee, allLabel: 'All loans', noun: 'loan',
    },
    installation: {
        column: 'installation_status', tags: INSTALLATION_TAGS, colors: INSTALLATION_TAG_COLORS,
        activeOnly: true, total: 'tagged', card: 'installation',
        aliases: { Installed: 'yes', 'In process': 'process' },
        extraColumns: 'installation_date, material_delivery_date',
        icon: Wrench, allLabel: 'All installations', noun: 'installation',
    },
};
