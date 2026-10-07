import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AdminUser } from '../lib/types';

// ------------------------------------------------------------------ Modal
export function Modal({ title, wide, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    cardRef.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal">
      <div className="modal-bg" onClick={onClose} />
      <div className={`modal-card${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" ref={cardRef}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Admin context: session, toasts, confirm dialogs
type ToastKind = 'ok' | 'err' | 'warn';
interface ConfirmOpts { danger?: boolean; confirmText?: string; typeToConfirm?: string }
interface AdminCtx {
  me: AdminUser;
  isAdmin: boolean;
  setMe: (m: AdminUser | null) => void;
  toast: (msg: string, kind?: ToastKind) => void;
  confirm: (message: string, opts?: ConfirmOpts) => Promise<boolean>;
}
const Ctx = createContext<AdminCtx | null>(null);
export const useAdmin = () => useContext(Ctx)!;

export function AdminProvider({ me, setMe, children }: { me: AdminUser; setMe: (m: AdminUser | null) => void; children: React.ReactNode }) {
  const [toastState, setToast] = useState<{ msg: string; kind: ToastKind } | null>(null);
  const [dialog, setDialog] = useState<{ message: string; opts: ConfirmOpts; resolve: (v: boolean) => void } | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!toastState) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toastState]);

  const toast = useCallback((msg: string, kind: ToastKind = 'ok') => setToast({ msg, kind }), []);
  const confirm = useCallback((message: string, opts: ConfirmOpts = {}) =>
    new Promise<boolean>((resolve) => { setTyped(''); setDialog({ message, opts, resolve }); }), []);
  const close = (v: boolean) => { dialog?.resolve(v); setDialog(null); };

  return (
    <Ctx.Provider value={{ me, isAdmin: me.role === 'admin', setMe, toast, confirm }}>
      {children}
      {dialog && (
        <Modal title="Are you sure?" onClose={() => close(false)}>
          <div className="stack">
            <p>{dialog.message}</p>
            {dialog.opts.typeToConfirm && <input className="input" placeholder={`Type ${dialog.opts.typeToConfirm}`} value={typed} onChange={(e) => setTyped(e.target.value)} />}
            <div className="actions">
              <button className="btn" onClick={() => close(false)}>Cancel</button>
              <button className={`btn ${dialog.opts.danger ? 'btn-danger' : 'btn-primary'}`}
                disabled={!!dialog.opts.typeToConfirm && typed !== dialog.opts.typeToConfirm} onClick={() => close(true)}>
                {dialog.opts.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {toastState && <div className={`toast ${toastState.kind}`} role="status">{toastState.msg}</div>}
    </Ctx.Provider>
  );
}

// ------------------------------------------------------------------ small pieces
export function PageHead({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function Tile({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return <div className={`tile ${tone || ''}`}><b>{typeof value === 'number' ? value.toLocaleString('en') : value}</b><span>{label}</span></div>;
}

export function Spinner() { return <div className="boot"><span className="spinner" /></div>; }

/** Load data for a view; exposes reload + error. */
export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
  const ctx = useContext(Ctx);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    try { setData(await fn()); setError(null); } catch (e) {
      if ((e as { status?: number }).status === 401 && ctx) { ctx.setMe(null); return; } // session expired → back to sign-in
      setError((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, error, reload: run, setData };
}

export function LoadError({ error }: { error: string }) {
  return <div className="card"><p className="alert">{error}</p></div>;
}
