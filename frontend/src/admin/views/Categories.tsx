import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { AdminCategory } from '../../lib/types';
import { accent } from '../../lib/util';
import { useLang } from '../i18n';
import { LoadError, Modal, PageHead, Spinner, useAdmin, useLoad } from '../ui';
import { useAction } from '../useAction';

export default function Categories() {
  const { isAdmin, toast, confirm } = useAdmin();
  const { t } = useLang();
  const c_ = t.cat;
  const { data, error, reload } = useLoad(() => api<{ categories: AdminCategory[] }>('/api/admin/categories'));
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  const { busy, pending, run } = useAction();
  if (error) return <LoadError error={error} />;
  if (!data) return <Spinner />;
  const cats = data.categories;

  const remove = (c: AdminCategory) => run(`delete-${c.id}`, async () => {
    if (!(await confirm(c_.confirmDelete(c.name), { danger: true, confirmText: t.common.delete }))) return;
    try {
      await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
    } catch (ex) {
      if ((ex as ApiError).code !== 'has_votes') throw ex;
      if (!(await confirm(c_.confirmForce(c.name), { danger: true, confirmText: c_.forceBtn, typeToConfirm: 'DELETE' }))) return;
      await api(`/api/admin/categories/${c.id}?force=true`, { method: 'DELETE' });
    }
    toast(c_.deleted); reload();
  });

  return (
    <div>
      <PageHead title={c_.title} sub={c_.sub}>
        {isAdmin && <button className="btn btn-primary" disabled={busy} onClick={() => setEditing('new')}>{c_.add}</button>}
      </PageHead>
      <div className="cat-grid">
        {cats.map((c, i) => (
          <section key={c.id} className={`card cat-card${c.is_active ? '' : ' inactive'}`} style={accent(i)}>
            <div className="cat-bar" />
            <h2>{c.name}</h2>
            <p className="muted">{c.description || c_.noDescription}</p>
            <div className="cat-meta"><span>{c_.exhibitors(c.exhibitor_count)}</span>{!c.is_active && <span className="pill">{c_.hidden}</span>}</div>
            {isAdmin && <div className="actions">
              <button className="btn btn-sm" disabled={busy} onClick={() => setEditing(c)}>{t.common.edit}</button>
              <button className="btn btn-sm btn-ghost danger" disabled={busy} aria-busy={pending === `delete-${c.id}`} onClick={() => remove(c)}>{pending === `delete-${c.id}` ? t.common.deleting : t.common.delete}</button>
            </div>}
          </section>
        ))}
      </div>
      {editing && <CategoryForm category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast(c_.saved); reload(); }} />}
    </div>
  );
}

function CategoryForm({ category, onClose, onSaved }: { category: AdminCategory | null; onClose: () => void; onSaved: () => void }) {
  const { t, err: errText } = useLang();
  const c_ = t.cat;
  const isNew = !category;
  const [name, setName] = useState(category?.name || '');
  const [slug, setSlug] = useState(category?.slug || '');
  const [description, setDescription] = useState(category?.description || '');
  const [active, setActive] = useState(category ? category.is_active : true);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  return (
    <Modal title={isNew ? c_.addTitle : c_.editTitle} busy={busy} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;
        await run('save', async () => {
          setErr(null);
          try {
            await api(isNew ? '/api/admin/categories' : `/api/admin/categories/${category!.id}`, {
              method: isNew ? 'POST' : 'PUT',
              body: { name, slug: slug.trim() || undefined, description, is_active: active },
            });
            onSaved();
          } catch (ex) { setErr(errText(ex)); }
        });
      }}>
        <label className="field"><span>{c_.name}</span><input className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>{c_.slug}</span><input className="input mono" dir="ltr" maxLength={40} autoCapitalize="none" spellCheck={false} disabled={busy} placeholder={c_.slugPh} value={slug} onChange={(e) => setSlug(e.target.value)} />
          <small className="muted">{c_.slugHint}</small>
        </label>
        <label className="field"><span>{c_.description}</span><textarea className="input" rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>{c_.active}</span></label>
        {err && <p className="alert">{err}</p>}
        <div className="actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>{t.common.cancel}</button><button className="btn btn-primary" disabled={busy} aria-busy={busy}>{busy ? t.common.saving : t.common.save}</button></div>
      </form>
    </Modal>
  );
}
