import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { AdminCategory } from '../../lib/types';
import { accent } from '../../lib/util';
import { LoadError, Modal, PageHead, Spinner, useAdmin, useLoad } from '../ui';
import { useAction } from '../useAction';

export default function Categories() {
  const { isAdmin, toast, confirm } = useAdmin();
  const { data, error, reload } = useLoad(() => api<{ categories: AdminCategory[] }>('/api/admin/categories'));
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  const { busy, pending, run } = useAction();
  if (error) return <LoadError error={error} />;
  if (!data) return <Spinner />;
  const cats = data.categories;

  const remove = (c: AdminCategory) => run(`delete-${c.id}`, async () => {
    if (!(await confirm(`Delete category “${c.name}”?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
    } catch (ex) {
      if ((ex as ApiError).code !== 'has_votes') throw ex;
      if (!(await confirm(
        `${(ex as Error).message} Permanently delete “${c.name}” and discard all its votes? This also removes its exhibitor assignments and may leave active exhibitors without a category. This cannot be undone.`,
        { danger: true, confirmText: 'Delete and discard votes', typeToConfirm: 'DELETE' },
      ))) return;
      await api(`/api/admin/categories/${c.id}?force=true`, { method: 'DELETE' });
    }
    toast('Category deleted'); reload();
  });

  return (
    <div>
      <PageHead title="Award categories" sub="MC2026 has three awards. Names are placeholders until the Makerspace team confirms them.">
        {isAdmin && <button className="btn btn-primary" disabled={busy} onClick={() => setEditing('new')}>+ Add category</button>}
      </PageHead>
      <div className="cat-grid">
        {cats.map((c, i) => (
          <section key={c.id} className={`card cat-card${c.is_active ? '' : ' inactive'}`} style={accent(i)}>
            <div className="cat-bar" />
            <h2>{c.name}</h2>
            <p className="muted">{c.description || 'No description'}</p>
            <div className="cat-meta"><span>{c.exhibitor_count} exhibitors</span><span>Order {c.sort_order}</span>{!c.is_active && <span className="pill">Hidden</span>}</div>
            {isAdmin && <div className="actions">
              <button className="btn btn-sm" disabled={busy} onClick={() => setEditing(c)}>Edit</button>
              <button className="btn btn-sm btn-ghost danger" disabled={busy} aria-busy={pending === `delete-${c.id}`} onClick={() => remove(c)}>{pending === `delete-${c.id}` ? 'Deleting…' : 'Delete'}</button>
            </div>}
          </section>
        ))}
      </div>
      {editing && <CategoryForm category={editing === 'new' ? null : editing} nextOrder={cats.length + 1} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast('Category saved'); reload(); }} />}
    </div>
  );
}

function CategoryForm({ category, nextOrder, onClose, onSaved }: { category: AdminCategory | null; nextOrder: number; onClose: () => void; onSaved: () => void }) {
  const isNew = !category;
  const [name, setName] = useState(category?.name || '');
  const [slug, setSlug] = useState(category?.slug || '');
  const [description, setDescription] = useState(category?.description || '');
  const [order, setOrder] = useState(String(category?.sort_order ?? nextOrder));
  const [active, setActive] = useState(category ? category.is_active : true);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  return (
    <Modal title={isNew ? 'Add category' : 'Edit category'} busy={busy} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;
        if (!/^\d+$/.test(order) || !Number.isSafeInteger(Number(order)) || Number(order) > 2147483647) {
          setErr('Display order must be a whole number between 0 and 2147483647.');
          return;
        }
        await run('save', async () => {
        setErr(null);
        try {
          await api(isNew ? '/api/admin/categories' : `/api/admin/categories/${category!.id}`, {
            method: isNew ? 'POST' : 'PUT',
            body: { name, slug: slug.trim() || undefined, description, sort_order: Number(order), is_active: active },
          });
          onSaved();
        } catch (ex) { setErr((ex as Error).message); }
        });
      }}>
        <label className="field"><span>Name</span><input className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Slug (optional)</span><input className="input mono" maxLength={40} autoCapitalize="none" spellCheck={false} disabled={busy} placeholder="e.g. community-choice" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <small className="muted">Leave blank to generate from the name. Slugs must be unique; spaces and punctuation are converted to hyphens when saved.</small>
        </label>
        <label className="field"><span>Description (shown to visitors)</span><textarea className="input" rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="grid2">
          <label className="field"><span>Display order</span><input className="input" type="number" min={0} max={2147483647} step={1} required value={order} onChange={(e) => setOrder(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Active</span></label>
        </div>
        {err && <p className="alert">{err}</p>}
        <div className="actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} aria-busy={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}
