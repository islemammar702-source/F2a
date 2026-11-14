"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Plus, Shield, Trash2 } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, Checkbox, ConfirmDialog, Field, Input, Loading, Modal, PageHeader, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Permission, Role } from "@/lib/types";

export default function RolesPage() {
  return <RequirePermission perm="roles.manage"><Roles /></RequirePermission>;
}

function Roles() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const roles = useApi<Role[]>("/roles");
  const perms = useApi<Permission[]>("/permissions");
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [del, setDel] = useState(false);
  const role = roles.data?.find((r) => r.id === selected) ?? roles.data?.[0];

  useEffect(() => {
    if (role) setChecked(new Set(role.permissions.map((p) => p.code)));
  }, [role?.id, roles.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const modules = useMemo(() => {
    const m = new Map<string, Permission[]>();
    perms.data?.forEach((p) => m.set(p.module, [...(m.get(p.module) ?? []), p]));
    return [...m.entries()];
  }, [perms.data]);

  if (!roles.data || !perms.data) return <Loading />;
  const locked = role?.code === "admin" || role?.is_client_role;

  const save = async () => {
    if (!role) return;
    setSaving(true);
    try {
      await api(`/roles/${role.id}`, { method: "PATCH", body: { permissions: [...checked] } });
      toast.success(t("roles.saved"));
      roles.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!role) return;
    try {
      await api(`/roles/${role.id}`, { method: "DELETE" });
      toast.success(t("roles.deleted"));
      setDel(false);
      setSelected(null);
      roles.reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <PageHeader title={t("roles.title")} subtitle={t("roles.subtitle")} actions={<Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>{t("roles.new")}</Button>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {roles.data.map((r) => (
              <li key={r.id}>
                <button onClick={() => setSelected(r.id)} className={cx("flex w-full items-center justify-between gap-3 px-5 py-4 text-start hover:bg-surface", role?.id === r.id && "bg-brand-50")}>
                  <span className="flex items-center gap-3">
                    <Shield className={cx("h-5 w-5", role?.id === r.id ? "text-brand" : "text-slate-300")} />
                    <span><span className="block font-semibold text-navy">{lang === "ar" ? r.name_ar : r.name_fr}</span><span className="text-xs text-slate-500">{r.user_count} {t("roles.users")} · {r.permissions.length} perm.</span></span>
                  </span>
                  {r.is_system && <Badge>{t("roles.system")}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {role && (
          <Card className="lg:col-span-2" title={`${t("roles.permissions")} – ${lang === "ar" ? role.name_ar : role.name_fr}`} actions={<>
            {!role.is_system && <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(true)}>{t("common.delete")}</Button>}
            {!locked && <Button size="sm" onClick={save} loading={saving}>{t("common.save")}</Button>}
          </>}>
            {locked && <p className="mb-4 flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-slate-600"><Lock className="h-4 w-4" />{role.code === "admin" ? t("roles.adminLocked") : t("roles.clientRole")}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              {modules.map(([mod, list]) => (
                <div key={mod} className="rounded-xl border border-slate-200 p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t(`modules.${mod}`)}</p>
                  <div className="space-y-2">
                    {list.map((p) => (
                      <Checkbox key={p.code} disabled={locked} label={t(`perm.${p.code}`)} checked={checked.has(p.code)} onChange={(b) => setChecked((s) => {
                        const n = new Set(s);
                        if (b) n.add(p.code); else n.delete(p.code);
                        return n;
                      })} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      {newOpen && <NewRole perms={perms.data} onClose={() => setNewOpen(false)} onSaved={(r) => { roles.reload(); setSelected(r.id); }} />}
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={remove} danger title={t("common.delete")} text={t("common.areYouSure")} />
    </>
  );
}

function NewRole({ perms, onClose, onSaved }: { perms: Permission[]; onClose: () => void; onSaved: (r: Role) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ code: "", name_fr: "", name_ar: "", description: "" });
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api<Role>("/roles", { method: "POST", body: { ...f, permissions: perms.filter((p) => p.code === "dashboard.view").map((p) => p.code) } });
      toast.success(t("roles.saved"));
      onSaved(r);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={t("roles.new")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="role-form" loading={saving}>{t("common.save")}</Button></>}>
      <form id="role-form" onSubmit={submit} className="grid gap-4">
        <Field label={t("roles.code")} hint="a-z, 0-9, _" required><Input dir="ltr" pattern="^[a-z][a-z0-9_]*$" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase() })} required /></Field>
        <Field label={t("roles.nameFr")} required><Input value={f.name_fr} onChange={(e) => setF({ ...f, name_fr: e.target.value })} required /></Field>
        <Field label={t("roles.nameAr")} required><Input dir="rtl" value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} required /></Field>
        <Field label={t("roles.description")}><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}
