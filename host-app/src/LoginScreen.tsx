import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";

/** Shown whenever the LumaLink Host app launches without a valid saved session. */
export function LoginScreen() {
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
      // Surfaced via `error` below.
    }
  };

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    clearError();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base-950 px-6 py-10">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          L
        </div>
        <span className="text-lg font-semibold text-white">
          Luma<span className="text-brand-400">Link</span> Host
        </span>
      </div>

      <div className="w-full max-w-xs rounded-2xl border border-base-700 bg-base-800 p-5">
        <div className="mb-4 inline-flex w-full rounded-xl border border-base-700 bg-base-900 p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => switchMode("login")}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
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
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "signup" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            회원가입
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          로그인하면 이 PC가 계정에 등록되어, 같은 계정으로 로그인한 LumaLink Streaming 앱에서
          자동으로 이 PC를 찾을 수 있어요.
        </p>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="host-login-email" className="mb-1 block text-xs text-slate-300">
              이메일
            </label>
            <input
              id="host-login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500"
            />
          </div>
          <div>
            <label htmlFor="host-login-password" className="mb-1 block text-xs text-slate-300">
              비밀번호
            </label>
            <input
              id="host-login-password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상"
              className="w-full rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-danger-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "처리 중..." : mode === "login" ? "로그인" : "가입하고 시작하기"}
          </button>
        </form>
      </div>

      <p className="mt-5 max-w-xs text-center text-[10px] leading-relaxed text-slate-600">
        LumaLink는 독립적인 프로젝트이며 특정 상용 소프트웨어와 무관합니다.
      </p>
    </div>
  );
}
