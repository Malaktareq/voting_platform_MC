import { useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { AdminCategory, AdminExhibitor } from '../../lib/types';
import { accent, initials } from '../../lib/util';
import { LoadError, Modal, PageHead, Spinner, useAdmin, useLoad } from '../ui';

export default function Exhibitors() {
  const { isAdmin, toast, confirm } = useAdmin();
  const { data, error, reload } = useLoad(() => Promise.all([
    api<{ exhibitors: AdminExhibitor[] }>('/api/admin/exhibitors'),
    api<{ categories: AdminCategory[] }>('/api/admin/categories'),
  ]));
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<AdminExhibitor | 'new' | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data[0].exhibitors.filter((e) => !term || `${e.name} ${e.project} ${e.booth}`.toLowerCase().includes(term));
  }, [data, q]);

  if (error) return <LoadError error={error} />;
  if (!data) return <Spinner />;
  const [{ exhibitors }, { categories }] = data;
  const catIndex = (id: number) => Math.max(0, categories.findIndex((c) => c.id === id));

  const remove = async (e: AdminExhibitor) => {
    if (!(await confirm(`Delete “${e.project || e.name}”?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await api(`/api/admin/exhibitors/${e.id}`, { method: 'DELETE' });
    } catch (ex) {
      if ((ex as ApiError).code !== 'has_votes') return toast((ex as Error).message, 'err');
      if (!(await confirm((ex as Error).message, { danger: true, confirmText: 'Delete and discard votes', typeToConfirm: 'DELETE' }))) return;
      await api(`/api/admin/exhibitors/${e.id}?force=true`, { method: 'DELETE' });
    }
    toast('Exhibitor deleted'); reload();
  };

  return (
    <div>
      <PageHead title="Exhibitors" sub={`${exhibitors.length} exhibitors · photos, descriptions and category assignments`}>
        {isAdmin && <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add exhibitor</button>}
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
                    <button className="btn btn-sm" onClick={() => setEditing(e)}>Edit</button>
                    <button className="btn btn-sm btn-ghost danger" onClick={() => remove(e)}>Delete</button>
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
  const set = (k: keyof typeof f, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const toggleCat = (id: number) => set('category_ids', f.category_ids.includes(id) ? f.category_ids.filter((x) => x !== id) : [...f.category_ids, id]);

  const save = async (force = false): Promise<void> => {
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
        if (await confirm(`${(ex as Error).message} Continue?`, { danger: true, confirmText: 'Discard votes & save' })) return save(true);
      } else setErr((ex as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'Add exhibitor' : 'Edit exhibitor'} wide onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="photo-row">
          <div className="photo-preview">{preview ? <img src={preview} alt="" /> : <div className="ph">No photo</div>}</div>
          <div className="stack tight">
            <label className="field"><span>Photo / visual</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => {
                const fl = e.target.files?.[0];
                if (!fl) return;
                if (fl.size > 3 * 1024 * 1024) { toast('Image must be under 3 MB', 'err'); e.target.value = ''; return; }
                setFile(fl); setRemovePhoto(false); setPreview(URL.createObjectURL(fl));
              }} /></label>
            <p className="muted small">JPEG, PNG or WebP · max 3 MB · landscape 4:3 looks best</p>
            {exhibitor?.image && !removePhoto && <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { setRemovePhoto(true); setFile(null); setPreview(null); }}>Remove photo</button>}
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
        <label className="field"><span>Short description</span><textarea className="input" rows={3} maxLength={400} placeholder="One or two sentences visitors will see" value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
        <div className="field"><span>Competes in</span>
          <div className="chips">{categories.map((c, i) => (
            <label key={c.id} className="check-chip" style={accent(i)}>
              <input type="checkbox" checked={f.category_ids.includes(c.id)} onChange={() => toggleCat(c.id)} /><span>{c.name}</span>
            </label>
          ))}</div>
        </div>
        {err && <p className="alert">{err}</p>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{isNew ? 'Add exhibitor' : 'Save changes'}</button></div>
      </form>
    </Modal>
  );
}
