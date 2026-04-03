import { FormEvent, useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import {
  apiCreateUser,
  apiDeleteUser,
  apiListUsers,
  apiPermissionsSchema,
  apiUpdateUser,
  type PermissionsMap,
  type PermissionModule,
  type PermissionsSchema,
  type UserListItem,
  type UserRole,
} from "./api";
import { useAuth } from "./AuthContext";
import { cn } from "./lib/cn";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Table, TBody, Td, Th, THead, Tr } from "./ui/Table";

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  GERENTE: "Gerente",
  VENDEDOR: "Vendedor",
  ESTOQUE: "Estoque",
  COZINHA: "Cozinha",
  CONFERENTE: "Conferente",
};

const MODULE_LABELS: Record<PermissionModule, string> = {
  VENDAS: "Vendas",
  ESTOQUE: "Estoque",
  FINANCEIRO: "Financeiro",
  COZINHA: "Cozinha",
  CLIENTES: "Clientes",
};

const ACTION_LABELS: Record<string, string> = {
  abrir: "Abrir caixa / operar",
  fechar: "Fechar caixa",
  desconto: "Desconto",
  entrada: "Entrada de mercadoria",
  saida: "Saída",
  ajuste: "Ajuste",
  relatorios: "Ver relatórios",
  ver: "Ver pedidos / listar",
  atualizar: "Atualizar pedidos",
  cadastrar: "Cadastrar",
  editar: "Editar",
};

const ROLE_BADGE: Record<UserRole, string> = {
  ADMIN: "border-amber-500/30 bg-amber-500/15 text-amber-100",
  GERENTE: "border-violet-500/30 bg-violet-500/15 text-violet-200",
  VENDEDOR: "border-sky-500/30 bg-sky-500/15 text-sky-200",
  ESTOQUE: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200",
  COZINHA: "border-orange-500/30 bg-orange-500/15 text-orange-200",
  CONFERENTE: "border-zinc-500/30 bg-zinc-500/15 text-zinc-300",
};

type ModalMode = "create" | "edit" | null;

