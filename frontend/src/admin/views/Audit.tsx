import { api } from '../../lib/api';
import { fmtTime } from '../../lib/util';
import { LoadError, PageHead, Spinner, useLoad } from '../ui';

interface Entry { id: string; actor: string; action: string; detail: Record<string, unknown>; ip: string | null; created_at: string }

export default function Audit() {
  const { data, error } = useLoad(() => api<{ entries: Entry[] }>('/api/admin/audit'));
  if (error) return <LoadError error={error} />;
  if (!data) return <Spinner />;
  return (
    <div>
      <PageHead title="Audit log" sub="Last 100 security-relevant events and admin actions." />
      <section className="card flush">
        <div className="table-wrap">
          <table className="table">
            <thead><tr>{['When', 'Who', 'Action', 'Details', 'IP'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{fmtTime(e.created_at)}</td>
                  <td>{e.actor}</td>
                  <td><span className={`pill ${/failed|reset|deleted|purged|disabled/.test(e.action) ? 'warn' : ''}`}>{e.action.replace(/_/g, ' ')}</span></td>
                  <td className="mono small">{Object.keys(e.detail || {}).length ? JSON.stringify(e.detail).slice(0, 140) : ''}</td>
                  <td className="mono small">{e.ip || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
