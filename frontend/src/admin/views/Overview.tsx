import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ResultsSnapshot, Settings, VotingState } from '../../lib/types';
import { accent, toLocalInput, fmtTime } from '../../lib/util';
import { LoadError, PageHead, Spinner, Tile, useAdmin, useLoad } from '../ui';

interface Stats { verified_visitors: number; votes: number; votes_last_5m: number; otps_last_hour: number; live_screens_this_node: number; redis: string }
interface Links { voteUrl: string; displayUrl: string | null; voteQr: string; voteQrRefreshAt: number }

export default function Overview() {
  const { isAdmin, toast, confirm } = useAdmin();
  const { data, error, reload } = useLoad(() => Promise.all([
    api<{ settings: Settings; voting: VotingState }>('/api/admin/settings'),
    api<Links>('/api/admin/links'),
  ]));
  const [stats, setStats] = useState<Stats | null>(null);
  const [live, setLive] = useState<ResultsSnapshot | null>(null);
  const [currentLinks, setCurrentLinks] = useState<Links | null>(null);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');

  // Stats tiles refresh every 5 s
  useEffect(() => {
    const load = () => api<Stats>('/api/admin/stats').then(setStats).catch(() => undefined);
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

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
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [data]);

  // Mini live standings via the same SSE stream the TV uses
  useEffect(() => {
    const es = new EventSource('/api/display/stream');
    es.addEventListener('results', (ev) => setLive(JSON.parse((ev as MessageEvent).data)));
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!data) return;
    setOpensAt(toLocalInput(data[0].settings.voting.opens_at));
    setClosesAt(toLocalInput(data[0].settings.voting.closes_at));
  }, [data]);

  if (error) return <LoadError error={error} />;
  if (!data) return <Spinner />;
  const [{ settings: s, voting }, initialLinks] = data;
  const links = currentLinks || initialLinks;
  const open = s.voting.open;
  const stateLabel = voting.open ? 'Voting is OPEN' : voting.reason === 'not_started' ? 'Scheduled â€” not started yet' : voting.reason === 'ended' ? 'Ended (schedule)' : 'Voting is CLOSED';

  const toggle = async () => {
    if (open && !(await confirm('Close voting now? Visitors will no longer be able to vote.', { danger: true, confirmText: 'Close voting' }))) return;
    await api('/api/admin/settings/voting', { method: 'PUT', body: { open: !open } });
    toast(open ? 'Voting closed' : 'Voting opened');
    reload();
  };

  const saveSchedule = async () => {
    try {
      await api('/api/admin/settings/voting', { method: 'PUT', body: { opens_at: opensAt || null, closes_at: closesAt || null } });
      toast('Schedule saved'); reload();
    } catch (e) { toast((e as Error).message, 'err'); }
  };

  const rotate = async () => {
    if (!(await confirm('Rotate the display key? Every TV currently showing results will need the new link.', { confirmText: 'Rotate key' }))) return;
    await api('/api/admin/display/rotate', { method: 'POST', body: {} });
    toast('Display key rotated'); reload();
  };

  return (
    <div>
      <PageHead title="Overview" sub={s.event.name} />

      <section className={`card voting ${voting.open ? 'is-open' : 'is-closed'}`}>
        <div className="voting-top">
          <div>
            <p className="eyebrow">Voting window</p>
            <h2 className="voting-state"><i className="dot" />{stateLabel}</h2>
            {voting.open && voting.closes_at && <p className="muted">Closes automatically {fmtTime(voting.closes_at)}</p>}
          </div>
          {isAdmin && <button className={`btn btn-lg ${open ? 'btn-danger' : 'btn-go'}`} onClick={toggle}>{open ? 'Close voting' : 'Open voting'}</button>}
        </div>
        <details className="schedule">
          <summary>Optional schedule (auto open/close)</summary>
          <p className="muted small">When â€œOpen votingâ€ is on, votes are only accepted between these times. Leave empty for no limit.</p>
          <div className="grid2">
            <label className="field"><span>Opens at</span><input className="input" type="datetime-local" disabled={!isAdmin} value={opensAt} onChange={(e) => setOpensAt(e.target.value)} /></label>
            <label className="field"><span>Closes at</span><input className="input" type="datetime-local" disabled={!isAdmin} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} /></label>
          </div>
          {isAdmin && <button className="btn" onClick={saveSchedule}>Save schedule</button>}
        </details>
      </section>

      <div className="tiles">
        {stats ? (<>
          <Tile label="Verified visitors" value={stats.verified_visitors} />
          <Tile label="Votes cast" value={stats.votes} />
          <Tile label="Votes Â· last 5 min" value={stats.votes_last_5m} />
          <Tile label="SMS codes Â· last hour" value={stats.otps_last_hour} />
          <Tile label="Live screens (this node)" value={stats.live_screens_this_node} />
          <Tile label="Redis" value={stats.redis} tone={stats.redis === 'up' ? 'good' : 'warn'} />
        </>) : null}
      </div>

      <div className="grid-2-1">
        <section className="card">
          <div className="card-head">
            <h2>Live standings</h2>
            <div className="actions">
              <Link to="/admin/live-data" className="btn btn-link">Live data â†’</Link>
              <Link to="/admin/results" className="btn btn-link">Full results â†’</Link>
            </div>
          </div>
          <div className="mini-results">
            {!live ? <p className="muted">Connectingâ€¦</p> : live.categories.map((c, i) => (
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
            {links.displayUrl && (
              <div className="stack tight">
                <p className="eyebrow">Live results screen (protected)</p>
                <code className="url">{links.displayUrl}</code>
                <div className="actions">
                  <button className="btn" onClick={async () => { await navigator.clipboard.writeText(links.displayUrl!); toast('Display link copied'); }}>Copy link</button>
                  <a className="btn" href={links.displayUrl} target="_blank" rel="noopener">Open</a>
                  {isAdmin && <button className="btn btn-ghost" onClick={rotate}>Rotate key</button>}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

