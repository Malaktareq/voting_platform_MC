import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ResultsSnapshot, Settings, VotingState } from '../../lib/types';
import { accent } from '../../lib/util';
import { scheduleInput, scheduleWindow } from '../../lib/schedule';
import { useAction } from '../useAction';
import { LoadError, PageHead, Spinner, Tile, useAdmin, useLoad } from '../ui';
import { accessSummary, modeLabel, usesGeo, usesIp } from '../accessModes';
import { useLang } from '../i18n';

interface Stats { verified_visitors: number; votes: number; votes_last_5m: number; otps_last_hour: number; live_screens_this_node: number; redis: string; exhibitors: number }
interface Links { voteUrl: string; displayUrl: string | null }

export default function Dashboard() {
  const { isAdmin, toast, confirm } = useAdmin();
  const { t } = useLang();
  const { data, error, reload } = useLoad(() => Promise.all([
    api<{ settings: Settings; voting: VotingState }>('/api/admin/settings'),
    api<Links>('/api/admin/links'),
  ]));
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [live, setLive] = useState<ResultsSnapshot | null>(null);
  const [liveConnection, setLiveConnection] = useState<'connecting' | 'live' | 'polling' | 'offline'>('connecting');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const { busy, pending, run } = useAction();
  const [currentVoting, setCurrentVoting] = useState<{ voting: VotingState; enabled: boolean } | null>(null);

  useEffect(() => {
    if (data) setCurrentVoting({ voting: data[0].voting, enabled: data[0].settings.voting.open });
  }, [data]);

  // Refresh the authoritative state at schedule boundaries and after missed live updates.
  const nextBoundary = currentVoting?.voting.opens_at || currentVoting?.voting.closes_at;
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await api<{ settings: Settings; voting: VotingState }>('/api/admin/settings');
        if (!cancelled) {
          setCurrentVoting({ voting: result.voting, enabled: result.settings.voting.open });
          if (!isAdmin) {
            setOpensAt(scheduleInput(result.settings.voting.opens_at));
            setClosesAt(scheduleInput(result.settings.voting.closes_at));
          }
        }
      } catch { /* Session expiry is handled centrally; the next poll retries connection failures. */ }
      finally { pending = false; }
    };
    const interval = setInterval(() => { void refresh(); }, 5000);
    const remaining = nextBoundary ? Date.parse(nextBoundary) - Date.now() : NaN;
    const boundaryTimer = remaining >= 0
      ? setTimeout(() => { void refresh(); }, Math.min(remaining + 50, 2147483647)) : undefined;
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(boundaryTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [nextBoundary, isAdmin]);

  // Stats tiles refresh every 5 s
  useEffect(() => {
    let disposed = false, pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await api<Stats>('/api/admin/stats');
        if (!disposed) { setStats(result); setStatsError(false); }
      } catch { if (!disposed) setStatsError(true); }
      finally { pending = false; }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { disposed = true; clearInterval(id); };
  }, []);

  // Keep standings fresh when streams fail or a proxy silently buffers them.
  useEffect(() => {
    let disposed = false;
    let streaming = false;
    let lastStreamUpdate = 0;
    let latestSnapshot = 0;
    let polling = false;
    let es: EventSource | null = null;
    const receive = (snapshot: ResultsSnapshot) => {
      if (disposed) return;
      const generatedAt = Date.parse(snapshot.generated_at);
      if (!Number.isFinite(generatedAt) || !Array.isArray(snapshot.categories)) throw new Error('Invalid results');
      if (generatedAt < latestSnapshot) return;
      latestSnapshot = generatedAt;
      setLive(snapshot);
      setCurrentVoting({ voting: snapshot.voting, enabled: snapshot.voting.open ||
        snapshot.voting.reason === 'not_started' || snapshot.voting.reason === 'ended' });
    };
    const refresh = async () => {
      if (disposed || polling) return;
      polling = true;
      try {
        const snapshot = await api<ResultsSnapshot>('/api/admin/results');
        receive(snapshot);
        if (!disposed && !streaming) setLiveConnection('polling');
      } catch {
        if (!disposed && !streaming) setLiveConnection('offline');
      } finally { polling = false; }
    };
    const fallback = () => {
      if (disposed) return;
      streaming = false;
      setLiveConnection('polling');
      void refresh();
    };
    try {
      es = new EventSource('/api/display/stream');
      es.addEventListener('results', (ev) => {
        if (disposed) return;
        try {
          receive(JSON.parse((ev as MessageEvent).data));
          streaming = true;
          lastStreamUpdate = Date.now();
          setLiveConnection('live');
        } catch { fallback(); }
      });
      es.onerror = fallback;
    } catch { fallback(); }
    void refresh();
    const timer = setInterval(() => {
      if (streaming && Date.now() - lastStreamUpdate < 30000) return;
      if (streaming) setLiveConnection('polling');
      streaming = false;
      void refresh();
    }, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') fallback(); };
    window.addEventListener('online', fallback);
    window.addEventListener('offline', fallback);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      es?.close();
      clearInterval(timer);
      window.removeEventListener('online', fallback);
      window.removeEventListener('offline', fallback);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    setOpensAt(scheduleInput(data[0].settings.voting.opens_at));
    setClosesAt(scheduleInput(data[0].settings.voting.closes_at));
  }, [data]);

  if (error) return <LoadError error={error} />;
  if (!data) return <Spinner />;
  const [{ settings: s }, links] = data;
  const d = t.dash;
  const voting = currentVoting?.voting ?? data[0].voting;
  const open = currentVoting?.enabled ?? s.voting.open;
  const state = voting.open
    ? { tone: 'open', title: d.open, detail: voting.closes_at ? d.openUntil(t.when(voting.closes_at)) : d.openNow }
    : voting.reason === 'not_started'
      ? { tone: 'waiting', title: d.opensAt(t.when(voting.opens_at)), detail: d.waiting }
      : voting.reason === 'ended'
        ? { tone: 'closed', title: d.ended, detail: d.endedAt(t.when(voting.closes_at)) }
        : { tone: 'closed', title: d.closed, detail: d.closedNow };

  const access = s.access;
  const ipMissing = usesIp(access.mode) && !access.allowed_cidrs.length;
  const geoMissing = usesGeo(access.mode) && !(access.geofence.lat != null && access.geofence.lng != null && access.geofence.radius_m);
  const protection = access.mode === 'off'
    ? { tone: 'off', text: d.protectionOff }
    : { tone: ipMissing || geoMissing ? 'warn' : 'ok', text: `${modeLabel(t, access.mode)} · ${accessSummary(t, access)}` };

  const toggle = () => run('voting', async () => {
    if (open && !(await confirm(d.confirmClose, { danger: true, confirmText: d.closeBtn }))) return;
    await api('/api/admin/settings/voting', { method: 'PUT', body: { open: !open } });
    toast(open ? d.closedToast : d.opened);
    reload();
  });

  const saveSchedule = (opens: string, closes: string) => run('schedule', async () => {
    await api('/api/admin/settings/voting', { method: 'PUT', body: scheduleWindow(opens, closes) });
    toast(opens || closes ? d.scheduleSaved : d.scheduleCleared); reload();
  });

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(t.common.copied(what)); }
    catch { toast(t.common.copyFailed, 'err'); }
  };

  return (
    <div>
      <PageHead title={d.title} sub={[live?.event.name || s.event.name, s.event.venue].filter(Boolean).join(' · ')} />

      <section className={`card voting is-${state.tone}`}>
        <div className="voting-top">
          <div>
            <h2 className="voting-state"><i className="dot" />{state.title}</h2>
            <p className="muted">{state.detail}</p>
          </div>
          {isAdmin && <button className={`btn btn-lg ${open ? 'btn-danger' : 'btn-go'}`} disabled={busy} aria-busy={pending === 'voting'} onClick={toggle}>
            {pending === 'voting' ? d.updating : open ? d.closeBtn : d.openBtn}</button>}
        </div>
        <form className="schedule" onSubmit={(e) => { e.preventDefault(); void saveSchedule(opensAt, closesAt); }}>
          <div className="schedule-label"><b>{d.schedule}</b><span>{d.scheduleSub}</span></div>
          <label className="field"><span>{d.opens}</span><input className="input" type="datetime-local" disabled={!isAdmin} value={opensAt} onChange={(e) => setOpensAt(e.target.value)} /></label>
          <label className="field"><span>{d.closes}</span><input className="input" type="datetime-local" disabled={!isAdmin} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} /></label>
          {isAdmin && <div className="actions">
            <button type="submit" className="btn" disabled={busy} aria-busy={pending === 'schedule'}>{pending === 'schedule' ? t.common.saving : t.common.save}</button>
            {(s.voting.opens_at || s.voting.closes_at) && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => saveSchedule('', '')}>{d.clear}</button>}
          </div>}
        </form>
        <p className="muted small">{d.scheduleHint}</p>
      </section>

      <div className={`protection is-${protection.tone}`}>
        <p><b>{d.protection}</b><span>{protection.text}</span></p>
        <Link to="/admin/settings/access" className="btn btn-sm">{protection.tone === 'ok' ? d.change : d.fixNow}</Link>
      </div>

      {statsError && <p className="alert" role="status">{d.statsDown} {stats ? `${d.statsLast} ` : ''}{d.retrying}</p>}
      <div className="tiles">
        <Tile label={d.votes} value={stats ? stats.votes : '–'} />
        <Tile label={d.verified} value={stats ? stats.verified_visitors : '–'} />
        <Tile label={d.recent} value={stats ? stats.votes_last_5m : '–'} />
        <Tile label={d.onBallot} value={stats ? stats.exhibitors : '–'} />
      </div>

      <div className="grid-2-1">
        <section className="card">
          <div className="card-head">
            <h2>{d.leading}</h2>
            <span className={`live-state is-${liveConnection}`} role="status">
              {liveConnection === 'live' ? d.live : liveConnection === 'polling' ? d.polling : liveConnection === 'offline' ? d.reconnecting : d.connecting}
            </span>
          </div>
          {liveConnection === 'offline' && live && <p className="muted small">{d.showingFrom(t.when(live.generated_at))}</p>}
          <div className="mini-results">
            {!live ? <p className="muted">{d.loadingStandings}</p> : live.categories.map((c, i) => (
              <div key={c.id} className="mini-col" style={accent(i)}>
                <h3>{c.name}<span>{d.votesCount(c.total.toLocaleString('en'))}</span></h3>
                {c.standings.some((x) => x.votes) ? (
                  <ol>{c.standings.filter((x) => x.votes).slice(0, 3).map((x) => <li key={x.id}><span>{x.project || x.name}</span><b>{x.votes}</b></li>)}</ol>
                ) : <p className="muted small">{d.noVotes}</p>}
              </div>
            ))}
          </div>
          <div className="card-foot"><Link to="/admin/results" className="btn btn-sm">{d.allResults}</Link></div>
        </section>

        <section className="card share">
          <h2>{d.share}</h2>
          <div className="stack tight">
            <b>{d.votePage}</b>
            <code className="url" dir="ltr">{links.voteUrl}</code>
            <div className="actions">
              <button className="btn btn-sm" onClick={() => copy(links.voteUrl, d.voteLink)}>{d.copyLink}</button>
              <a className="btn btn-sm" href={links.voteUrl} target="_blank" rel="noopener">{d.openPage}</a>
            </div>
          </div>
          {links.displayUrl && (
            <div className="share-screen stack tight">
              <b>{d.screen}</b>
              <p className="muted small">{d.screenNote}</p>
              <div className="actions">
                <button className="btn btn-sm" onClick={() => copy(links.displayUrl!, d.screenLink)}>{d.copyLink}</button>
                <a className="btn btn-sm" href={links.displayUrl} target="_blank" rel="noopener">{d.openScreen}</a>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
