import { useState } from 'react';
import { api } from '../../lib/api';
import type { ResultsSnapshot } from '../../lib/types';
import { accent, fmtTime } from '../../lib/util';
import { LoadError, Modal, PageHead, Spinner, useAdmin, useLoad } from '../ui';

export default function Results() {
  const { isAdmin } = useAdmin();
  const { data: snap, error, reload } = useLoad(() => api<ResultsSnapshot>('/api/admin/results'));
  const [resetting, setResetting] = useState(false);
  if (error) return <LoadError error={error} />;
  if (!snap) return <Spinner />;

  return (
    <div>
      <PageHead title="Results" sub={`${snap.totals.votes} votes from ${snap.totals.voters} verified visitors · updated ${fmtTime(snap.generated_at)}`}>
        <a className="btn" href="/api/admin/export/results.csv">Export CSV</a>
        <a className="btn" href="/api/admin/export/results.json">Export JSON</a>
        <button className="btn" onClick={reload}>Refresh</button>
        {isAdmin && <button className="btn btn-danger" onClick={() => setResetting(true)}>Reset results…</button>}
      </PageHead>
      <div className="cat-grid">
        {snap.categories.map((c, i) => {
          const max = Math.max(1, ...c.standings.map((s) => s.votes));
          return (
            <section key={c.id} className="card" style={accent(i)}>
              <div className="cat-bar" />
              <div className="card-head"><h2>{c.name}</h2><span className="muted">{c.total} votes</span></div>
              <ol className="result-list">
                {c.standings.map((s) => (
                  <li key={s.id} className={s.rank === 1 && s.votes ? 'lead' : ''}>
                    <span className="rk">{s.votes ? s.rank : '–'}</span>
                    <div>
                      <div className="rl"><b>{s.project || s.name}</b><span className="muted small">{s.name}</span></div>
                      <div className="bar"><i style={{ width: `${(s.votes / max) * 100}%` }} /></div>
                    </div>
                    <b className="num">{s.votes}</b>
                    <span className="muted small pct">{c.total ? `${((100 * s.votes) / c.total).toFixed(1)}%` : '0%'}</span>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
      {resetting && <ResetDialog onClose={() => setResetting(false)} onDone={() => { setResetting(false); reload(); }} />}
    </div>
  );
}

function ResetDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useAdmin();
  const [typed, setTyped] = useState('');
  const [purge, setPurge] = useState(false);
  return (
    <Modal title="Reset results" onClose={onClose}>
      <div className="stack">
        <p>This permanently deletes every vote (e.g. after a rehearsal). A snapshot of the current counts is kept in the audit log. Export first if you need the data.</p>
        <label className="check"><input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} /><span>Also delete all visitor registrations (names &amp; phone numbers)</span></label>
        <input className="input" placeholder="Type RESET" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <div className="actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={typed !== 'RESET'} onClick={async () => {
            try {
              const r = await api<{ deleted: number }>('/api/admin/results/reset', { method: 'POST', body: { confirm: 'RESET', purgeVisitors: purge } });
              toast(`Deleted ${r.deleted} votes`); onDone();
            } catch (ex) { toast((ex as Error).message, 'err'); }
          }}>Delete all votes</button>
        </div>
      </div>
    </Modal>
  );
}
