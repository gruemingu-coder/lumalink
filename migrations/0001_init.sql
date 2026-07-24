-- LumaLink account + cloud device sync schema.
-- Apply with:
--   npx wrangler d1 execute lumalink --local --file=./migrations/0001_init.sql   (local dev)
--   npx wrangler d1 execute lumalink --remote --file=./migrations/0001_init.sql  (production)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per host PC registered to an account. `id` is a UUID generated
-- once by the LumaLink Host App and persisted locally (not the DB rowid),
-- so re-registering (heartbeat) is a plain upsert keyed by that id.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mac_address TEXT,
  last_ip TEXT,
  signal_port INTEGER NOT NULL DEFAULT 58712,
  pairing_pin TEXT,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
