import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { connectResults, type LiveStatus } from '../lib/live-results';
import type { CategoryResult, ResultsSnapshot } from '../lib/types';
import { useBodyClass } from '../lib/util';
import '../styles/display.css';

const TOP_N = 3;
const DISPLAY_ACCENTS = ['#7f32d9', '#4a68d8', '#f8d749', '#74dccf', '#a52a3a'];

const SHAPES = ['gear', 'circle', 'triangle', 'diamond', 'spark'];

function shapeFor(slug: string, name: string, index: number): string {
  const key = `${slug} ${name}`.toLowerCase();
  if (key.includes('innov')) return 'gear';
  if (key.includes('impact') || key.includes('communit')) return 'circle';
  if (key.includes('craft') || key.includes('entrepren')) return 'triangle';
  return SHAPES[index % SHAPES.length];
}

function GearIcon() {
  return (
    <svg className="gear-icon" viewBox="0 0 72 72" aria-hidden="true">
      <g className="circuit">
        <path d="M7 15h12l7 7M4 29h15l7 4M7 54h12l8-8M14 64V53l9-8" />
        <circle cx="5" cy="15" r="3" />
        <circle cx="3" cy="29" r="3" />
        <circle cx="6" cy="54" r="3" />
        <circle cx="14" cy="66" r="3" />
      </g>
      <path
        className="gear"
        d="m48 10 4 7 8-1 3 8 7 4-3 8 3 8-7 4-3 8-8-1-4 7-8-3-8 3-4-7-8 1-3-8-7-4 3-8-3-8 7-4 3-8 8 1 4-7 8 3 8-3Z"
      />
      <circle className="gear-center" cx="40" cy="36" r="11" />
    </svg>
  );
}

/**
 * Live results dashboard for TV / projector (F7, F8).
 * Primary channel: Server-Sent Events. Fallback: polling every 5 s after
 * repeated SSE errors (some venue proxies buffer streams).
 */
