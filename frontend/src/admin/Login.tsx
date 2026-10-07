import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { PasswordInput } from './PasswordInput';

/** Username + password, then TOTP when the account has two-factor enabled. */
export function Login({ onDone, initialMessage }: { onDone: (mfaSetupRecommended: boolean) => void; initialMessage?: string | null }) {
  const [step, setStep] = useState<'password' | 'mfa'>('password');
  const [err, setErr] = useState<string | null>(initialMessage || null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [now, setNow] = useState(Date.now());
  const [limits, setLimits] = useState({ password: 0, mfa: 0 });
  const [accountLocks, setAccountLocks] = useState<Record<string, number>>({});
  const [cooldownError, setCooldownError] = useState(false);
  const submitting = useRef(false);
  const accountKey = username.trim().toLowerCase();
  const deadline = Math.max(limits[step], step === 'password' ? accountLocks[accountKey] || 0 : 0);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (remaining === 0 && cooldownError) { setErr(null); setCooldownError(false); }
  }, [remaining, cooldownError]);

  const showError = (error: ApiError, requestStep: 'password' | 'mfa') => {
    setErr(error.message);
    const seconds = Number(error.body?.retryAfter);
    const accountLocked = error.code === 'locked' || error.body?.accountLocked === true;
    if ((!accountLocked && error.code !== 'rate_limited') || !Number.isFinite(seconds) || seconds <= 0) return;
    const until = Date.now() + Math.ceil(seconds) * 1000;
    setNow(Date.now()); setCooldownError(true);
    if (accountLocked) setAccountLocks((previous) => ({ ...previous, [accountKey]: until }));
    else setLimits((previous) => ({ ...previous, [requestStep]: until }));
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || Date.now() < Math.max(limits.password, accountLocks[accountKey] || 0)) return;
    submitting.current = true; setBusy(true); setErr(null);
    try {
      const r = await api<{ mfaRequired?: boolean; mfaSetupRecommended?: boolean }>('/api/admin/login', { method: 'POST', body: { username, password } });
      if (r.mfaRequired) { setStep('mfa'); return; }
      onDone(!!r.mfaSetupRecommended);
    } catch (ex) { showError(ex as ApiError, 'password'); } finally { submitting.current = false; setBusy(false); }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || Date.now() < limits.mfa) return;
    submitting.current = true; setBusy(true); setErr(null);
    try { await api('/api/admin/login/mfa', { method: 'POST', body: { code } }); onDone(false); }
    catch (ex) {
      if ((ex as ApiError).code === 'mfa_expired') setStep('password');
      showError(ex as ApiError, 'mfa');
    } finally { submitting.current = false; setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-card">
        <p className="login-title">Admin console</p>
        <h1>{step === 'password' ? 'Sign in' : 'Two-factor check'}</h1>
        {step === 'password' ? (
          <form className="stack" onSubmit={submitPassword}>
            <label className="field"><span>Username</span>
              <input className="input" name="username" autoComplete="username" required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} /></label>
            <label className="field"><span>Password</span>
              <PasswordInput name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {err && <p className="alert">{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || remaining > 0} aria-busy={busy}>{busy ? 'Signing in…' : remaining > 0 ? `Retry in ${countdown}` : 'Sign in'}</button>
          </form>
        ) : (
          <form className="stack" onSubmit={submitCode}>
            <p className="muted">Enter the 6-digit code from your authenticator app.</p>
            <label className="field"><span>Authenticator code</span>
              <input className="input otp-in" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
            {err && <p className="alert">{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || remaining > 0} aria-busy={busy}>{busy ? 'Verifying…' : remaining > 0 ? `Retry in ${countdown}` : 'Verify'}</button>
            <button type="button" className="btn btn-link" disabled={busy} onClick={() => { setStep('password'); setErr(null); }}>Back</button>
          </form>
        )}
      </div>
    </div>
  );
}
