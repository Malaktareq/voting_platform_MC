import { useState } from 'react';
import { api } from '../../lib/api';
import { fmtTime } from '../../lib/util';
import { LoadError, PageHead, Spinner, useLoad } from '../ui';

interface Row { id: string; name: string; phone: string; verified_at: string; votes: number; consent_outreach: boolean }
const LIMIT = 50;

/** Verified visitors (F14). Phones are masked here; full numbers only in the audited export. */
export default function Visitors() {
  const [offset, setOffset] = useState(0);
  const { data, error } = useLoad(() => api<{ total: number; visitors: Row[] }>(`/api/admin/visitors?limit=${LIMIT}&offset=${offset}`), [offset]);
  if (error) return <LoadError error={error} />;
  if (!data) return <Spinner />;
  return (
    <div>
      <PageHead title="Visitors" sub="Verified visitors. Phone numbers are encrypted at rest and masked here; full numbers are only in the export (logged in the audit trail).">
        <a className="btn" href="/api/admin/export/visitors.csv?consented=true">Export (opted-in only)</a>
        <a className="btn" href="/api/admin/export/visitors.csv">Export all</a>
      </PageHead>
      <section className="card flush">
        <div className="table-wrap">
          <table className="table">
            <thead><tr>{['Name', 'Phone', 'Verified', 'Votes', 'Outreach opt-in'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {data.visitors.length === 0 && <tr><td colSpan={5} className="empty">No verified visitors yet.</td></tr>}
              {data.visitors.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td><td className="mono">{v.phone}</td><td>{fmtTime(v.verified_at)}</td><td className="num">{v.votes}</td>
                  <td>{v.consent_outreach ? <span className="pill ok">Yes</span> : <span className="pill">No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span className="muted">{data.total ? `${offset + 1}–${Math.min(offset + LIMIT, data.total)} of ${data.total}` : ''}</span>
          <button className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(offset - LIMIT)}>← Prev</button>
          <button className="btn btn-sm" disabled={offset + LIMIT >= data.total} onClick={() => setOffset(offset + LIMIT)}>Next →</button>
        </div>
      </section>
    </div>
  );
}
