"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2, UserCheck, UserX } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, Checkbox, ConfirmDialog, Empty, Field, Input, Loading, Modal, PageHeader, Pagination, Select, Table, Td } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Client, Page, Role, User } from "@/lib/types";

export default function UsersPage() {
  return <RequirePermission perm="users.view"><Users /></RequirePermission>;
}

function Users() {
  const { t, lang } = useI18n();
  const { can, user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [roleId, setRoleId] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, loading, reload } = useApi<Page<User>>("/users", { q: dq, role_id: roleId, page, page_size: 15 });
  const roles = useApi<Role[]>("/roles");
  const [edit, setEdit] = useState<User | null | "new">(null);
  const [del, setDel] = useState<User | null>(null);
  useEffect(() => setPage(1), [dq, roleId]);
  const manage = can("users.manage");

  const toggle = async (u: User) => {
    try {
      await api(`/users/${u.id}`, { method: "PATCH", body: { is_active: !u.is_active } });
      toast.success(t("users.updated"));
      reload();
    } catch (e) {
      toast.error(e);
    }
  };
  const remove = async () => {
    if (!del) return;
    try {
      await api(`/users/${del.id}`, { method: "DELETE" });
      toast.success(t("users.deleted"));
      setDel(null);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <PageHeader title={t("users.title")} subtitle={t("users.subtitle")} actions={manage && <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit("new")}>{t("users.new")}</Button>} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="ps-9" placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-auto" value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label={t("users.role")}>
            <option value="">{t("users.role")} : {t("common.all")}</option>
            {roles.data?.map((r) => <option key={r.id} value={r.id}>{lang === "ar" ? r.name_ar : r.name_fr}</option>)}
          </Select>
        </div>
        {loading && !data ? <Loading /> : data && data.items.length === 0 ? <Empty /> : data && (
          <>
            <Table head={[t("users.fullName"), t("common.email"), t("users.role"), t("common.status"), t("users.lastLogin"), ""]}>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <Td className="font-semibold text-navy">{u.full_name}</Td>
                  <Td dir="ltr" className="text-start">{u.email}</Td>
                  <Td><Badge color={u.role.code === "admin" ? "navy" : u.role.is_client_role ? "orange" : "blue"}>{lang === "ar" ? u.role.name_ar : u.role.name_fr}</Badge></Td>
                  <Td><Badge color={u.is_active ? "green" : "gray"}>{u.is_active ? t("users.active") : t("users.inactive")}</Badge></Td>
                  <Td className="text-xs text-slate-500">{u.last_login_at ? formatDateTime(u.last_login_at, lang) : t("users.never")}</Td>
                  <Td>
                    {manage && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(u)} aria-label={t("common.edit")} />
                        {u.id !== me?.id && <Button size="sm" variant="ghost" icon={u.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />} onClick={() => toggle(u)}>{u.is_active ? t("users.deactivate") : t("users.activate")}</Button>}
                        {u.id !== me?.id && <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(u)} aria-label={t("common.delete")} />}
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={page} pageSize={15} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
      {edit && <UserForm user={edit === "new" ? null : edit} roles={roles.data ?? []} onClose={() => setEdit(null)} onSaved={reload} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger confirmLabel={t("common.yesDelete")} title={`${t("common.delete")} – ${del?.full_name ?? ""}`} text={t("users.deleteText")} />
    </>
  );
}

function UserForm({ user, roles, onClose, onSaved }: { user: User | null; roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({
    full_name: user?.full_name ?? "", email: user?.email ?? "", phone: user?.phone ?? "", password: "",
    role_id: user?.role.id ?? roles.find((r) => r.code === "manager")?.id ?? "", client_id: user?.client_id ?? "",
    language: user?.language ?? "fr", is_active: user?.is_active ?? true,
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const role = roles.find((r) => r.id === f.role_id);
  useEffect(() => {
    if (role?.is_client_role && !clients.length) api<Page<Client>>("/clients", { query: { page_size: 200 } }).then((p) => setClients(p.items)).catch(() => {});
  }, [role?.is_client_role]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...f, phone: f.phone || null, client_id: role?.is_client_role ? f.client_id || null : null };
      if (user && !f.password) delete body.password;
      await api(user ? `/users/${user.id}` : "/users", { method: user ? "PATCH" : "POST", body });
      toast.success(user ? t("users.updated") : t("users.created"));
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Modal open onClose={onClose} title={user ? t("users.edit") : t("users.new")} footer={<>
      <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
      <Button type="submit" form="user-form" loading={saving}>{t("common.save")}</Button>
    </>}>
      <form id="user-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("users.fullName")} required className="sm:col-span-2"><Input value={f.full_name} onChange={set("full_name")} required minLength={2} /></Field>
        <Field label={t("common.email")} required><Input type="email" dir="ltr" value={f.email} onChange={set("email")} required /></Field>
        <Field label={t("common.phone")}><Input dir="ltr" value={f.phone} onChange={set("phone")} /></Field>
        <Field label={t("users.password")} required={!user} hint={user ? t("users.passwordEditHint") : t("auth.passwordHint")}>
          <Input type="password" autoComplete="new-password" value={f.password} onChange={set("password")} required={!user} minLength={8} />
        </Field>
        <Field label={t("users.preferredLanguage")}>
          <Select value={f.language} onChange={set("language")}><option value="fr">Français</option><option value="ar">العربية</option></Select>
        </Field>
        <Field label={t("users.role")} required>
          <Select value={f.role_id} onChange={set("role_id")}>{roles.map((r) => <option key={r.id} value={r.id}>{lang === "ar" ? r.name_ar : r.name_fr}</option>)}</Select>
        </Field>
        {role?.is_client_role && (
          <Field label={t("users.linkedClient")} required>
            <Select value={f.client_id} onChange={set("client_id")} required>
              <option value="">{t("quotes.selectClient")}</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="sm:col-span-2"><Checkbox label={t("users.active")} checked={f.is_active} onChange={(b) => setF((x) => ({ ...x, is_active: b }))} /></div>
      </form>
    </Modal>
  );
}
