import { FormEvent, useCallback, useEffect, useState } from "react";
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
};

const ACTION_LABELS: Record<string, string> = {
  abrir: "Abrir caixa / operar",
  fechar: "Fechar caixa",
  desconto: "Desconto",
  entrada: "Entrada de mercadoria",
  saida: "Saída",
  ajuste: "Ajuste",
  relatorios: "Ver relatórios",
  ver: "Ver pedidos",
  atualizar: "Atualizar pedidos",
};

type ModalMode = "create" | "edit" | null;

function cloneMap(m: PermissionsMap): PermissionsMap {
  return {
    VENDAS: [...m.VENDAS],
    ESTOQUE: [...m.ESTOQUE],
    FINANCEIRO: [...m.FINANCEIRO],
    COZINHA: [...m.COZINHA],
  };
}

export function UsersScreen({ onBack }: { onBack: () => void }) {
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
    <div className="users-layout">
      <header className="users-toolbar">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Voltar
        </button>
        <h1 className="users-title">Usuários</h1>
        <button type="button" className="btn-primary btn-small" onClick={openCreate} disabled={!schema || busy}>
          Novo usuário
        </button>
      </header>

      {loadError ? <p className="users-error">{loadError}</p> : null}

      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Login</th>
              <th>Papel</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="mono">{u.login}</td>
                <td>{ROLE_LABELS[u.role]}</td>
                <td className="users-actions">
                  <button type="button" className="btn-link" onClick={() => openEdit(u)} disabled={busy}>
                    Editar
                  </button>
                  <button type="button" className="btn-link danger" onClick={() => void onDelete(u)} disabled={busy}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && formPerms && schema ? (
        <div className="modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="modal-title">{modal === "create" ? "Novo usuário" : "Editar usuário"}</h2>
            <form className="modal-form" onSubmit={(e) => void onSubmit(e)}>
              <label className="field">
                <span>Nome</span>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} required disabled={busy} />
              </label>
              <label className="field">
                <span>Login</span>
                <input
                  value={formLogin}
                  onChange={(e) => setFormLogin(e.target.value)}
                  required
                  disabled={busy}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>{modal === "create" ? "Senha" : "Nova senha (deixe em branco para manter)"}</span>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  required={modal === "create"}
                  disabled={busy}
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span>Papel</span>
                <select value={formRole} onChange={(e) => onRoleChange(e.target.value as UserRole)} disabled={busy}>
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="perm-fieldset">
                <legend>Permissões por módulo</legend>
                {schema.modules.map((mod) => (
                  <div key={mod} className="perm-module">
                    <h4>{MODULE_LABELS[mod]}</h4>
                    <div className="perm-actions">
                      {schema.actions[mod].map((action) => (
                        <label key={action} className="perm-check">
                          <input
                            type="checkbox"
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
              </fieldset>

              {formError ? <p className="login-error">{formError}</p> : null}

              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={closeModal} disabled={busy}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
