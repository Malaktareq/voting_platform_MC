import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { GeoPoint, PublicState, VisitorSession } from '../lib/types';
import { safeStore, useBodyClass } from '../lib/util';
import '../styles/vote.css';
import { Ballot } from './Ballot';
import { makeT, type Lang } from './i18n';
import { ClosedScreen, DoneScreen, ErrorScreen, OffsiteScreen } from './Screens';
import { OtpScreen, RegisterScreen, type Challenge, type FormState } from './Signup';
import { VoteContext } from './VoteContext';

/**
 * Visitor voting page — mobile-first, bilingual (EN/AR), resilient to flaky
 * venue Wi-Fi (retries, idempotent votes, offline banner).
 *
 * Flow: on-site check → name + phone → SMS code → one vote per category → done.
 */
export default function VotePage() {
  console.log('VOTE PAGE IS RUNNING');
  useBodyClass('vote');
  const [lang, setLang] = useState<Lang>('en');
  const t = useMemo(() => makeT(lang), [lang]);

  const [data, setData] = useState<PublicState | null>(null);
  const [session, setSession] = useState<VisitorSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [onSite, setOnSite] = useState(true);
  const [challenge, setChallengeState] = useState<Challenge | null>(() => safeStore.get<Challenge>('challenge'));
  const [form, setFormState] = useState<FormState>(() => safeStore.get<FormState>('form') || { name: '', phone: '', consent: false });
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState<string | null>(null);
  const [qrEntry, setQrEntry] = useState<'none' | 'checking' | 'ready'>(() =>
    new URLSearchParams(window.location.search).has('entry') || new URLSearchParams(window.location.hash.slice(1)).has('entry') ? 'checking' : 'none');

  const setChallenge = (c: Challenge | null) => { setChallengeState(c); if (c) safeStore.set('challenge', c); else safeStore.del('challenge'); };
  const setForm = (f: FormState) => { setFormState(f); safeStore.set('form', f); };

  const load = useCallback(async () => {
    try {
      const s = await api<PublicState>('/api/public/state', { retries: 3 });
      setData(s);
      setSession(s.session);
      setOnSite(s.access.allowed);
      if (s.session) setChallenge(null);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Reset clears saved votes (or registrations); reconcile open screens with server state.
  useEffect(() => {
    if (challenge) return;
    let refreshing = false;
    const timer = window.setInterval(async () => {
      if (refreshing || document.visibilityState !== 'visible' || !navigator.onLine) return;
      refreshing = true;
      try { await load(); } finally { refreshing = false; }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load, challenge]);

  // A rotating venue QR is exchanged immediately for a short-lived browser grant.
  useEffect(() => {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.slice(1));
    const token = url.searchParams.get('entry') || hashParams.get('entry');
    if (!token) return;
    let active = true;
    const cleanEntryFromUrl = () => {
      url.searchParams.delete('entry');
      hashParams.delete('entry');
      url.hash = hashParams.toString();
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    };
    api('/api/public/qr-entry', { method: 'POST', body: { token } })
      .then(() => {
        if (!active) return;
        setQrEntry('ready');
        cleanEntryFromUrl();
        void load();
      })
      .catch(() => {
        if (!active) return;
        setQrEntry('none');
        cleanEntryFromUrl();
        setToast('That QR code expired. Scan the current code on the venue screen.');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
  console.log('GPS DEBUG — data:', data);
  console.log('GPS DEBUG — access:', data?.access);
  console.log('GPS DEBUG — needsLocation:', data?.access.needsLocation);
}, [data]);

useEffect(() => {
  if (!data) return;
  if (location) return;
  if (!data.access.needsLocation) return;
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const gps = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };

      console.log('========== GPS LOCATION ==========');
      console.log('Latitude:', gps.lat);
      console.log('Longitude:', gps.lng);
      console.log('Accuracy:', gps.accuracy, 'meters');
      console.log('==================================');

      setLocation(gps);
    },
    (error) => {
      console.error('GPS error:', error);
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    },
  );
}, [data, location]);
  // Language: <html lang/dir>, remembered per device
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    safeStore.set('lang', lang, true);
    return () => { document.documentElement.dir = 'ltr'; document.documentElement.lang = 'en'; };
  }, [lang]);

  // Network awareness: banner when offline, refresh when back / when the tab returns
  useEffect(() => {
    const on = () => { setOnline(true); load(); };
    const off = () => setOnline(false);
    const vis = () => { if (document.visibilityState === 'visible' && !safeStore.get('challenge')) load(); };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); document.removeEventListener('visibilitychange', vis); };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const ctx = { t, lang, data, session, setSession, location, setLocation, setOnSite, reload: load, setToast };

  let screen: React.ReactNode;
  if (qrEntry === 'checking') {
    screen = <div className="loading"><span className="spinner" /></div>;
  } else if (!data) {
    screen = loadError ? <ErrorScreen message={loadError} /> : <div className="loading"><span className="spinner" /></div>;
  } else if (!data.voting.open) {
    screen = <ClosedScreen />;
  } else if (session) {
    const allDone = data.categories.length > 0 && data.categories.every((c) => session.votes[c.id]);
    screen = allDone ? <DoneScreen /> : <Ballot />;
  } else if (!onSite && !location) {
    screen = <OffsiteScreen />;
  } else if (challenge) {
    screen = <OtpScreen challenge={challenge} setChallenge={setChallenge} form={form} />;
  } else {
    screen = <RegisterScreen form={form} setForm={setForm} setChallenge={setChallenge} />;
  }

  return (
    <VoteContext.Provider value={ctx}>
      {!online && <div className="offline">{t('offline')}</div>}
      <header className="topbar">
        <a className="brand" href="/" aria-label="MC2026 Awards home">
          <img className="brand-lockup" src="/mc-logo-lockup.png" alt="The Maker Collective 2026" />
          <span className="brand-text"><b>MC2026</b> <span>{t('awards')}</span></span>
        </a>
        <button className="lang" type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label="Switch language">
          {t('switchTo')}
        </button>
      </header>
      <main id="app" aria-live="polite">{screen}</main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </VoteContext.Provider>
  );
}
