import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { LoginScreen } from "./LoginScreen";

/** Gates `children` behind a valid saved session (see `AuthContext`). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-950">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (status === "needsLogin") {
    return <LoginScreen />;
  }

  return <>{children}</>;
}
