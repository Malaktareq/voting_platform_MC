import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { VisitorSession } from '../lib/types';
import { useVote } from './VoteContext';

export interface FormState { name: string; phone: string; consent: boolean }
export interface Challenge { id: string; phone: string; resendAt: number; devCode?: string }

interface OtpResponse { challengeId: string; phone: string; expiresIn: number; resendIn: number; devCode?: string }
const toChallenge = (r: OtpResponse): Challenge => ({ id: r.challengeId, phone: r.phone, resendAt: Date.now() + r.resendIn * 1000, devCode: r.devCode });

function UserIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="14" r="8" />
      <path d="M9 43v-5c0-9 6.7-15 15-15s15 6 15 15v5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 46 32" aria-hidden="true">
      <path d="M2 16h39M29 3l13 13-13 13" />
    </svg>
  );
}

/** Step 1 — name + mobile number (F5). */
export function RegisterScreen({ form, setForm, setChallenge }: {
  form: FormState; setForm: (f: FormState) => void; setChallenge: (c: Challenge) => void;
}) {
  const { t, location, setOnSite, setLocation, reload, data } = useVote();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add('vote-login');
    return () => document.body.classList.remove('vote-login');
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    if (!(e.currentTarget as HTMLFormElement).reportValidity()) return;
    const f = { ...form, name: form.name.trim(), phone: form.phone.trim() };
    if (f.name.length < 2) { nameRef.current?.focus(); setErr(`${t('name')} ✱`); return; }
    if (!f.phone) { phoneRef.current?.focus(); setErr(`${t('phone')} ✱`); return; }
    submitting.current = true;
    setBusy(true); setErr(null);
    try {
      const r = await api<OtpResponse>('/api/public/otp/request', { method: 'POST', body: { ...f, location: location ?? undefined } });
      setChallenge(toChallenge(r));
    } catch (ex) {
      const e2 = ex as ApiError;
      if (e2.code === 'not_on_site') { setOnSite(false); setLocation(null); return; }
      if (e2.code === 'voting_closed') { await reload(); return; }
      setErr(e2.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="voter-login" aria-labelledby="voter-login-title">
      <div className="paper-noise" aria-hidden="true" />
      <img className="asset-decor asset-purple-corner" src="/assets/corner-purple.svg" alt="" />
      <img className="asset-decor asset-turquoise-circle" src="/assets/circle-turquoise.svg" alt="" />
      <img className="asset-decor asset-yellow-circle" src="/assets/circle-yellow.svg" alt="" />
      <img className="asset-decor asset-purple-arcs" src="/assets/arcs-purple.svg" alt="" />
      <img className="asset-decor asset-gear" src="/assets/gear-navy.svg" alt="" />
      <img className="asset-decor asset-connectors" src="/assets/connectors.svg" alt="" />
      <img className="asset-decor asset-yellow-rays" src="/assets/rays-yellow.svg" alt="" />
      <img className="asset-decor asset-royal-accent" src="/assets/accent-royal.svg" alt="" />

      <header className="maker-brand" aria-label="The Maker Collective 2026">
        <img src="/assets/maker-logo.png" alt="The Maker Collective 2026 — organized by Crown Prince Foundation" />
      </header>

      <figure className="workshop-photo">
        <img src="/assets/maker-workshop.jpg" alt="" />
        <div className="photo-tint" aria-hidden="true" />
      </figure>

      <form className="login-card" noValidate onSubmit={submit}>
        <img className="card-burgundy-asset" src="/assets/corner-burgundy.svg" alt="" />
        <p className="eyebrow">{t('heroKicker')}</p>
        <h1 id="voter-login-title">
          Pick your
          <br />
          <em>favourite makers</em>
        </h1>
        {data.qrEntryRequired && !data.qrEntryAllowed && <p className="qr-required" role="note">{t('qrRequired')}</p>}
        <span className="title-rule" aria-hidden="true" />
        <label className="login-design-field" htmlFor="f-name">
          <span className="sr-only">{t('name')}</span>
          <span className="field-icon user-icon"><UserIcon /></span>
          <input id="f-name" ref={nameRef} name="name" autoComplete="name" required minLength={2} maxLength={80}
            placeholder={t('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="login-design-field" htmlFor="f-phone">
          <span className="sr-only">{t('phone')}</span>
          <span className="field-icon number-icon" aria-hidden="true">#</span>
          <input id="f-phone" ref={phoneRef} name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={40} pattern="[+0-9٠-٩۰-۹\s\(\).\-]+" dir="ltr"
            placeholder={t('number')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        {err && <p className="alert">{err}</p>}
        <button className="login-design-submit" type="submit" disabled={busy}>
          <span>{busy ? t('sending') : t('sendCode')}</span>
          <ArrowIcon />
        </button>
      </form>
    </section>
  );
}

/** Step 2 — one-time SMS code (F6). Auto-submits at 6 digits; supports Arabic-Indic digits. */
export function OtpScreen({ challenge, setChallenge, form }: {
  challenge: Challenge; setChallenge: (c: Challenge | null) => void; form: FormState;
}) {
  const { t, location, setSession } = useVote();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { inputRef.current?.focus(); }, [challenge.id]);
  const resendIn = Math.max(0, Math.ceil((challenge.resendAt - now) / 1000));

  const verify = async (value: string) => {
    if (value.length !== 6 || submitting.current) return;
    submitting.current = true;
    setBusy(true); setErr(null);
    try {
      const r = await api<{ session: VisitorSession }>('/api/public/otp/verify', { method: 'POST', body: { challengeId: challenge.id, code: value } });
      setChallenge(null);
      setSession(r.session);
      window.scrollTo({ top: 0 });
    } catch (ex) {
      const e2 = ex as ApiError;
      setErr(e2.message);
      if (['otp_expired', 'otp_locked', 'otp_invalid'].includes(e2.code || '')) setCode('');
      inputRef.current?.select();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const onChange = (raw: string) => {
    const v = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '').slice(0, 6);
    setCode(v);
    if (v.length === 6) verify(v);
  };

  const resend = async () => {
    if (submitting.current || resendIn > 0) return;
    submitting.current = true; setBusy(true);
    setErr(null);
    try {
      const r = await api<OtpResponse>('/api/public/otp/request', { method: 'POST', body: { ...form, location: location ?? undefined } });
      setChallenge(toChallenge(r));
      setCode('');
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      submitting.current = false; setBusy(false);
    }
  };

  return (
    <section className="panel form">
      <div className="glyph glyph-sms" aria-hidden="true" />
      <h1 className="title-sm">{t('otpTitle')}</h1>
      <p className="muted">{t('otpBody', challenge.phone)}</p>
      {challenge.devCode && <p className="demo">{t('demoCode', challenge.devCode)}</p>}
      <form onSubmit={(e) => { e.preventDefault(); verify(code); }}>
        <input id="f-code" ref={inputRef} className="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
          maxLength={6} required aria-label={t('otpTitle')} dir="ltr" value={code} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        {err && <p className="alert">{err}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? t('verifying') : t('verify')}</button>
      </form>
      <div className="row-between">
        <button className="btn btn-link" type="button" disabled={busy} onClick={() => setChallenge(null)}>{t('changeNumber')}</button>
        <button className="btn btn-ghost" type="button" disabled={busy || resendIn > 0} onClick={resend}>
          {resendIn > 0 ? t('resendIn', resendIn) : t('resend')}
        </button>
      </div>
    </section>
  );
}
