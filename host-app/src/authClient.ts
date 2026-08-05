/**
 * Client for the AlaveX accounts + cloud device sync API (see
 * `worker/index.ts` at the repo root). This is a hand-synced copy of
 * `src/services/account/authClient.ts` — the host app is a separate Vite
 * project and can't import across directories, so mirror any changes made
 * to that file here too, the same way `signalingProtocol.ts` is kept in
 * sync between the two apps.
 */

// Origin of the deployed Pages project (see `functions/api/[[route]].ts`
// + `wrangler.toml`). If you name the Pages project something other
// than "alavex", or attach a custom domain, update this — and the
// identical constant in `src/services/account/authClient.ts`.
const API_BASE_URL = "https://alavex.pages.dev/api";

export interface AccountUser {
  id: string;
  email: string;
}

export class AuthApiError extends Error {
  /** True when the request never reached the server (offline/DNS/etc.),
   * as opposed to the server responding with an auth/validation error. */
  isNetworkError: boolean;

  constructor(message: string, isNetworkError = false) {
    super(message);
    this.isNetworkError = isNetworkError;
  }
}

async function request<T>(
  path: string,
  options: (RequestInit & { token?: string }) | undefined = undefined
): Promise<T> {
  const { token, headers, ...rest } = options ?? {};
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new AuthApiError("서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.", true);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : `요청에 실패했습니다 (${response.status}).`;
    throw new AuthApiError(message);
  }
  return data as T;
}

export interface AuthResult {
  token: string;
  user: AccountUser;
}

export function signup(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchMe(token: string): Promise<AccountUser> {
  const data = await request<{ user: AccountUser }>("/auth/me", { method: "GET", token });
  return data.user;
}

export interface CloudDevicePayload {
  /** UUID generated once by this Host App install and persisted locally. */
  id: string;
  name: string;
  macAddress?: string | null;
  lastIp?: string | null;
  signalPort?: number;
  pairingPin?: string | null;
}

/** Sent on startup and periodically (heartbeat) so streaming clients logged
 * into the same account can find this PC without re-entering its IP/PIN. */
export function registerDevice(token: string, payload: CloudDevicePayload): Promise<void> {
  return request<void>("/devices", { method: "POST", token, body: JSON.stringify(payload) });
}
