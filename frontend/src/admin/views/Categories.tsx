import { useState } from 'react';
import { api } from '../../lib/api';
import type { AdminCategory } from '../../lib/types';
import { accent } from '../../lib/util';
import { LoadError, Modal, PageHead, Spinner, useAdmin, useLoad } from '../ui';

export default function Categories() {
  const { isAdmin, toast, confirm } = useAdmin();
  const { data, error, reload } = useLoad(() => api<{ categories: AdminCategory[] }>('/api/admin/categories'));
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  if (error) return <LoadError error={error} />;
  if (!data) return <Spinner />;
  const cats = data.categories;

  const remove = async (c: AdminCategory) => {
    if (!(await confirm(`Delete category “${c.name}”?`, { danger: true, confirmText: 'Delete' }))) return;
    try { await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' }); toast('Category deleted'); reload(); }
    catch (ex) { toast((ex as Error).message, 'err'); }
  };

  return (
    <div>
      <PageHead title="Award categories" sub="MC2026 has three awards. Names are placeholders until the Makerspace team confirms them.">
        {isAdmin && <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add category</button>}
      </PageHead>
      <div className="cat-grid">
        {cats.map((c, i) => (
          <section key={c.id} className={`card cat-card${c.is_active ? '' : ' inactive'}`} style={accent(i)}>
            <div className="cat-bar" />
            <h2>{c.name}</h2>
            <p className="muted">{c.description || 'No description'}</p>
            <div className="cat-meta"><span>{c.exhibitor_count} exhibitors</span><span>Order {c.sort_order}</span>{!c.is_active && <span className="pill">Hidden</span>}</div>
            {isAdmin && <div className="actions">
              <button className="btn btn-sm" onClick={() => setEditing(c)}>Edit</button>
              <button className="btn btn-sm btn-ghost danger" onClick={() => remove(c)}>Delete</button>
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
  const [description, setDescription] = useState(category?.description || '');
  const [order, setOrder] = useState(String(category?.sort_order ?? nextOrder));
  const [active, setActive] = useState(category ? category.is_active : true);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={isNew ? 'Add category' : 'Edit category'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;
        if (!/^\d+$/.test(order) || !Number.isSafeInteger(Number(order)) || Number(order) > 2147483647) {
          setErr('Display order must be a whole number between 0 and 2147483647.');
          return;
        }
        try {
          await api(isNew ? '/api/admin/categories' : `/api/admin/categories/${category!.id}`, {
            method: isNew ? 'POST' : 'PUT',
            body: { name, slug: isNew ? undefined : category!.slug, description, sort_order: Number(order), is_active: active },
          });
          onSaved();
        } catch (ex) { setErr((ex as Error).message); }
      }}>
        <label className="field"><span>Name</span><input className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Description (shown to visitors)</span><textarea className="input" rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="grid2">
          <label className="field"><span>Display order</span><input className="input" type="number" min={0} max={2147483647} step={1} required value={order} onChange={(e) => setOrder(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Active</span></label>
        </div>
        {err && <p className="alert">{err}</p>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save</button></div>
      </form>
    </Modal>
  );
}
