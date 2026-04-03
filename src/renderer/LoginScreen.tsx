import { FormEvent, useState } from "react";
import { apiLogin } from "./api";
import { useAuth } from "./AuthContext";

export function LoginScreen() {
  const { login } = useAuth();
  const [userLogin, setUserLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token } = await apiLogin(userLogin.trim(), password);
      await login(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-layout">
      <div className="login-card">
        <div className="login-brand">
          <h1>Gato Negro</h1>
          <p className="login-sub">PDV — Entre com seu usuário</p>
        </div>
        <form className="login-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Login</span>
            <input
              type="text"
              name="login"
              autoComplete="username"
              value={userLogin}
              onChange={(e) => setUserLogin(e.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
