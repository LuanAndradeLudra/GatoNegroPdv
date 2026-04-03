import { useAuth } from "./AuthContext";

export function HubScreen() {
  const { state, logout } = useAuth();
  if (state.status !== "authenticated") {
    return null;
  }

  return (
    <div className="hub-layout">
      <header className="hub-header">
        <div>
          <h1 className="hub-title">Olá, {state.user.name}</h1>
          <p className="hub-meta">
            {state.user.login} · {state.user.role}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={logout}>
          Sair
        </button>
      </header>
      <main className="hub-main">
        <p className="hub-hint">Próximos passos (épicos seguintes)</p>
        <div className="hub-actions">
          <button type="button" className="hub-tile" disabled>
            Entrar no PDV
          </button>
          <button type="button" className="hub-tile" disabled>
            Entrar no ERP
          </button>
        </div>
      </main>
    </div>
  );
}