export default function DisplayPage() {
  useBodyClass('tv');
  const [phase, setPhase] = useState<'loading' | 'locked' | 'live' | 'error'>('loading');
  const [lockMsg, setLockMsg] = useState<string | null>(null);
  const [snap, setSnap] = useState<ResultsSnapshot | null>(null);
  const [prev, setPrev] = useState<ResultsSnapshot | null>(null);
  const [qr, setQr] = useState<{ url: string; qr: string } | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [, tick] = useState(0);
  const [connection, setConnection] = useState<LiveStatus>('connecting');
  const newest = useRef(-Infinity);
  const bootGeneration = useRef(0);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const receive = useCallback((s: ResultsSnapshot) => {
    const timestamp = Date.parse(s.generated_at);
    if (!Number.isFinite(timestamp) || timestamp < newest.current) return;
    newest.current = timestamp;
    setSnap((old) => { setPrev(old); return s; });
    setLastUpdate(Date.now());
  }, []);

  const boot = useCallback(async () => {
    const generation = ++bootGeneration.current;
    const key = new URLSearchParams(window.location.search).get('key');
    if (key) {
      try { await api('/api/display/auth', { method: 'POST', body: { key } }); }
      catch (e) { if (generation === bootGeneration.current) { setLockMsg((e as Error).message); setPhase((e as ApiError).status === 401 ? 'locked' : 'error'); setRetryAttempt(n => n + 1); } return; }
      if (generation !== bootGeneration.current) return;
      window.history.replaceState(null, '', '/display'); // don't leave the key on screen
    }
    try {
      const snapshot = await api<ResultsSnapshot>('/api/display/results');
      if (generation !== bootGeneration.current) return;
      receive(snapshot);
      setPhase('live');
    } catch (e) {
      if (generation !== bootGeneration.current) return;
      if ((e as ApiError).status === 401) { setPhase('locked'); return; }
      setPhase('error');
      setRetryAttempt(n => n + 1);
    }
  }, [receive]);

  useEffect(() => {
    if (phase !== 'loading' && phase !== 'error') return;
    const timer = setTimeout(() => { void boot(); }, phase === 'error' ? 5000 : 0);
    return () => { clearTimeout(timer); bootGeneration.current++; };
  }, [boot, phase, retryAttempt]);

  useEffect(() => {
    if (phase !== 'live' || qr) return;
    let disposed = false, pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await api<{ url: string; qr: string }>('/api/display/qr');
        if (!disposed) setQr(result);
      } catch { /* Retry temporary QR loading failures without interrupting standings. */ }
      finally { pending = false; }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => { disposed = true; clearInterval(timer); };
  }, [phase, qr]);

  // Live channel
  useEffect(() => {
    if (phase !== 'live') return;
    const disconnect = connectResults<ResultsSnapshot>({
      url: '/api/display/stream', load: () => api<ResultsSnapshot>('/api/display/results'),
      onSnapshot: receive, onStatus: setConnection,
      onUnauthorized: () => { setLockMsg('Display access expired or the key was rotated. Open a current display link.'); setPhase('locked'); },
    });
    const staleTimer = setInterval(() => tick((n) => n + 1), 5000);
    return () => { disconnect(); clearInterval(staleTimer); };
  }, [phase, receive]);

  if (phase === 'locked') return <KeyForm message={lockMsg} onUnlock={() => { newest.current = -Infinity; setLockMsg(null); setPhase('loading'); }} onError={setLockMsg} />;
  if (phase === 'error') return <div className="center"><div><p role="alert">{lockMsg || 'Cannot connect to live results. Retrying…'}</p><button onClick={() => setPhase('loading')}>Retry now</button></div></div>;
  if (!snap) return <div className="center"><span className="spinner" /></div>;

  const finalMode = !snap.voting.open && snap.totals.votes > 0;
  const stale = Date.now() - lastUpdate > 30000;

  return (
    <>
      <div className="display-stage" aria-hidden="true">
        <span className="shape shape-gear" />
        <span className="shape shape-yellow" />
        <span className="shape shape-navy" />
        <span className="shape shape-aqua" />
        <span className="shape shape-violet" />
      </div>

      <header className="hdr">
        <div className="hdr-brand">
          <img className="brand-lockup" src="/mc-logo-lockup.png" alt="The Maker Collective 2026" />
        </div>
        <div className="hdr-title">
          <p className="kicker">{snap.event.name || 'The Maker Collective 2026'}</p>
          <h1><span>Live</span> Voting Results</h1>
          <p className="dek">See the most voted makers in each category</p>
        </div>
        <div className="hdr-status">
          {snap.show_counts && <Stat label="Votes" value={snap.totals.votes} prev={prev?.totals.votes} />}
          {finalMode ? <span className="pill final">Final</span>
            : snap.voting.open ? <span className={`pill live${stale || connection !== 'live' ? ' stale' : ''}`}><i />{connection === 'live' && !stale ? 'Live' : connection === 'polling' && !stale ? 'Updating' : 'Disconnected'}</span>
            : <span className="pill closed">Closed</span>}
        </div>
      </header>

      <main className="cols" style={{ '--n': snap.categories.length } as React.CSSProperties}>
        {snap.categories.map((c, i) => (
          <Column key={c.id} c={c} index={i} finalMode={finalMode} showCounts={snap.show_counts} prev={prev?.categories.find((x) => x.id === c.id)} />
        ))}
      </main>

      <footer className="ftr">
        {(stale || connection !== 'live') && <p className="note" role="status">{stale || connection === 'offline' ? 'Connection lost. Showing the last received results.' : 'Updating results by polling.'}</p>}
        <div className="cta">
          <div className="cta-copy">
            <span>Be part of The Maker Collective 2026</span>
            <b>Scan the QR code to <em>cast your vote</em></b>
            <i />
          </div>
          {qr && snap.voting.open ? (
            <div className="qr">
              <img src={qr.qr} alt="QR code to vote" />
            </div>
          ) : (
            <p className="note">{snap.voting.open ? 'Voting QR is temporarily unavailable. Retrying…' : finalMode ? 'Voting has ended' : 'Voting is closed'}</p>
          )}
        </div>
      </footer>
    </>
  );
}

function Stat({ label, value, prev }: { label: string; value: number; prev?: number }) {
  const changed = prev != null && prev !== value;
  return (
    <div className={`stat${changed ? ' bump' : ''}`} key={changed ? value : undefined}>
      <b>{value.toLocaleString('en')}</b><span>{label}</span>
    </div>
  );
}

