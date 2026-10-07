import { useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { AdminCategory, AdminExhibitor } from '../../lib/types';
import { accent, initials } from '../../lib/util';
import { LoadError, Modal, PageHead, Spinner, useAdmin, useLoad } from '../ui';
import { useAction } from '../useAction';

export default function Exhibitors() {
  const { isAdmin, toast, confirm } = useAdmin();
  const { data, error, reload } = useLoad(() => Promise.all([
    api<{ exhibitors: AdminExhibitor[] }>('/api/admin/exhibitors'),
    api<{ categories: AdminCategory[] }>('/api/admin/categories'),
  ]));
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<AdminExhibitor | 'new' | null>(null);
  const { busy, pending, run } = useAction();

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data[0].exhibitors.filter((e) => !term || `${e.name} ${e.project} ${e.booth}`.toLowerCase().includes(term));
  }, [data, q]);

  if (error) return <LoadError error={error} />;
  if (!data) return <Spinner />;
  const [{ exhibitors }, { categories }] = data;
  const catIndex = (id: number) => Math.max(0, categories.findIndex((c) => c.id === id));

  const remove = (e: AdminExhibitor) => run(`delete-${e.id}`, async () => {
    if (!(await confirm(`Delete “${e.project || e.name}”?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await api(`/api/admin/exhibitors/${e.id}`, { method: 'DELETE' });
    } catch (ex) {
      if ((ex as ApiError).code !== 'has_votes') return toast((ex as Error).message, 'err');
      if (!(await confirm((ex as Error).message, { danger: true, confirmText: 'Delete and discard votes', typeToConfirm: 'DELETE' }))) return;
      try { await api(`/api/admin/exhibitors/${e.id}?force=true`, { method: 'DELETE' }); }
      catch (forceError) { toast((forceError as Error).message, 'err'); return; }
    }
    toast('Exhibitor deleted'); reload();
  });

  return (
    <div>
      <PageHead title="Exhibitors" sub={`${exhibitors.length} exhibitors · photos, descriptions and category assignments`}>
        {isAdmin && <button className="btn btn-primary" disabled={busy} onClick={() => setEditing('new')}>+ Add exhibitor</button>}
      </PageHead>
      <section className="card flush">
        <div className="card-tools"><input className="input search" type="search" placeholder="Search exhibitors…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr>{['', 'Project / maker', 'Booth', 'Categories', 'Votes', 'Status', ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="empty">{exhibitors.length ? 'No matches.' : 'No exhibitors yet — add the first one.'}</td></tr>}
              {rows.map((e) => (
                <tr key={e.id} className={e.is_active ? '' : 'inactive'}>
                  <td>{e.image ? <img className="thumb" src={e.image} alt="" /> : <div className="thumb ph">{initials(e.project || e.name)}</div>}</td>
                  <td><b>{e.project || '—'}</b><div className="muted small">{e.name}</div></td>
                  <td>{e.booth || '—'}</td>
                  <td><div className="chips">{e.category_ids.map((id) => {
                    const c = categories.find((x) => x.id === id);
                    return c ? <span key={id} className="chip" style={accent(catIndex(id))}>{c.name}</span> : null;
                  })}</div></td>
                  <td className="num">{e.votes}</td>
                  <td>{e.is_active ? <span className="pill ok">Visible</span> : <span className="pill">Hidden</span>}</td>
                  <td className="row-actions">{isAdmin && (<>
                    <button className="btn btn-sm" disabled={busy} onClick={() => setEditing(e)}>Edit</button>
                    <button className="btn btn-sm btn-ghost danger" disabled={busy} aria-busy={pending === `delete-${e.id}`} onClick={() => remove(e)}>{pending === `delete-${e.id}` ? 'Deleting…' : 'Delete'}</button>
                  </>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing && <ExhibitorForm exhibitor={editing === 'new' ? null : editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function ExhibitorForm({ exhibitor, categories, onClose, onSaved }: {
  exhibitor: AdminExhibitor | null; categories: AdminCategory[]; onClose: () => void; onSaved: () => void;
}) {
  const { toast, confirm } = useAdmin();
  const isNew = !exhibitor;
  const [f, setF] = useState({
    project: exhibitor?.project || '', name: exhibitor?.name || '', booth: exhibitor?.booth || '',
    description: exhibitor?.description || '', is_active: exhibitor ? exhibitor.is_active : true,
    category_ids: exhibitor?.category_ids || ([] as number[]),
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(exhibitor?.image || null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const hasSavedPhoto = !!exhibitor?.image && !removePhoto;
  const set = (k: keyof typeof f, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const toggleCat = (id: number) => set('category_ids', f.category_ids.includes(id) ? f.category_ids.filter((x) => x !== id) : [...f.category_ids, id]);

  const save = async (force = false): Promise<void> => {
    if (saving.current && !force) return;
    const missing: string[] = [];
    if (!f.name.trim()) missing.push('a maker/team name');
    if (f.is_active) {
      if (!file && !hasSavedPhoto) missing.push('a photo (upload one or untick Visible)');
      if (!f.description.trim()) missing.push('a short description');
      if (!f.category_ids.length) missing.push('at least one category');
    }
    if (missing.length) { setErr(`Please provide ${missing.join(', ')}.`); return; }
    saving.current = true;
    const fd = new FormData();
    fd.append('name', f.name); fd.append('project', f.project); fd.append('booth', f.booth);
    fd.append('description', f.description); fd.append('is_active', String(f.is_active));
    fd.append('category_ids', JSON.stringify(f.category_ids));
    if (file) fd.append('photo', file);
    if (removePhoto) fd.append('remove_photo', 'true');
    setBusy(true); setErr(null);
    try {
      await api(isNew ? '/api/admin/exhibitors' : `/api/admin/exhibitors/${exhibitor!.id}${force ? '?force=true' : ''}`, { method: isNew ? 'POST' : 'PUT', form: fd });
      toast(isNew ? 'Exhibitor added' : 'Exhibitor saved');
      onSaved();
    } catch (ex) {
      if ((ex as ApiError).code === 'has_votes' && !force) {
        if (await confirm(`${(ex as Error).message} Continue?`, { danger: true, confirmText: 'Discard votes & save' })) return await save(true);
      } else setErr((ex as Error).message);
    } finally { saving.current = false; setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'Add exhibitor' : 'Edit exhibitor'} wide busy={busy} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (e.currentTarget.reportValidity()) void save(); }}>
        {f.is_active && <p className="muted small">Visible exhibitors require a photo, a short description, and at least one category.</p>}
        <div className="photo-row">
          <div className="photo-preview">{preview ? <img src={preview} alt="" /> : <div className="ph">No photo</div>}</div>
          <div className="stack tight">
            <label className="field"><span>Photo / visual{f.is_active ? ' *' : ''}</span>
              <input ref={photoInput} type="file" required={f.is_active && !hasSavedPhoto} disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={(e) => {
                const fl = e.target.files?.[0];
                if (!fl) { setFile(null); setPreview(hasSavedPhoto ? exhibitor!.image : null); return; }
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(fl.type) || fl.size > 3 * 1024 * 1024) {
                  toast('Photo must be a JPEG, PNG or WebP image under 3 MB.', 'err');
                  e.target.value = ''; setFile(null); setPreview(hasSavedPhoto ? exhibitor!.image : null); return;
                }
                setFile(fl); setRemovePhoto(false); setPreview(URL.createObjectURL(fl));
              }} /></label>
            <p className="muted small">JPEG, PNG or WebP · max 3 MB · landscape 4:3 looks best</p>
            {exhibitor?.image && !removePhoto && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} style={{ alignSelf: 'flex-start' }} onClick={() => {
              setRemovePhoto(true); setFile(null); setPreview(null);
              if (photoInput.current) photoInput.current.value = '';
            }}>Remove photo</button>}
            {f.is_active && removePhoto && !file && <p className="alert" role="status">Upload a replacement photo or untick “Visible on the voting page” before saving.</p>}
          </div>
        </div>
        <div className="grid2">
          <label className="field"><span>Project name</span><input className="input" maxLength={120} placeholder="e.g. SolarSip" value={f.project} onChange={(e) => set('project', e.target.value)} /></label>
          <label className="field"><span>Maker / team *</span><input className="input" maxLength={100} required placeholder="Person or team name" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
        </div>
        <div className="grid2">
          <label className="field"><span>Booth</span><input className="input" maxLength={20} placeholder="e.g. B4" value={f.booth} onChange={(e) => set('booth', e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} /><span>Visible on the voting page</span></label>
        </div>
        <label className="field"><span>Short description{f.is_active ? ' *' : ''}</span><textarea className="input" rows={3} required={f.is_active} maxLength={400} placeholder="One or two sentences visitors will see" value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
        <div className="field"><span>Competes in{f.is_active ? ' * (select at least one)' : ''}</span>
          <div className="chips">{categories.map((c, i) => (
            <label key={c.id} className="check-chip" style={accent(i)}>
              <input type="checkbox" checked={f.category_ids.includes(c.id)} onChange={() => toggleCat(c.id)} /><span>{c.name}</span>
            </label>
          ))}</div>
          {f.is_active && categories.length === 0 && <p className="alert">Create a category first, or untick Visible to save this exhibitor as hidden.</p>}
        </div>
        {err && <p className="alert" role="alert">{err}</p>}
        <div className="actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} aria-busy={busy}>{busy ? 'Saving…' : isNew ? 'Add exhibitor' : 'Save changes'}</button></div>
      </form>
    </Modal>
  );
}
