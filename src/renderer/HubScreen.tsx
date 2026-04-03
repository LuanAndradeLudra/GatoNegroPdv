import { useState } from "react";
import { CashRegisterScreen } from "./CashRegisterScreen";
import { useAuth } from "./AuthContext";
import { UsersScreen } from "./UsersScreen";

export function HubScreen() {
  const { state, logout } = useAuth();
  const [view, setView] = useState<"hub" | "users" | "caixa">("hub");

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state;
  const { access } = user;

  if (view === "users" && access.manageUsers) {
    return <UsersScreen onBack={() => setView("hub")} />;
  }

  if (view === "caixa" && access.pdv) {
    return <CashRegisterScreen onBack={() => setView("hub")} />;
  }

  return (
    <div className="hub-layout">
      <header className="hub-header">
        <div>
          <h1 className="hub-title">Olá, {user.name}</h1>
          <p className="hub-meta">
            {user.login} · {user.role}
          </p>
          <p className="hub-access-line">
            {access.pdv ? <span className="tag tag-on">PDV</span> : <span className="tag tag-off">PDV</span>}
            {access.erp ? <span className="tag tag-on">ERP</span> : <span className="tag tag-off">ERP</span>}
            {access.manageUsers ? (
              <span className="tag tag-on">Gestão de usuários</span>
            ) : (
              <span className="tag tag-off">Gestão de usuários</span>
            )}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={logout}>
          Sair
        </button>
      </header>
      <main className="hub-main">
        <p className="hub-hint">Escolha o módulo (conforme seu nível de acesso)</p>
        <div className="hub-actions">
          {access.pdv ? (
            <button type="button" className="hub-tile hub-tile-accent" onClick={() => setView("caixa")}>
              Caixa
            </button>
          ) : null}
          <button
            type="button"
            className="hub-tile"
            disabled={!access.pdv}
            title={!access.pdv ? "Sem permissão para o PDV" : undefined}
          >
            Entrar no PDV
          </button>
          <button
            type="button"
            className="hub-tile"
            disabled={!access.erp}
            title={!access.erp ? "Sem permissão para o ERP" : undefined}
          >
            Entrar no ERP
          </button>
          {access.manageUsers ? (
            <button type="button" className="hub-tile hub-tile-accent" onClick={() => setView("users")}>
              Usuários
            </button>
          ) : null}
        </div>
      </main>
    </div>
  );
}
