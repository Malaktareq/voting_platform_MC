import { api } from '../../lib/api';
import { fmtTime } from '../../lib/util';
import { PageHead, Spinner, useLoad } from '../ui';

interface Entry { id: string; actor: string; action: string; detail: Record<string, unknown>; ip: string | null; created_at: string }

export default function Audit() {
  const { data, error, loading, reload } = useLoad(() => api<{ entries: Entry[] }>('/api/admin/audit'));
  return (
    <div>
      <PageHead title="Audit log" sub="Last 100 security-relevant events and admin actions.">
        <button type="button" className="btn" disabled={loading} aria-busy={loading} onClick={() => { void reload(); }}>{loading ? 'Refreshing…' : error ? 'Retry' : 'Refresh'}</button>
      </PageHead>
      {error && <p className="alert" role="alert">Could not refresh the audit log: {error}{data ? ' Showing previously loaded entries.' : ''}</p>}
      {!data && loading && <Spinner />}
      {data && <section className="card flush" aria-busy={loading}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr>{['When', 'Who', 'Action', 'Details', 'IP'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {data.entries.length === 0 && <tr><td colSpan={5} className="empty">No audit entries yet.</td></tr>}
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{fmtTime(e.created_at)}</td>
                  <td>{e.actor}</td>
                  <td><span className={`pill ${/failed|reset|deleted|purged|disabled/.test(e.action) ? 'warn' : ''}`}>{e.action.replace(/_/g, ' ')}</span></td>
                  <td className="mono small">{Object.keys(e.detail || {}).length ? (
                    <details className="audit-details">
                      <summary>View details</summary>
                      <pre>{JSON.stringify(e.detail, null, 2)}</pre>
                    </details>
                  ) : '—'}</td>
                  <td className="mono small">{e.ip || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>}
    </div>
  );
}