function cloneMap(m: PermissionsMap): PermissionsMap {
  return {
    VENDAS: [...(m.VENDAS ?? [])],
    ESTOQUE: [...(m.ESTOQUE ?? [])],
    FINANCEIRO: [...(m.FINANCEIRO ?? [])],
    COZINHA: [...(m.COZINHA ?? [])],
    CLIENTES: [...(m.CLIENTES ?? [])],
  };
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        ROLE_BADGE[role],
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export function UsersScreen() {
  const { state, refreshUser } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;

  const [schema, setSchema] = useState<PermissionsSchema | null>(null);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formLogin, setFormLogin] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("VENDEDOR");
  const [formPerms, setFormPerms] = useState<PermissionsMap | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoadError(null);
    try {
      const [s, list] = await Promise.all([apiPermissionsSchema(token), apiListUsers(token)]);
      setSchema(s);
      setUsers(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Erro ao carregar usuários");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    if (!schema) {
      return;
    }
    setModal("create");
    setEditing(null);
    setFormName("");
    setFormLogin("");
    setFormPassword("");
    setFormRole("VENDEDOR");
    setFormPerms(cloneMap(schema.defaultsByRole.VENDEDOR));
    setFormError(null);
  }

  function openEdit(u: UserListItem) {
    if (!schema) {
      return;
    }
    setModal("edit");
    setEditing(u);
    setFormName(u.name);
    setFormLogin(u.login);
    setFormPassword("");
    setFormRole(u.role);
    setFormPerms(cloneMap(u.permissions));
    setFormError(null);
  }

  function closeModal() {
    setModal(null);
    setEditing(null);
    setFormError(null);
  }

  function onRoleChange(role: UserRole) {
    setFormRole(role);
    if (schema) {
      setFormPerms(cloneMap(schema.defaultsByRole[role]));
    }
  }

  function toggleAction(mod: PermissionModule, action: string) {
    setFormPerms((prev) => {
      if (!prev) {
        return prev;
      }
      const next = cloneMap(prev);
      const set = new Set(next[mod]);
      if (set.has(action)) {
        set.delete(action);
      } else {
        set.add(action);
      }
      next[mod] = Array.from(set);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !formPerms) {
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      if (modal === "create") {
        await apiCreateUser(token, {
          name: formName.trim(),
          login: formLogin.trim().toLowerCase(),
          password: formPassword,
          role: formRole,
          permissions: formPerms,
        });
      } else if (modal === "edit" && editing) {
        const body: Parameters<typeof apiUpdateUser>[2] = {
          name: formName.trim(),
          login: formLogin.trim().toLowerCase(),
          role: formRole,
          permissions: formPerms,
        };
        if (formPassword.length > 0) {
          body.password = formPassword;
        }
        await apiUpdateUser(token, editing.id, body);
        if (state.status === "authenticated" && editing.id === state.user.id) {
          await refreshUser();
        }
      }
      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(u: UserListItem) {
    if (!token) {
      return;
    }
    if (!window.confirm(`Excluir o usuário "${u.name}"?`)) {
      return;
    }
    setBusy(true);
    try {
      await apiDeleteUser(token, u.id);
      await load();
      if (u.id === (state.status === "authenticated" ? state.user.id : "")) {
        return;
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return null;
  }

  return (
    <div className="relative min-h-full px-4 pb-28 pt-2 sm:px-6">
      <div className="mb-4 flex items-center justify-end">
        <Button type="button" className="hidden sm:inline-flex" onClick={openCreate} disabled={!schema || busy}>
          Novo usuário
        </Button>
      </div>

      {loadError ? <p className="mb-4 text-sm text-red-400">{loadError}</p> : null}

      <Table>
        <THead>
          <tr>
            <Th>Nome</Th>
            <Th>Login</Th>
            <Th>Papel</Th>
            <Th className="text-right">Ações</Th>
          </tr>
        </THead>
        <TBody>
          {users.map((u) => (
            <Tr key={u.id}>
              <Td className="max-w-[200px] truncate font-medium text-zinc-200">{u.name}</Td>
              <Td className="font-mono text-xs text-zinc-400">{u.login}</Td>
              <Td>
                <RoleBadge role={u.role} />
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="text-xs font-medium text-amber-400/90 hover:text-amber-300"
                    onClick={() => openEdit(u)}
                    disabled={busy}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-red-400/90 hover:text-red-300"
                    onClick={() => void onDelete(u)}
                    disabled={busy}
                  >
                    Excluir
                  </button>
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <button
        type="button"
        onClick={openCreate}
        disabled={!schema || busy}
        title="Novo usuário"
        className="fixed bottom-8 right-8 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-amber-600 text-zinc-950 shadow-lg shadow-amber-950/40 ring-1 ring-amber-400/40 transition hover:brightness-105 disabled:opacity-40 sm:hidden"
      >
        <UserPlus className="h-6 w-6" strokeWidth={2} />
      </button>

      {modal && formPerms && schema ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="my-8 w-full max-w-lg rounded-xl border border-white/[0.1] bg-[#1e1e1e]/95 p-6 shadow-2xl backdrop-blur-xl"
            role="dialog"
            aria-modal
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-zinc-100">
              {modal === "create" ? "Novo usuário" : "Editar usuário"}
            </h2>
            <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => void onSubmit(e)}>
              <Input label="Nome" value={formName} onChange={(e) => setFormName(e.target.value)} required disabled={busy} />
              <Input
                label="Login"
                value={formLogin}
                onChange={(e) => setFormLogin(e.target.value)}
                required
                disabled={busy}
                autoComplete="off"
              />
              <Input
                type="password"
                label={modal === "create" ? "Senha" : "Nova senha (deixe em branco para manter)"}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                required={modal === "create"}
                disabled={busy}
                autoComplete="new-password"
              />
              <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500">
                Papel
                <select
                  className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-zinc-100"
                  value={formRole}
                  onChange={(e) => onRoleChange(e.target.value as UserRole)}
                  disabled={busy}
                >
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="mt-2 border-t border-white/[0.08] pt-4">
                <legend className="text-sm font-semibold text-zinc-300">Permissões por módulo</legend>
                <div className="mt-3 max-h-[40vh] space-y-4 overflow-y-auto pr-1">
                  {schema.modules.map((mod) => (
                    <div key={mod}>
                      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{MODULE_LABELS[mod]}</h4>
                      <div className="flex flex-col gap-2">
                        {schema.actions[mod].map((action) => (
                          <label key={action} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
                            <input
                              type="checkbox"
                              className="rounded border-white/20 bg-zinc-900 text-amber-600"
                              checked={formPerms[mod].includes(action)}
                              onChange={() => toggleAction(mod, action)}
                              disabled={busy}
                            />
                            {ACTION_LABELS[action] ?? action}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              {formError ? <p className="text-sm text-red-400">{formError}</p> : null}

              <div className="flex justify-end gap-2 border-t border-white/[0.08] pt-4">
                <Button type="button" variant="outline" onClick={closeModal} disabled={busy}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
