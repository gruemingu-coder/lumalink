# LumaLink Host Agent

This small Windows program is the first real part of LumaLink. It finds games
installed by Steam, pairs one LumaLink client with a six-digit code, and allows
that paired client to request a Steam launch. It does **not** yet capture the
screen or send keyboard/mouse input. Those need the separate WebRTC streaming
module that will be added next.

## Start it

From the main `MLZ` folder, run:

```powershell
npm.cmd run host
```

The host starts in safe local-only mode at `http://127.0.0.1:47989`.

## Let another device reach the host

Only on a trusted home network, run:

```powershell
npm.cmd run host -- --lan
```

This listens on the PC's local network address. Do not port-forward this
service to the public internet.

Your deployed LumaLink website is HTTPS, so a browser cannot connect directly
to a plain `http://` host service from another device. For remote use, create a
secure HTTPS tunnel or deploy the WebRTC signalling service first. A temporary
Cloudflare Tunnel for local testing can be started with:

```powershell
cloudflared tunnel --url http://localhost:47989
```

Set the resulting HTTPS address in the client once the host-connection screen
is added. Keep the pairing token private; it lets a client read the game list
and request launches.

## Pairing API flow

1. The client sends `POST /v1/pairing/start` with `{ "clientName": "My phone" }`.
2. This terminal displays a six-digit code valid for five minutes.
3. The client sends `POST /v1/pairing/confirm` with `sessionId` and the code.
4. The response contains a one-time pairing token. Future requests use
   `Authorization: Bearer <token>`.

The agent stores only a hash of each pairing token in
`host-agent/data/host-state.json`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/health` | Host status and discovered-game count |
| POST | `/v1/pairing/start` | Display a one-time pairing PIN in the host terminal |
| POST | `/v1/pairing/confirm` | Finish pairing and receive an access token |
| GET | `/v1/host` | Read paired host information |
| GET | `/v1/games` | Read installed Steam games |
| POST | `/v1/games/:id/launch` | Ask the paired host to launch a scanned Steam game |

