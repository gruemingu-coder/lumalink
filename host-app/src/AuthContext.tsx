import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AuthApiError,
  fetchMe,
  login as apiLogin,
  signup as apiSignup,
  type AccountUser,
} from "./authClient";
import { getLocalStore } from "./localStore";

type AuthStatus = "checking" | "needsLogin" | "authed";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const store = await getLocalStore();
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
            // Offline — trust the cached session rather than forcing a
            // re-login. Sharing your screen over the LAN doesn't need
            // internet, only account validation does.
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
  }, []);

  const persistSession = useCallback(async (result: { token: string; user: AccountUser }) => {
    const store = await getLocalStore();
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
    const store = await getLocalStore();
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
