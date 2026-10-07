import { useEffect, useState } from 'react';
import type { ResultsSnapshot } from '../../lib/types';
import { api } from '../../lib/api';
import { useLoad, LoadError, Spinner } from '../ui';

const COLORS = ['#7f32d9', '#4a68d8', '#f8d749'];
const ARABIC_NAMES: Record<string, string> = {
  innovation: '\u0627\u0628\u062a\u0643\u0627\u0631',
  community: '\u0645\u062c\u062a\u0645\u0639',
  entrepreneurship: '\u0631\u064a\u0627\u062f\u0629',
};

function CategoryIcon({ index }: { index: number }) {
  if (index === 0) return <span className="live-icon gear" aria-hidden="true" />;
  if (index === 1) return <span className="live-icon circle" aria-hidden="true" />;
  return <span className="live-icon triangle" aria-hidden="true" />;
}

export default function LiveData() {
  const { data: initial, error } = useLoad(() => api<ResultsSnapshot>('/api/admin/results'));
  const [snapshot, setSnapshot] = useState<ResultsSnapshot | null>(null);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    if (initial) setSnapshot(initial);
  }, [initial]);

  useEffect(() => {
    const stream = new EventSource('/api/display/stream');
    stream.onopen = () => setStreamConnected(true);
    stream.onerror = () => setStreamConnected(false);
    stream.addEventListener('results', (event) => {
      try {
        setSnapshot(JSON.parse((event as MessageEvent).data) as ResultsSnapshot);
        setUpdatedAt(Date.now());
        setStreamConnected(true);
      } catch { /* ignore malformed events */ }
    });
    return () => { stream.close(); setStreamConnected(false); };
  }, []);

  if (error) return <LoadError error={error} />;
  if (!snapshot) return <Spinner />;

  return (
    <div className="live-data-page">
      <img className="live-brand" src="/assets/maker-logo.png" alt="The Maker Collective 2026" />
      <span className="live-decoration live-decoration-gear" aria-hidden="true" />
      <span className="live-decoration live-decoration-sun" aria-hidden="true" />
      <section className="live-hero">
        <div>
          <p className="live-eyebrow">THE MAKER COLLECTIVE 2026</p>
          <h1><span>Live</span> Voting Results</h1>
          <p>See the most voted makers in each category</p>
        </div>
        <div className={`live-status${streamConnected ? ' connected' : ''}`} role="status">
          <i />{streamConnected ? 'LIVE' : 'RECONNECTING'}
        </div>
      </section>

      <div className="live-data-grid">
        {snapshot.categories.slice(0, 3).map((category, index) => {
          const max = Math.max(1, ...category.standings.map((standing) => standing.votes));
          return (
            <section className={`live-category live-category-${index}`} key={category.id}>
              <header className="live-category-head">
                <CategoryIcon index={index} />
                <div>
                  <h2>{category.name}</h2>
                  <p lang="ar" dir="rtl">{ARABIC_NAMES[category.slug] || category.description || 'النتائج المباشرة'}</p>
                </div>
              </header>
              <ol className="live-standing-list">
                {category.standings.slice(0, 3).map((standing, rowIndex) => (
                  <li className={rowIndex === 0 && standing.votes > 0 ? 'leader' : ''} key={standing.id}>
                    <span className="live-rank">{standing.votes ? standing.rank : '-'}</span>
                    <span className={`live-crown${rowIndex === 0 && standing.votes > 0 ? '' : ' is-empty'}`} aria-hidden={rowIndex !== 0 || standing.votes === 0} />
                    <div className="live-standing-main">
                      <b>{standing.project || standing.name}</b>
                      <div className="live-bar"><i style={{ width: `${(standing.votes / max) * 100}%`, background: COLORS[index] }} /></div>
                    </div>
                    <span className="live-votes">{standing.votes}<small>votes</small></span>
                  </li>
                ))}
                {category.standings.length === 0 && (
                  <li className="live-empty">Voting results will appear here</li>
                )}
              </ol>
            </section>
          );
        })}
      </div>

      <footer className="live-data-footer">
        <div>
          <span>BE PART OF THE MAKER COLLECTIVE 2026</span>
          <b>Scan the QR code to <em>cast your vote</em></b>
          <i />
        </div>
        <LiveQr />
        <small><span className="live-update-dot" /> Updated {new Date(updatedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</small>
      </footer>
    </div>
  );
}

function LiveQr() {
  const [data, setData] = useState<{ voteQr: string; voteQrRefreshAt: number } | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const next = await api<{ voteQr: string; voteQrRefreshAt: number }>('/api/admin/links');
        if (!active) return;
        setData(next);
        timer = setTimeout(refresh, Math.max(250, next.voteQrRefreshAt - Date.now() + 100));
      } catch {
        if (active) timer = setTimeout(refresh, 1500);
      }
    };
    void refresh();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, []);

  if (!data?.voteQr) return <div className="live-qr-placeholder">QR</div>;
  return (
    <div className="live-qr-block">
      <div className="live-qr"><img src={data.voteQr} alt="Rotating voting QR code" /></div>
    </div>
  );
}
