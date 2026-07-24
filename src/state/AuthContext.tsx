import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Store } from "@tauri-apps/plugin-store";
import {
  AuthApiError,
  fetchMe,
  login as apiLogin,
  signup as apiSignup,
  type AccountUser,
} from "@/services/account/authClient";
import { isDesktopApp } from "@/utils/platform";

const STORE_PATH = "auth-store.json";

/**
 * - "guest": plain browser build — accounts aren't used here at all (the
 *   website is intro/download only), so there's nothing to gate.
 * - "checking": desktop app, still validating a stored session.
 * - "needsLogin": desktop app, no valid session — show `LoginPage`.
 * - "authed": desktop app, logged in.
 */
type AuthStatus = "guest" | "checking" | "needsLogin" | "authed";

interface AuthContextValue {
  status: AuthStatus;
  user: AccountUser | null;
  token: string | null;
  error: string | null;
  isSubmitting: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let storePromise: Promise<Store> | null = null;
function getAuthStore(): Promise<Store> {
  if (!storePromise) storePromise = Store.load(STORE_PATH);
  return storePromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const desktop = isDesktopApp();
  const [status, setStatus] = useState<AuthStatus>(desktop ? "checking" : "guest");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;

    (async () => {
      try {
        const store = await getAuthStore();
        const storedToken = await store.get<string>("token");
        const storedEmail = await store.get<string>("email");
        if (!storedToken) {
          if (!cancelled) setStatus("needsLogin");
          return;
        }
        try {
          const me = await fetchMe(storedToken);
          if (cancelled) return;
          setToken(storedToken);
          setUser(me);
          setStatus("authed");
        } catch (err) {
          if (cancelled) return;
          if (err instanceof AuthApiError && err.isNetworkError && storedEmail) {
            // Offline (e.g. a LAN-only network with no internet) — trust
            // the cached session instead of forcing a re-login just
            // because the account server is unreachable. Streaming itself
            // only needs the LAN, not the internet.
            setToken(storedToken);
            setUser({ id: "", email: storedEmail });
            setStatus("authed");
          } else {
            await store.delete("token");
            await store.delete("email");
            await store.save();
            setStatus("needsLogin");
          }
        }
      } catch {
        if (!cancelled) setStatus("needsLogin");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [desktop]);

  const persistSession = useCallback(async (result: { token: string; user: AccountUser }) => {
    const store = await getAuthStore();
    await store.set("token", result.token);
    await store.set("email", result.user.email);
    await store.save();
    setToken(result.token);
    setUser(result.user);
    setStatus("authed");
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const result = await apiLogin(email, password);
        await persistSession(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [persistSession]
  );

  const signup = useCallback(
    async (email: string, password: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const result = await apiSignup(email, password);
        await persistSession(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [persistSession]
  );

  const logout = useCallback(async () => {
    const store = await getAuthStore();
    await store.delete("token");
    await store.delete("email");
    await store.save();
    setToken(null);
    setUser(null);
    setStatus("needsLogin");
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, token, error, isSubmitting, login, signup, logout, clearError }),
    [status, user, token, error, isSubmitting, login, signup, logout, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
