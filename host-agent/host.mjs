/**
 * AlaveX Host Agent
 *
 * A small, local Windows service that discovers installed Steam games and
 * lets a AlaveX client pair using a one-time PIN. It deliberately starts
 * on 127.0.0.1; pass --lan only when a trusted local network client needs
 * to reach it. Streaming is intentionally not implemented here yet: it
 * needs a separate authenticated WebRTC media/input pipeline.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { hostname, platform, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const dataDirectory = join(here, "data");
const statePath = join(dataDirectory, "host-state.json");
const port = Number.parseInt(process.env.LUMALINK_HOST_PORT ?? "47989", 10);
const lanMode = process.argv.includes("--lan");
const listenAddress = lanMode ? "0.0.0.0" : "127.0.0.1";
const allowedOrigins = (process.env.LUMALINK_ALLOWED_ORIGIN ?? "https://shy-sun-bc8f.gruemingu.workers.dev")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @typedef {{ id: string, name: string, tokenHash: string, pairedAt: string }} PairedClient */
/** @typedef {{ hostId: string, hostName: string, pairedClients: PairedClient[] }} HostState */

/** @type {HostState} */
const hostState = loadHostState();
const pairingSessions = new Map();

function loadHostState() {
  mkdirSync(dataDirectory, { recursive: true });
  if (existsSync(statePath)) {
    try {
      return JSON.parse(readFileSync(statePath, "utf8"));
    } catch {
      console.warn("Existing host state could not be read. Creating a fresh local state file.");
    }
  }

  const state = {
    hostId: randomUUID(),
    hostName: hostname(),
    pairedClients: [],
  };
  saveHostState(state);
  return state;
}

function saveHostState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function createPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function json(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function error(response, statusCode, message) {
  json(response, statusCode, { error: message });
}

function corsHeaders(request) {
  const requestOrigin = request.headers.origin;
  if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) return {};
  return {
    "Access-Control-Allow-Origin": requestOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function getAuthenticatedClient(request) {
  const authorization = request.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return null;
  const tokenHash = hashToken(match[1]);
  return hostState.pairedClients.find((client) => client.tokenHash === tokenHash) ?? null;
}

function steamAppsDirectories() {
  const candidates = new Set();
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const programFiles = process.env.ProgramFiles;
  const localAppData = process.env.LOCALAPPDATA;

  for (const base of [programFilesX86, programFiles, localAppData]) {
    if (base) candidates.add(join(base, "Steam", "steamapps"));
  }

  for (const steamApps of [...candidates]) {
    const libraryFile = join(steamApps, "libraryfolders.vdf");
    if (!existsSync(libraryFile)) continue;
    const contents = readFileSync(libraryFile, "utf8");
    for (const match of contents.matchAll(/"path"\s+"([^"]+)"/g)) {
      candidates.add(join(match[1].replace(/\\\\/g, "\\"), "steamapps"));
    }
  }

  return [...candidates].filter((candidate) => existsSync(candidate));
}

function vdfValue(contents, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`"${escaped}"\\s+"([^"]*)"`).exec(contents)?.[1] ?? null;
}

function scanSteamGames() {
  const games = [];
  for (const steamApps of steamAppsDirectories()) {
    for (const fileName of readdirSync(steamApps)) {
      if (!/^appmanifest_\d+\.acf$/i.test(fileName)) continue;
      try {
        const manifest = readFileSync(join(steamApps, fileName), "utf8");
        const appId = vdfValue(manifest, "appid");
        const title = vdfValue(manifest, "name");
        const installDir = vdfValue(manifest, "installdir");
        const stateFlags = Number(vdfValue(manifest, "StateFlags") ?? "0");
        if (!appId || !title || !installDir || (stateFlags & 4) === 0) continue;
        games.push({
          id: `steam-${appId}`,
          appId,
          title,
          source: "steam",
          installDirectory: join(steamApps, "common", installDir),
          launchUri: `steam://run/${appId}`,
        });
      } catch {
        // A damaged manifest should not prevent the rest of the library loading.
      }
    }
  }
  return games.sort((a, b) => a.title.localeCompare(b.title));
}

