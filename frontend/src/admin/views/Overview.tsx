import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ResultsSnapshot, Settings, VotingState } from '../../lib/types';
import { accent, toLocalInput, fmtTime } from '../../lib/util';
import { LoadError, PageHead, Spinner, Tile, useAdmin, useLoad } from '../ui';

interface Stats { verified_visitors: number; votes: number; votes_last_5m: number; otps_last_hour: number; live_screens_this_node: number; redis: string }
interface Links { voteUrl: string; displayUrl: string | null; voteQr: string }

export default function Overview() {
  const { isAdmin, toast, confirm } = useAdmin();
  const { data, error, reload } = useLoad(() => Promise.all([
    api<{ settings: Settings; voting: VotingState }>('/api/admin/settings'),
    api<Links>('/api/admin/links'),
  ]));
  const [stats, setStats] = useState<Stats | null>(null);
  const [live, setLive] = useState<ResultsSnapshot | null>(null);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');

  // Stats tiles refresh every 5 s
  useEffect(() => {
    const load = () => api<Stats>('/api/admin/stats').then(setStats).catch(() => undefined);
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

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
  const [{ settings: s, voting }, links] = data;
  const open = s.voting.open;
  const stateLabel = voting.open ? 'Voting is OPEN' : voting.reason === 'not_started' ? 'Scheduled — not started yet' : voting.reason === 'ended' ? 'Ended (schedule)' : 'Voting is CLOSED';

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
          <p className="muted small">When “Open voting” is on, votes are only accepted between these times. Leave empty for no limit.</p>
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
          <Tile label="Votes · last 5 min" value={stats.votes_last_5m} />
          <Tile label="SMS codes · last hour" value={stats.otps_last_hour} />
          <Tile label="Live screens (this node)" value={stats.live_screens_this_node} />
          <Tile label="Redis" value={stats.redis} tone={stats.redis === 'up' ? 'good' : 'warn'} />
        </>) : null}
      </div>

      <div className="grid-2-1">
        <section className="card">
          <div className="card-head"><h2>Live standings</h2><Link to="/admin/results" className="btn btn-link">Full results →</Link></div>
          <div className="mini-results">
            {!live ? <p className="muted">Connecting…</p> : live.categories.map((c, i) => (
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
            <div className="actions">
              <button className="btn" onClick={() => printPoster(links.voteQr, links.voteUrl, toast)}>Print QR poster</button>
              <a className="btn" href={links.voteQr} download="mc2026-vote-qr.png">Download QR</a>
            </div>
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
