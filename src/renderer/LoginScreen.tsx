import { FormEvent, useState } from "react";
import { apiLogin } from "./api";
import { useAuth } from "./AuthContext";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

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
    <div className="flex min-h-screen items-center justify-center bg-[#121212] bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(201,162,39,0.12),transparent)] p-6 font-sans">
      <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#1e1e1e]/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Gato Negro</h1>
          <p className="mt-1 text-sm text-zinc-500">PDV — Entre com seu usuário</p>
        </div>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Input
            label="Login"
            type="text"
            name="login"
            autoComplete="username"
            value={userLogin}
            onChange={(e) => setUserLogin(e.target.value)}
            disabled={submitting}
          />
          <Input
            label="Senha"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button type="submit" className="mt-1 w-full" disabled={submitting}>
            {submitting ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
