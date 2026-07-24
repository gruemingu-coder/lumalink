# LumaLink Host App

Runs on the gaming PC you want to stream **from**. Built with
[Tauri](https://tauri.app) (Rust) + a small React/TypeScript UI.

## What it actually does

- Shows a 4-digit pairing PIN and this PC's role as a WebRTC signaling
  endpoint (`ws://<this-pc-ip>:58712/signal`).
- Scans the local Steam library (via the Windows registry +
  `libraryfolders.vdf` / `appmanifest_*.acf` parsing) and lists fully
  installed games. No mock data — if Steam isn't installed, the list is
  genuinely empty.
- When a LumaLink Streaming App client authenticates with the correct
  PIN and sends a WebRTC offer, this app calls the browser/webview's
  own `navigator.mediaDevices.getDisplayMedia()` to **really** capture
  the screen (and system audio, where supported) and streams it back
  over a real `RTCPeerConnection` — no mock renderer.
- Receives mouse/keyboard events from the client over an `RTCDataChannel`
  and injects them into the OS using the [`enigo`](https://docs.rs/enigo)
  crate, so the remote client can genuinely control this PC.
- Can launch a selected Steam game via `steam://run/<appid>`.

## Architecture

```
┌─────────────────────────────┐        LAN, ws://<host-ip>:58712/signal
│  LumaLink Host App (Tauri)  │◄───────────────────────────────────────┐
│                              │                                       │
│  Rust (src-tauri/):          │  role=host                            │
│   - signaling.rs: tiny WS    │◄──────────┐                           │
│     relay on :58712          │           │                           │
│   - steam.rs: Steam scan      │           │      role=client&pin=XXXX│
│   - input.rs: enigo injection │  Rust WS relay (pipes JSON frames)   │
│                              │           │                           │
│  Webview (this app's UI):    │           └───────────────────────────┤
│   - shows PIN + game list     │                                      │
│   - on "offer": getDisplayMedia() + RTCPeerConnection (real WebRTC)  │
└─────────────────────────────┘                                       │
                                                                        │
                                                     LumaLink Streaming App
                                                     (Tauri client, or a
                                                      browser tab on the
                                                      LumaLink website)
```

The Rust relay never touches media — it only forwards SDP/ICE JSON
messages between the host's own webview (the actual WebRTC peer) and
the remote client's webview. Once the `RTCPeerConnection` is up, video
and input flow directly peer-to-peer.

## Run in development

```powershell
npm install
npm run tauri:dev
```

The first run needs the Rust toolchain and the Tauri v2 prerequisites
(WebView2 is preinstalled on modern Windows). See
<https://v2.tauri.app/start/prerequisites/>.

## Build the installer (MSI)

```powershell
npx tauri icon path\to\lumalink-host-logo-1024.png   # once, see icons/README.md
npm run tauri:build
```

The `.msi` is written to `src-tauri/target/release/bundle/msi/`.

## Known limitations (read before relying on this)

- **LAN only.** Signaling is plain `ws://` with no TLS and only PIN-based
  auth — do not port-forward this to the public internet.
- **One client at a time.** The relay only tracks a single host and a
  single client connection.
- **No NAT traversal.** Only STUN is configured, no TURN — this targets
  same-network streaming, matching LumaLink's "low latency on my LAN"
  positioning, not internet-wide play.
- **Rust code in this app has not been compiled in the environment that
  generated it** (sandboxed dev environment without a working shell).
  Run `cargo check` / `npm run tauri:build` locally, or rely on the
  `.github/workflows/build-desktop.yml` CI job, to catch any compile
  errors — enigo/axum/tauri API surfaces shift between versions.
