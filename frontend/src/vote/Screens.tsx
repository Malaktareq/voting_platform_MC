import { useContext, useState } from 'react';
import { api } from '../lib/api';
import { accent, getLocation } from '../lib/util';
import { useVote, VoteContext } from './VoteContext';

export function ErrorScreen({ message }: { message: string }) {
  const ctx = useContext(VoteContext)!;
  return (
    <section className="panel center">
      <div className="glyph glyph-warn" aria-hidden="true" />
      <h1 className="title-sm">{message}</h1>
      <button className="btn btn-primary" onClick={() => ctx.reload()}>{ctx.t('retry')}</button>
    </section>
  );
}

export function Hero() {
  const { t, data } = useVote();
  return (
    <div className="hero">
      <p className="kicker">{t('heroKicker')}</p>
      <h1 className="title">{t('heroTitle')}</h1>
      <p className="hero-body">{t('heroBody', data.categories.length)}</p>
      <div className="hero-cats">
        {data.categories.map((c, i) => (
          <span key={c.id} className="chip" style={accent(i)}><i aria-hidden="true" />{c.name}</span>
        ))}
      </div>
    </div>
  );
}

export function SummaryList() {
  const { data, session } = useVote();
  if (!session) return null;
  return (
    <ul className="summary">
      {data.categories.map((c, i) => {
        const v = session.votes[c.id];
        const ex = v && data.exhibitors.find((e) => e.id === v.exhibitor_id);
        return (
          <li key={c.id} style={accent(i)}>
            <span className="sum-cat">{c.name}</span>
            <b>{ex ? ex.project || ex.name : '—'}</b>
          </li>
        );
      })}
    </ul>
  );
}

export function ClosedScreen() {
  const { t, data, session, reload } = useVote();
  const v = data.voting;
  const ended = v.reason === 'ended' || (v.reason === 'closed' && !!session && Object.keys(session.votes).length > 0);
  return (
    <section className="panel center">
      <div className="glyph glyph-clock" aria-hidden="true" />
      <h1 className="title">{v.reason === 'not_started' ? t('notStarted') : t('closedTitle')}</h1>
      <p className="muted">{ended ? t('endedBody') : t('closedBody')}</p>
      <SummaryList />
      <button className="btn btn-ghost" onClick={() => reload()}>{t('retry')}</button>
    </section>
  );
}

export function OffsiteScreen() {
  const { t, setLocation, setOnSite, reload } = useVote();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const useMyLocation = async () => {
    setBusy(true); setMsg(null);
    try {
      const loc = await getLocation();
      const r = await api<{ allowed: boolean }>('/api/public/access-check', { method: 'POST', body: { location: loc } });
      if (r.allowed) { setLocation(loc); setOnSite(true); return; }
      setMsg(t('locOutside'));
    } catch (e: any) {
      setMsg(e && e.code === 1 ? t('locDenied') : e?.message || t('locOutside'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <Hero />
      <div className="panel">
        <div className="glyph glyph-pin" aria-hidden="true" />
        <h2 className="title-sm">{t('offTitle')}</h2>
        <p className="muted">{t('offBody')}</p>
        {msg && <p className="alert">{msg}</p>}
        <button className="btn btn-primary btn-block" disabled={busy} onClick={useMyLocation}>{busy ? t('locating') : t('useLocation')}</button>
        <button className="btn btn-ghost btn-block" onClick={() => reload()}>{t('retry')}</button>
      </div>
    </section>
  );
}

export function DoneScreen() {
  const { t } = useVote();
  return (
    <section className="panel center done">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
      </div>
      <div className="glyph glyph-done" aria-hidden="true" />
      <h1 className="title">{t('doneTitle')}</h1>
      <p className="muted">{t('doneBody')}</p>
      <SummaryList />
    </section>
  );
}