async function launchSteamGame(game) {
  if (platform() !== "win32") {
    throw new Error("Launching games is currently available only on Windows hosts.");
  }
  await execFileAsync("cmd.exe", ["/c", "start", "", game.launchUri]);
}

function hostSummary() {
  return {
    id: hostState.hostId,
    name: hostState.hostName,
    platform: platform(),
    memoryGb: Math.round(totalmem() / 1024 ** 3),
    pairedClients: hostState.pairedClients.map(({ id, name, pairedAt }) => ({ id, name, pairedAt })),
  };
}

const server = createServer(async (request, response) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const method = request.method ?? "GET";

  try {
    if (method === "GET" && url.pathname === "/v1/health") {
      json(response, 200, {
        status: "ready",
        name: hostState.hostName,
        hostVersion: "0.1.0",
        listenAddress,
        port,
        discoveredGames: scanSteamGames().length,
      }, headers);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/pairing/start") {
      const body = await readBody(request);
      const clientName = typeof body.clientName === "string" ? body.clientName.slice(0, 64) : "AlaveX client";
      const session = {
        id: randomUUID(),
        pin: createPin(),
        clientName,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
      pairingSessions.set(session.id, session);
      console.log(`\nPairing code for ${clientName}: ${session.pin} (expires in 5 minutes)`);
      json(response, 201, {
        sessionId: session.id,
        expiresAt: new Date(session.expiresAt).toISOString(),
        message: "Read the six-digit code in the AlaveX Host terminal.",
      }, headers);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/pairing/confirm") {
      const body = await readBody(request);
      const session = typeof body.sessionId === "string" ? pairingSessions.get(body.sessionId) : null;
      if (!session || session.expiresAt < Date.now()) {
        if (session) pairingSessions.delete(session.id);
        error(response, 410, "This pairing request expired. Start a new one.");
        return;
      }
      if (String(body.pin ?? "") !== session.pin) {
        error(response, 401, "The pairing code is incorrect.");
        return;
      }

      const token = randomBytes(32).toString("base64url");
      const client = {
        id: randomUUID(),
        name: session.clientName,
        tokenHash: hashToken(token),
        pairedAt: new Date().toISOString(),
      };
      hostState.pairedClients = [...hostState.pairedClients, client];
      saveHostState(hostState);
      pairingSessions.delete(session.id);
      json(response, 201, {
        client: { id: client.id, name: client.name, pairedAt: client.pairedAt },
        token,
        host: hostSummary(),
      }, headers);
      return;
    }

    const client = getAuthenticatedClient(request);
    if (!client) {
      error(response, 401, "Pair this client with the host before using this endpoint.");
      return;
    }

    if (method === "GET" && url.pathname === "/v1/host") {
      json(response, 200, { host: hostSummary(), client: { id: client.id, name: client.name } }, headers);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/games") {
      json(response, 200, { games: scanSteamGames() }, headers);
      return;
    }

    const launchMatch = /^\/v1\/games\/(steam-\d+)\/launch$/.exec(url.pathname);
    if (method === "POST" && launchMatch) {
      const game = scanSteamGames().find((candidate) => candidate.id === launchMatch[1]);
      if (!game) {
        error(response, 404, "The requested installed Steam game was not found.");
        return;
      }
      await launchSteamGame(game);
      json(response, 202, { message: `${game.title} is launching on ${hostState.hostName}.` }, headers);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/stream/session") {
      error(response, 501, "The secure WebRTC streaming module is not installed yet.");
      return;
    }

    error(response, 404, "Endpoint not found.");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Host agent failed to process the request.";
    console.error(message);
    error(response, 400, message);
  }
});

server.listen(port, listenAddress, () => {
  console.log("\nAlaveX Host is running.");
  console.log(`Local address: http://${listenAddress}:${port}`);
  console.log(`Allowed web origin: ${allowedOrigins.join(", ")}`);
  console.log(lanMode ? "LAN mode is ON. Only use it on a trusted private network." : "Local-only mode is ON.");
  console.log("Press Ctrl+C to stop.\n");
});
