import { isOn } from '../../config/index.js';
import { lazyWithRetry } from '../../lib/lazy.js';

// The shared calendar as a portal tab ({ currentUser }). Null when the client
// does not have it, so its code is never downloaded.
export const PortalCalendar = isOn('calendar') ? lazyWithRetry(() => import('../CalendarView')) : null;