function Column({ c, index, finalMode, showCounts, prev }: { c: CategoryResult; index: number; finalMode: boolean; showCounts: boolean; prev?: CategoryResult }) {
  const prevVotes = new Map(prev ? prev.standings.map((s) => [s.id, s.votes]) : []);
  const max = Math.max(1, ...c.standings.map((s) => s.votes));
  const leaders = c.standings.filter((s) => s.rank === 1 && s.votes > 0);
  const lead = leaders[0];
  const nonLeaders = c.standings.filter((s) => !leaders.some((l) => l.id === s.id));
  const rows = leaders.length > 1 && lead ? [lead, ...nonLeaders.slice(0, TOP_N - 1)] : c.standings.slice(0, TOP_N);
  const displayedCount = leaders.length > 1 ? leaders.length + rows.length - 1 : rows.length;
  const categoryStyle = { '--accent': DISPLAY_ACCENTS[index % DISPLAY_ACCENTS.length] } as React.CSSProperties;
  const shape = shapeFor(c.slug, c.name, index);

  // FLIP: animate rows from their previous position when the ranking changes
  const listRef = useRef<HTMLOListElement>(null);
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.querySelectorAll<HTMLElement>('[data-key]').forEach((row) => {
      const key = row.dataset.key!;
      const top = row.getBoundingClientRect().top;
      const old = positions.current.get(key);
      if (old != null && Math.abs(old - top) > 1) {
        row.animate([{ transform: `translateY(${old - top}px)` }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      positions.current.set(key, top);
    });
  });

  return (
    <section className={`col col-${index % 5}${finalMode ? ' is-final' : ''}`} style={categoryStyle}>
      <div className="col-head">
        <span className={`cat-mark ${shape}`} aria-hidden="true">{shape === 'gear' ? <GearIcon /> : <i />}</span>
        <div>
          <h2>{c.name}</h2>
          {c.description && <p>{c.description}</p>}
        </div>
      </div>
      {lead ? null : <div className="leader empty"><p>Waiting for the first vote...</p></div>}
      <ol className="rows" ref={listRef} aria-label={`${c.name} standings`}>
        {rows.map((s, rowIndex) => {
          const up = prevVotes.has(s.id) && prevVotes.get(s.id)! < s.votes;
          const pct = (s.votes / max) * 100;
          const isLeader = s.rank === 1 && s.votes > 0;
          return (
            <li key={`${c.id}:${s.id}`} data-key={`${c.id}:${s.id}`} className={`row${up ? ' up' : ''}${isLeader ? ' leader-row' : ''}`}>
              <span className="rank">{s.votes ? s.rank : '-'}</span>
              {isLeader && <span className="crown" aria-hidden="true" />}
              <div className="row-main">
                <div className="row-label"><b>{leaders.length > 1 && rowIndex === 0 ? leaders.map((l) => l.project || l.name).join(' & ') : s.project || s.name}</b></div>
                <div className="bar"><i style={{ width: `${Math.max(pct, s.votes ? 10 : 0)}%` }} /></div>
              </div>
              {showCounts && <span className="n">{s.votes.toLocaleString('en')}<small>votes</small></span>}
            </li>
          );
        })}
      </ol>
      {c.standings.length > displayedCount && <p className="more">+{c.standings.length - displayedCount} more makers</p>}
    </section>
  );
}

function KeyForm({ message, onUnlock, onError }: { message: string | null; onUnlock: () => void; onError: (m: string) => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  return (
    <div className="center">
      <form className="keyform" onSubmit={async (e) => {
        e.preventDefault();
        if (submitting.current || !key.trim()) return;
        submitting.current = true; setBusy(true);
        try { await api('/api/display/auth', { method: 'POST', body: { key: key.trim() } }); onUnlock(); }
        catch (err) { onError((err as Error).message); }
        finally { submitting.current = false; setBusy(false); }
      }}>
        <img className="brand-lockup" src="/mc-logo-lockup.png" alt="The Maker Collective 2026" />
        <h1>Live results</h1>
        <p>This screen is protected. Open the display link from the admin console, or enter the display key.</p>
        {message && <p className="err">{message}</p>}
        <input type="password" placeholder="Display key" autoComplete="off" autoFocus required disabled={busy} value={key} onChange={(e) => setKey(e.target.value)} />
        <button type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
      </form>
    </div>
  );
}
