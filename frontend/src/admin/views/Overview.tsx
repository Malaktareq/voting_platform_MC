import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ResultsSnapshot, Settings, VotingState } from '../../lib/types';
import { accent, fmtTime } from '../../lib/util';
import { scheduleInput, scheduleWindow } from '../../lib/schedule';
import { useAction } from '../useAction';
import { LoadError, PageHead, Spinner, Tile, useAdmin, useLoad } from '../ui';

interface Stats { verified_visitors: number; votes: number; votes_last_5m: number; otps_last_hour: number; live_screens_this_node: number; redis: string; exhibitors: number }
interface Links { voteUrl: string; displayUrl: string | null; voteQr: string; voteQrRefreshAt: number }

export default function Overview() {
  const { isAdmin, toast, confirm } = useAdmin();
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
  const [currentLinks, setCurrentLinks] = useState<Links | null>(null);

  useEffect(() => {
    if (data) setCurrentVoting({ voting: data[0].voting, enabled: data[0].settings.voting.open });
  }, [data]);

  // Keep the venue QR current using the server-provided rotation time.
  useEffect(() => {
    if (!data) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const next = await api<Links>('/api/admin/links');
        if (!active) return;
        setCurrentLinks(next);
        timer = setTimeout(refresh, Math.max(250, next.voteQrRefreshAt - Date.now() + 100));
      } catch {
        if (active) timer = setTimeout(refresh, 1500);
      }
    };
    setCurrentLinks(data[1]);
    timer = setTimeout(refresh, Math.max(250, data[1].voteQrRefreshAt - Date.now() + 100));
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
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
  const [{ settings: s }, initialLinks] = data;
  const links = currentLinks || initialLinks;
  const voting = currentVoting?.voting ?? data[0].voting;
  const open = currentVoting?.enabled ?? s.voting.open;
  const stateLabel = voting.open ? 'Voting is OPEN' : voting.reason === 'not_started' ? 'Scheduled — not started yet' : voting.reason === 'ended' ? 'Ended (schedule)' : 'Voting is CLOSED';

  const toggle = () => run('voting', async () => {
    if (open && !(await confirm('Close voting now? Visitors will no longer be able to vote.', { danger: true, confirmText: 'Close voting' }))) return;
    try {
      await api('/api/admin/settings/voting', { method: 'PUT', body: { open: !open } });
      toast(open ? 'Voting closed' : 'Voting opened');
      reload();
    } catch (ex) { toast((ex as Error).message, 'err'); }
  });

  const saveSchedule = () => run('schedule', async () => {
    try {
      await api('/api/admin/settings/voting', { method: 'PUT', body: {
        ...scheduleWindow(opensAt, closesAt),
      } });
      toast('Schedule saved'); reload();
    } catch (e) { toast((e as Error).message, 'err'); }
  });

  const rotate = () => run('rotate', async () => {
    if (!(await confirm('Rotate the display key? Every TV currently showing results will need the new link.', { confirmText: 'Rotate key' }))) return;
    try {
      await api('/api/admin/display/rotate', { method: 'POST', body: {} });
      toast('Display key rotated'); reload();
    } catch (ex) { toast((ex as Error).message, 'err'); }
  });

  return (
    <div>
      <PageHead title="Overview" sub={live?.event.name || s.event.name} />

      <section className={`card voting ${voting.open ? 'is-open' : 'is-closed'}`}>
        <div className="voting-top">
          <div>
            <p className="eyebrow">Voting window</p>
            <h2 className="voting-state"><i className="dot" />{stateLabel}</h2>
            {voting.open && voting.closes_at && <p className="muted">Closes automatically {fmtTime(voting.closes_at)}</p>}
          </div>
          {isAdmin && <button className={`btn btn-lg ${open ? 'btn-danger' : 'btn-go'}`} disabled={busy} aria-busy={pending === 'voting'} onClick={toggle}>{pending === 'voting' ? 'Updating…' : open ? 'Close voting' : 'Open voting'}</button>}
        </div>
        <details className="schedule">
          <summary>Optional schedule (auto open/close)</summary>
          <p className="muted small">Start and end times use Amman time (Asia/Amman), regardless of your device timezone.</p>
          <p className="muted small">When “Open voting” is on, votes are only accepted between these times. Leave empty for no limit.</p>
          <div className="grid2">
            <label className="field"><span>Opens at</span><input className="input" type="datetime-local" disabled={!isAdmin} value={opensAt} onChange={(e) => setOpensAt(e.target.value)} /></label>
            <label className="field"><span>Closes at</span><input className="input" type="datetime-local" disabled={!isAdmin} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} /></label>
          </div>
          {isAdmin && <button className="btn" disabled={busy} aria-busy={pending === 'schedule'} onClick={saveSchedule}>{pending === 'schedule' ? 'Saving…' : 'Save schedule'}</button>}
        </details>
      </section>

      {statsError && <p className="alert" role="status">Statistics updates are unavailable. {stats ? 'Showing the last received values. ' : ''}Retrying automatically.</p>}
      {!stats && !statsError && <p className="muted" role="status">Loading statistics…</p>}
      <div className="tiles">
        {stats ? (<>
          <Tile label="Verified visitors" value={stats.verified_visitors} />
          <Tile label="Active exhibitors" value={stats.exhibitors} />
          <Tile label="Votes cast" value={stats.votes} />
          <Tile label="Votes · last 5 min" value={stats.votes_last_5m} />
          <Tile label="SMS codes · last hour" value={stats.otps_last_hour} />
          <Tile label="Live screens (this node)" value={stats.live_screens_this_node} />
          <Tile label="Redis" value={stats.redis} tone={stats.redis === 'up' ? 'good' : 'warn'} />
        </>) : null}
      </div>

      <div className="grid-2-1">
        <section className="card">
          <div className="card-head"><h2>Live standings</h2><Link to="/admin/results" className="btn btn-link">Full results →</Link></div>
          <p className="muted small" role="status">
            <span className={`pill ${liveConnection === 'live' ? 'ok' : liveConnection === 'offline' ? 'warn' : ''}`}>
              {liveConnection === 'live' ? 'Live' : liveConnection === 'polling' ? 'Refreshing every 5 seconds' : liveConnection === 'offline' ? 'Connection interrupted' : 'Connecting…'}
            </span>
            {live && <> · Last updated {fmtTime(live.generated_at)}</>}
          </p>
          {liveConnection === 'offline' && <p className="alert" role="alert">{live ? 'Showing the last received results. ' : ''}Updates are unavailable. Retrying automatically.</p>}
          <div className="mini-results">
            {!live ? <p className="muted">{liveConnection === 'offline' ? 'Waiting for results…' : 'Loading standings…'}</p> : live.categories.map((c, i) => (
              <div key={c.id} className="mini-col" style={accent(i)}>
                <h3>{c.name}<span>{c.total} votes</span></h3>
                <ol>{c.standings.slice(0, 3).map((x) => <li key={x.id}><span>{x.project || x.name}</span><b>{x.votes}</b></li>)}</ol>
              </div>
            ))}
          </div>
        </section>

        <section className="card links">
          <div className="qr-box"><img src={links.voteQr} alt="Voting QR code" /></div>
          <div className="stack">
            <p className="eyebrow">Visitor voting page</p>
            <code className="url">{links.voteUrl}</code>
            <p className="muted small">This QR changes every 20 seconds. Scan it from the venue screen; printed copies expire.</p>
            <div className="actions">
              <button className="btn" onClick={() => printPoster(links.voteQr, links.voteUrl, toast)}>Print QR poster</button>
              <a className="btn" href={links.voteQr} download="mc2026-vote-qr.png">Download QR</a>
            </div>
            {links.displayUrl && (
              <div className="stack tight">
                <p className="eyebrow">Live results screen (protected)</p>
                <code className="url">{links.displayUrl}</code>
                <div className="actions">
                  <button className="btn" onClick={async () => {
                    try { await navigator.clipboard.writeText(links.displayUrl!); toast('Display link copied'); }
                    catch { toast('Could not copy the display link. Please copy it manually.', 'err'); }
                  }}>Copy link</button>
                  <a className="btn" href={links.displayUrl} target="_blank" rel="noopener">Open</a>
                  {isAdmin && <button className="btn btn-ghost" disabled={busy} aria-busy={pending === 'rotate'} onClick={rotate}>{pending === 'rotate' ? 'Rotating…' : 'Rotate key'}</button>}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Printable A4 "Scan to vote" poster (built with DOM APIs — no inline script). */
function printPoster(qr: string, url: string, toast: (m: string, k?: 'ok' | 'err' | 'warn') => void) {
  const w = window.open('', '_blank', 'width=800,height=1000');
  if (!w) return toast('Allow pop-ups to print the poster', 'warn');
  const doc = w.document;
  doc.title = 'MC2026 — Scan to vote';
  const st = doc.createElement('style');
  st.textContent = `body{font-family:system-ui,sans-serif;text-align:center;color:#00007b;margin:0;padding:48px}
    h1{font-size:56px;margin:0 0 8px}p{font-size:22px;margin:0 0 32px}
    img{width:70%;max-width:520px;image-rendering:pixelated}.u{font-size:20px;margin-top:24px;font-family:monospace}
    .b{display:inline-block;background:#7f32d9;color:#fff;font-weight:800;padding:8px 18px;border-radius:8px;margin-bottom:24px;letter-spacing:.08em}`;
  doc.head.append(st);
  const mk = (tag: string, cls: string, text: string) => { const el = doc.createElement(tag); el.className = cls; el.textContent = text; return el; };
  const img = doc.createElement('img'); img.src = qr;
  doc.body.append(mk('div', 'b', 'MC2026 COMMUNITY AWARDS'), mk('h1', '', 'Scan to vote'), mk('p', '', '3 awards · 1 vote each · صوّت لصُنّاعك المفضّلين'), img, mk('div', 'u', url));
  img.onload = () => setTimeout(() => w.print(), 200);
}
