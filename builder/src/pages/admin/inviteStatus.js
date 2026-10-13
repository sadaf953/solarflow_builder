export const INVITE_STATUS = {
    open: { label: 'Waiting for client', tone: 'blue' },
    submitted: { label: 'Submitted', tone: 'green' },
    downloaded: { label: 'Zip downloaded', tone: 'stone' },
    archived: { label: 'Archived', tone: 'red' },
};

export const statusInfo = status => INVITE_STATUS[status] || { label: status || 'Unknown', tone: 'stone' };
