import { Component, lazy, Suspense } from 'react';
import { ErrorBanner, LoadingState } from '../../template/src/ui/index.js';
import { useHashPath } from './components/router.js';
import { Landing, NotFound } from './pages/Landing.jsx';

// Clients only download the wizard; the admin pages (and the zip code) load on demand.
const SetupWizard = lazy(() => import('./pages/SetupWizard.jsx'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp.jsx'));
const AdminOffline = lazy(() => import('./pages/admin/AdminOffline.jsx'));

// A page chunk that fails to load (offline, or the site was updated) gets a reload button.
class PageBoundary extends Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error) { console.error('Page failed:', error); }
    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div className="sf-page p-4">
                <ErrorBanner title="This page could not load." onRetry={() => window.location.reload()} retryLabel="Reload">
                    Check your internet connection and reload. Your saved answers are safe.
                </ErrorBanner>
            </div>
        );
    }
}

function route(path) {
    const [first, ...rest] = path;
    if (!first) return <Landing />;
    if (first === 's' && rest.length === 2) return <SetupWizard key={rest.join('/')} inviteId={rest[0]} token={rest[1]} />;
    if (first === 'preview' && !rest.length) return <SetupWizard preview />;
    if (first === 'admin' && rest[0] === 'offline') return <AdminOffline />;
    if (first === 'admin') return <AdminApp path={rest} />;
    return <NotFound />;
}

export default function App() {
    const path = useHashPath();
    return (
        <PageBoundary key={path[0] || ''}>
            <Suspense fallback={<div className="sf-page"><LoadingState /></div>}>
                {route(path)}
            </Suspense>
        </PageBoundary>
    );
}
