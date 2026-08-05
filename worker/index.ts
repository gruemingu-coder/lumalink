/**
 * AlaveX accounts + cloud device sync API.
 *
 * This is a plain Hono app with no Cloudflare-specific glue, so it can
 * be reasoned about (and unit tested) independently of how it's hosted.
 * It's wired up to actually run as a Cloudflare Pages Function in
 * `functions/api/[[route]].ts`, which handles every request under
 * `/api/*` — every other route is served directly from `dist/` as a
 * static asset without invoking this script at all.
 *
 * Both desktop apps (the AlaveX Streaming client and the AlaveX Host
 * app) call this API directly over HTTPS; there is no browser-side account
 * UI, since the public website is intro/download only. (AlaveX)
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  hashPassword,
  isValidEmail,
  randomHex,
  signToken,
  timingSafeEqual,
  verifyToken,
  TOKEN_TTL_MS,
} from "./auth";

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

interface Variables {
  userId: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
}

interface DeviceRow {
  id: string;
  name: string;
  macAddress: string | null;
  lastIp: string | null;
  signalPort: number;
  pairingPin: string | null;
  lastSeenAt: string;
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/auth/signup", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!isValidEmail(email)) {
    return c.json({ error: "올바른 이메일 주소를 입력해주세요." }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "비밀번호는 8자 이상이어야 합니다." }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) {
    return c.json({ error: "이미 가입된 이메일입니다." }, 409);
  }

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, email, passwordHash, salt, now)
    .run();

  const token = await signToken({ sub: id, exp: Date.now() + TOKEN_TTL_MS }, c.env.JWT_SECRET);
  return c.json({ token, user: { id, email } }, 201);
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return c.json({ error: "이메일과 비밀번호를 입력해주세요." }, 400);
  }

  // Uniform failure path + tiny artificial delay to slow credential stuffing.
  const fail = async () => {
    await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 200)));
    return c.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, 401);
  };

  const user = await c.env.DB.prepare(
    "SELECT id, email, password_hash, salt FROM users WHERE email = ?"
  )
    .bind(email)
    .first<UserRow>();

  if (!user) {
    return fail();
  }

  const computedHash = await hashPassword(password, user.salt);
  if (!timingSafeEqual(computedHash, user.password_hash)) {
    return fail();
  }

  const token = await signToken({ sub: user.id, exp: Date.now() + TOKEN_TTL_MS }, c.env.JWT_SECRET);
  return c.json({ token, user: { id: user.id, email: user.email } });
});

async function requireAuth(
  c: import("hono").Context<{ Bindings: Env; Variables: Variables }>,
  next: () => Promise<void>
) {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return c.json({ error: "인증이 필요합니다." }, 401);
  }
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: "세션이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요." }, 401);
  }
  c.set("userId", payload.sub);
  await next();
}

app.get("/api/auth/me", requireAuth, async (c) => {
  const user = await c.env.DB.prepare("SELECT id, email FROM users WHERE id = ?")
    .bind(c.get("userId"))
    .first<{ id: string; email: string }>();
  if (!user) {
    return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);
  }
  return c.json({ user });
});

app.post("/api/devices", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const name = typeof body?.name === "string" ? body.name : "";
  if (!id || !name) {
    return c.json({ error: "id와 name은 필수입니다." }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT user_id FROM devices WHERE id = ?")
    .bind(id)
    .first<{ user_id: string }>();
  if (existing && existing.user_id !== userId) {
    return c.json({ error: "이 기기 ID는 다른 계정에 등록되어 있습니다." }, 409);
  }

  const now = new Date().toISOString();
  const macAddress = typeof body?.macAddress === "string" ? body.macAddress : null;
  const lastIp = typeof body?.lastIp === "string" ? body.lastIp : null;
  const signalPort = typeof body?.signalPort === "number" ? body.signalPort : 58712;
  const pairingPin = typeof body?.pairingPin === "string" ? body.pairingPin : null;

  await c.env.DB.prepare(
    `INSERT INTO devices (id, user_id, name, mac_address, last_ip, signal_port, pairing_pin, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       mac_address = excluded.mac_address,
       last_ip = excluded.last_ip,
       signal_port = excluded.signal_port,
       pairing_pin = excluded.pairing_pin,
       last_seen_at = excluded.last_seen_at`
  )
    .bind(id, userId, name, macAddress, lastIp, signalPort, pairingPin, now, now)
    .run();

  return c.json({ ok: true });
});

app.get("/api/devices", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, mac_address as macAddress, last_ip as lastIp, signal_port as signalPort,
            pairing_pin as pairingPin, last_seen_at as lastSeenAt
     FROM devices WHERE user_id = ? ORDER BY last_seen_at DESC`
  )
    .bind(userId)
    .all<DeviceRow>();
  return c.json({ devices: results ?? [] });
});

app.delete("/api/devices/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM devices WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
