import { useState, type FormEvent } from "react";
import { Logo } from "@/components/layout/Logo";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/state/AuthContext";

/**
 * Shown whenever the LumaLink Streaming desktop app launches without a
 * valid saved session. Not reachable in a plain browser — the public
 * website never mounts `AppLayout`/this page (see `src/App.tsx`).
 */
export function LoginPage() {
  const { login, signup, error, isSubmitting, clearError } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(email, password);
      }
    } catch {
      // Error is surfaced via `useAuth().error` below.
    }
  };

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    clearError();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>

        <Card className="p-6">
          <div className="mb-5 inline-flex w-full rounded-xl border border-base-700 bg-base-900 p-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => switchMode("login")}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                mode === "login" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              로그인
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              onClick={() => switchMode("signup")}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                mode === "signup" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              회원가입
            </button>
          </div>

          <h1 className="text-lg font-semibold text-slate-100">
            {mode === "login" ? "LumaLink 계정으로 로그인" : "LumaLink 계정 만들기"}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {mode === "login"
              ? "로그인하면 이 기기에 계정이 저장되어 다음부터는 자동으로 로그인됩니다."
              : "가입한 계정으로 호스트 PC와 스트리밍 앱을 연결하고, 페어링된 PC 목록을 다른 기기에서도 그대로 볼 수 있어요."}
          </p>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm text-slate-300">
                이메일
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-base-600 bg-base-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm text-slate-300">
                비밀번호
              </label>
              <input
                id="login-password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8자 이상"
                className="w-full rounded-xl border border-base-600 bg-base-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500"
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>

            {error && (
              <p id="login-error" role="alert" className="text-sm text-danger-400">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" isLoading={isSubmitting}>
              {mode === "login" ? "로그인" : "가입하고 시작하기"}
            </Button>
          </form>
        </Card>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-600">
          LumaLink는 독립적인 프로젝트이며 특정 상용 소프트웨어와 무관합니다. 계정은 호스트/스트리밍
          앱을 서로 연결하고 페어링된 PC 목록을 동기화하는 용도로만 사용됩니다.
        </p>
      </div>
    </div>
  );
}
