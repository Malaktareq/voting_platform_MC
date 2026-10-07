import { useState } from 'react';
import { api } from '../../lib/api';
import type { AdminUser } from '../../lib/types';
import { fmtTime } from '../../lib/util';
import { PageHead, useAdmin, useLoad } from '../ui';

interface UserRow extends AdminUser { last_login_at: string | null }

/** Two-factor authentication, password change, team accounts. */
export default function Security() {
  const { isAdmin } = useAdmin();
  return (
    <div>
      <PageHead title="Security" sub="Admin sign-in, two-factor authentication and team access." />
      <MfaCard />
      <PasswordCard />
      {isAdmin && <UsersCard />}
    </div>
  );
}

function MfaCard() {
  const { me, setMe, toast } = useAdmin();
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');

  if (me.totp_enabled) {
    return (
      <section className="card">
        <div className="card-head"><h2>Two-factor authentication</h2><span className="pill ok">Enabled</span></div>
        <p className="muted">Sign-in requires your password and a code from your authenticator app.</p>
        <details><summary>Disable two-factor</summary>
          <div className="grid3">
            <input className="input" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <input className="input" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <button className="btn btn-danger" onClick={async () => {
              try { await api('/api/admin/mfa/disable', { method: 'POST', body: { password: pw, code } }); setMe({ ...me, totp_enabled: false }); toast('Two-factor disabled', 'warn'); }
              catch (ex) { toast((ex as Error).message, 'err'); }
            }}>Disable</button>
          </div>
        </details>
      </section>
    );
  }
  if (setup) {
    return (
      <section className="card">
        <div className="card-head"><h2>Set up two-factor</h2></div>
        <div className="mfa-setup">
          <img src={setup.qr} alt="Authenticator QR code" />
          <div className="stack">
            <p>1. Scan this QR code with your authenticator app.</p>
            <p className="muted small">Or enter this key manually: <code>{setup.secret}</code></p>
            <p>2. Enter the 6-digit code it shows:</p>
            <input className="input otp-in" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="123456" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <button className="btn btn-primary" onClick={async () => {
              try { await api('/api/admin/mfa/enable', { method: 'POST', body: { code } }); setMe({ ...me, totp_enabled: true }); setSetup(null); setCode(''); toast('Two-factor enabled'); }
              catch (ex) { toast((ex as Error).message, 'err'); }
            }}>Turn on two-factor</button>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="card">
      <div className="card-head"><h2>Two-factor authentication</h2><span className="pill warn">Not enabled</span></div>
      <p className="muted">Protect the admin console with a time-based code (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).</p>
      <button className="btn btn-primary" onClick={async () => setSetup(await api('/api/admin/mfa/setup', { method: 'POST', body: {} }))}>Set up two-factor</button>
    </section>
  );
}

function PasswordCard() {
  const { toast } = useAdmin();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  return (
    <section className="card">
      <div className="card-head"><h2>Change password</h2></div>
      <p className="muted">Changing your password signs out every other session.</p>
      <form className="grid3" onSubmit={async (e) => {
        e.preventDefault();
        try { await api('/api/admin/password', { method: 'POST', body: { current, next } }); setCurrent(''); setNext(''); toast('Password changed'); }
        catch (ex) { toast((ex as Error).message, 'err'); }
      }}>
        <label className="field"><span>Current password</span><input className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="field"><span>New password (10+ chars)</span><input className="input" type="password" autoComplete="new-password" required minLength={10} maxLength={200} value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <div className="field"><span>&nbsp;</span><button className="btn btn-primary">Update password</button></div>
      </form>
    </section>
  );
}

function UsersCard() {
  const { me, toast, confirm } = useAdmin();
  const { data, reload } = useLoad(() => api<{ users: UserRow[] }>('/api/admin/users'));
  const [u, setU] = useState({ username: '', password: '', role: 'admin' });
  return (
    <section className="card flush">
      <div className="card-head pad"><h2>Team accounts</h2></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr>{['User', 'Role', '2FA', 'Last sign-in', ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>
            {data?.users.map((x) => (
              <tr key={x.id}>
                <td><b>{x.username}</b></td><td>{x.role}</td>
                <td>{x.totp_enabled ? <span className="pill ok">On</span> : <span className="pill warn">Off</span>}</td>
                <td>{fmtTime(x.last_login_at)}</td>
                <td className="row-actions">{x.id === me.id ? <span className="muted small">you</span> : (
                  <button className="btn btn-sm btn-ghost danger" onClick={async () => {
                    if (!(await confirm(`Remove ${x.username}?`, { danger: true, confirmText: 'Remove' }))) return;
                    await api(`/api/admin/users/${x.id}`, { method: 'DELETE' }); toast('User removed'); reload();
                  }}>Remove</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="add-user" onSubmit={async (e) => {
        e.preventDefault();
        try { await api('/api/admin/users', { method: 'POST', body: u }); toast('User added'); setU({ username: '', password: '', role: 'admin' }); reload(); }
        catch (ex) { toast((ex as Error).message, 'err'); }
      }}>
        <input className="input" placeholder="username" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9._\-]{3,32}" title="3–32 letters, digits, dots, underscores or hyphens" value={u.username} onChange={(e) => setU({ ...u, username: e.target.value })} />
        <input className="input" type="password" placeholder="temporary password (10+)" required minLength={10} maxLength={200} value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} />
        <select className="input" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}>
          <option value="admin">Administrator</option><option value="viewer">Viewer (read-only)</option>
        </select>
        <button className="btn btn-primary">Add user</button>
      </form>
    </section>
  );
}
