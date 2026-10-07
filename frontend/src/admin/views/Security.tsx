import { useState } from 'react';
import { api } from '../../lib/api';
import type { AdminUser } from '../../lib/types';
import { useLang } from '../i18n';
import { useAdmin, useLoad } from '../ui';
import { PasswordInput } from '../PasswordInput';
import { useAction } from '../useAction';

interface UserRow extends AdminUser { last_login_at: string | null }

/** Two-factor authentication, password change, team accounts. */
export default function Security() {
  const { isAdmin } = useAdmin();
  return (
    <div className="stack">
      <MfaCard />
      <PasswordCard />
      {isAdmin && <UsersCard />}
    </div>
  );
}

function MfaCard() {
  const { me, setMe, toast } = useAdmin();
  const { t } = useLang();
  const s = t.security;
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const { busy, run } = useAction();

  if (me.totp_enabled) {
    return (
      <section className="card">
        <div className="card-head"><h2>{s.mfa}</h2><span className="pill ok">{s.enabled}</span></div>
        <p className="muted">{s.mfaOn}</p>
        <details><summary>{s.disable}</summary>
          <form className="grid3" onSubmit={(e) => {
            e.preventDefault();
            if (!e.currentTarget.reportValidity()) return;
            void run('disable-mfa', async () => {
              await api('/api/admin/mfa/disable', { method: 'POST', body: { password: pw, code } });
              setMe({ ...me, totp_enabled: false }); setPw(''); setCode(''); toast(s.disabled, 'warn');
            });
          }}>
            <label className="field"><span>{s.currentPassword}</span><PasswordInput required disabled={busy} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            <label className="field"><span>{s.code}</span><input className="input" dir="ltr" required disabled={busy} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} pattern="[0-9]{6}" title={s.codeTitle} placeholder={s.codePh} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
            <div className="field"><span>&nbsp;</span><button type="submit" className="btn btn-danger" disabled={busy} aria-busy={busy}>{busy ? s.disabling : s.disableBtn}</button></div>
          </form>
        </details>
      </section>
    );
  }
  if (setup) {
    return (
      <section className="card">
        <div className="card-head"><h2>{s.setupTitle}</h2></div>
        <div className="mfa-setup">
          <img src={setup.qr} alt={s.qrAlt} />
          <form className="stack" onSubmit={(e) => {
            e.preventDefault();
            if (!e.currentTarget.reportValidity()) return;
            void run('enable-mfa', async () => {
              await api('/api/admin/mfa/enable', { method: 'POST', body: { code } });
              setMe({ ...me, totp_enabled: true }); setSetup(null); setCode(''); toast(s.enabledToast);
            });
          }}>
            <p>{s.step1}</p>
            <p className="muted small">{s.manualKey} <code dir="ltr">{setup.secret}</code></p>
            <p>{s.step2}</p>
            <label className="field"><span>{s.code}</span><input className="input otp-in" dir="ltr" required disabled={busy} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} pattern="[0-9]{6}" title={s.codeTitle} placeholder="123456" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{busy ? s.enabling : s.turnOn}</button>
          </form>
        </div>
      </section>
    );
  }
  return (
    <section className="card">
      <div className="card-head"><h2>{s.mfa}</h2><span className="pill warn">{s.notEnabled}</span></div>
      <p className="muted">{s.mfaIntro}</p>
      <button className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={() => run('setup-mfa', async () => {
        setSetup(await api('/api/admin/mfa/setup', { method: 'POST', body: {} }));
      })}>{busy ? s.settingUp : s.setup}</button>
    </section>
  );
}

function PasswordCard() {
  const { toast } = useAdmin();
  const { t } = useLang();
  const s = t.security;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const { busy, run } = useAction();
  return (
    <section className="card">
      <div className="card-head"><h2>{s.password}</h2></div>
      <p className="muted">{s.passwordIntro}</p>
      <form className="grid3" onSubmit={async (e) => {
        e.preventDefault();
        await run('password', async () => {
          await api('/api/admin/password', { method: 'POST', body: { current, next } });
          setCurrent(''); setNext(''); toast(s.changed);
        });
      }}>
        <label className="field"><span>{s.currentPassword}</span><PasswordInput autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="field"><span>{s.newPassword}</span><PasswordInput autoComplete="new-password" required minLength={10} maxLength={200} value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <div className="field"><span>&nbsp;</span><button className="btn btn-primary" disabled={busy} aria-busy={busy}>{busy ? s.updating : s.update}</button></div>
      </form>
    </section>
  );
}

function UsersCard() {
  const { me, toast, confirm } = useAdmin();
  const { t } = useLang();
  const s = t.security;
  const { data, error, loading, reload } = useLoad(() => api<{ users: UserRow[] }>('/api/admin/users'));
  const [u, setU] = useState({ username: '', password: '', role: 'admin' });
  const { busy, pending, run } = useAction();
  return (
    <section className="card flush">
      <div className="card-head pad"><h2>{s.team}</h2><button type="button" className="btn btn-sm" disabled={busy || loading} aria-busy={loading} onClick={() => { void reload(); }}>{loading ? t.common.loading : error ? t.common.retry : t.common.refresh}</button></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr>{s.cols.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="empty" role="status">{s.loadingTeam}</td></tr>}
            {!loading && error && <tr><td colSpan={5}><p className="alert" role="alert">{s.teamError(error)}</p></td></tr>}
            {!loading && !error && data?.users.length === 0 && <tr><td colSpan={5} className="empty">{s.noTeam}</td></tr>}
            {!loading && !error && data?.users.map((x) => (
              <tr key={x.id}>
                <td><b dir="ltr">{x.username}</b></td><td>{s.roles[x.role] ?? x.role}</td>
                <td>{x.totp_enabled ? <span className="pill ok">{s.on}</span> : <span className="pill warn">{s.off}</span>}</td>
                <td>{t.when(x.last_login_at)}</td>
                <td className="row-actions">{x.id === me.id ? <span className="muted small">{t.common.you}</span> : (
                  <button className="btn btn-sm btn-ghost danger" disabled={busy} aria-busy={pending === `remove-${x.id}`} onClick={() => run(`remove-${x.id}`, async () => {
                    if (!(await confirm(s.confirmRemove(x.username), { danger: true, confirmText: s.remove }))) return;
                    await api(`/api/admin/users/${x.id}`, { method: 'DELETE' }); toast(s.removed); reload();
                  })}>{pending === `remove-${x.id}` ? s.removing : s.remove}</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="add-user" onSubmit={async (e) => {
        e.preventDefault();
        await run('add-user', async () => {
          await api('/api/admin/users', { method: 'POST', body: u });
          toast(s.added); setU({ username: '', password: '', role: 'admin' }); reload();
        });
      }}>
        <input className="input" dir="ltr" placeholder={s.usernamePh} required minLength={3} maxLength={32} pattern="[a-zA-Z0-9._\-]{3,32}" title={s.usernameTitle} value={u.username} onChange={(e) => setU({ ...u, username: e.target.value })} />
        <PasswordInput placeholder={s.tempPassword} required minLength={10} maxLength={200} value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} />
        <select className="input" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}>
          <option value="admin">{s.roles.admin}</option><option value="viewer">{s.roles.viewer}</option>
        </select>
        <button className="btn btn-primary" disabled={busy} aria-busy={pending === 'add-user'}>{pending === 'add-user' ? s.adding : s.add}</button>
      </form>
    </section>
  );
}
