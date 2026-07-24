/**
 * Client for the LumaLink accounts + cloud device sync API (see
 * `worker/index.ts`). Both desktop apps (this streaming client and the
 * separate LumaLink Host app) call the same deployed Worker directly over
 * HTTPS — there's no browser-side account UI, since the public website is
 * intro/download only.
 *
 * NOTE: `host-app/src/authClient.ts` is a hand-synced copy of this file
 * (the host app is a separate Vite project and can't import across
 * directories) — mirror any changes made here over there too, the same way
 * `signalingProtocol.ts` is kept in sync between the two apps.
 */

// Replace with your own deployed Worker's origin if you use a custom
// domain instead of the default *.workers.dev URL.
const API_BASE_URL = "https://lumalink.gruemingu.workers.dev/api";

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
  /** UUID generated once by the Host App and persisted locally. */
  id: string;
  name: string;
  macAddress?: string | null;
  lastIp?: string | null;
  signalPort?: number;
  pairingPin?: string | null;
}

export interface CloudDevice {
  id: string;
  name: string;
  macAddress: string | null;
  lastIp: string | null;
  signalPort: number;
  pairingPin: string | null;
  lastSeenAt: string;
}

/** Called by the Host App on startup and periodically (heartbeat). */
export function registerDevice(token: string, payload: CloudDevicePayload): Promise<void> {
  return request<void>("/devices", { method: "POST", token, body: JSON.stringify(payload) });
}

/** Called by the Streaming client to list every host registered to this account. */
export async function listDevices(token: string): Promise<CloudDevice[]> {
  const data = await request<{ devices: CloudDevice[] }>("/devices", { method: "GET", token });
  return data.devices;
}

export function unlinkDevice(token: string, id: string): Promise<void> {
  return request<void>(`/devices/${encodeURIComponent(id)}`, { method: "DELETE", token });
}
