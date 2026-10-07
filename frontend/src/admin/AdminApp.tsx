import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { api, ApiError, onAdminSessionExpired } from '../lib/api';
import type { AdminUser } from '../lib/types';
import { initials, useBodyClass } from '../lib/util';
import '../styles/admin.css';
import { Login } from './Login';
import { AdminProvider, Spinner, useAdmin } from './ui';
import Overview from './views/Overview';
import { useAction } from './useAction';
import NotFound from '../NotFound';

const Exhibitors = lazy(() => import('./views/Exhibitors'));
const Categories = lazy(() => import('./views/Categories'));
const Results = lazy(() => import('./views/Results'));
const Visitors = lazy(() => import('./views/Visitors'));
const Access = lazy(() => import('./views/Access'));
const Security = lazy(() => import('./views/Security'));
const Audit = lazy(() => import('./views/Audit'));

const NAV: [string, string, boolean?][] = [
  ['overview', 'Overview'],
  ['exhibitors', 'Exhibitors'],
  ['categories', 'Categories'],
  ['results', 'Results & export'],
  ['visitors', 'Visitors', true],
  ['access', 'Event & access'],
  ['security', 'Security'],
  ['audit', 'Audit log', true],
];

/** Admin console — exhibitors, categories, voting window, access rules, exports, MFA, audit. */
export default function AdminApp() {
  useBodyClass('admin');
  const [me, setMe] = useState<AdminUser | null | undefined>(undefined);
  const [tip, setTip] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    return onAdminSessionExpired(() => {
      setSessionMessage('Your session has expired. Please sign in again.');
      setMe(null);
    });
  }, [me]);

  const loadMe = useCallback(async () => {
    setLoadError(null);
    try { setMe((await api<{ admin: AdminUser }>('/api/admin/me')).admin); }
    catch (error) {
      if ((error as ApiError).status === 401) setMe(null);
      else setLoadError((error as Error).message);
    }
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);

  if (loadError) return <div className="card"><p className="alert" role="alert">{loadError}</p><button className="btn" onClick={loadMe}>Retry</button></div>;
  if (me === undefined) return <Spinner />;
  if (me === null) return <Login initialMessage={sessionMessage} onDone={(rec) => { setSessionMessage(null); setTip(rec); loadMe(); }} />;

  return (
    <AdminProvider me={me} setMe={setMe}>
      <Shell showMfaTip={tip} />
    </AdminProvider>
  );
}

function Shell({ showMfaTip }: { showMfaTip: boolean }) {
  const { me, isAdmin, setMe, toast } = useAdmin();
  const { busy, run } = useAction();
  useEffect(() => { if (showMfaTip) toast('Tip: enable two-factor authentication under Security.', 'warn'); }, [showMfaTip, toast]);

  return (
    <div className="layout">
      <aside className="side">
        <div className="logo"><img src="/mc-logo-lockup.png" alt="The Maker Collective 2026" /><div><b>MC2026 Awards</b><span>Admin console</span></div></div>
        <nav className="nav">
          {NAV.filter(([, , adminOnly]) => !adminOnly || isAdmin).map(([id, label]) => (
            <NavLink key={id} to={`/admin/${id}`} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>{label}</NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who">
            <span className="avatar">{initials(me.username)}</span>
            <div><b>{me.username}</b><span>{me.role === 'admin' ? 'Administrator' : 'Viewer (read-only)'}</span></div>
          </div>
          <button className="btn btn-ghost-dark btn-block" disabled={busy} aria-busy={busy} onClick={() => run('logout', async () => {
            try { await api('/api/admin/logout', { method: 'POST', body: {} }); setMe(null); }
            catch (ex) { toast((ex as Error).message, 'err'); }
          })}>{busy ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </aside>
      <main className="main">
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<Overview />} />
            <Route path="exhibitors" element={<Exhibitors />} />
            <Route path="categories" element={<Categories />} />
            <Route path="results" element={<Results />} />
            {isAdmin && <Route path="visitors" element={<Visitors />} />}
            <Route path="access" element={<Access />} />
            <Route path="security" element={<Security />} />
            {isAdmin && <Route path="audit" element={<Audit />} />}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
