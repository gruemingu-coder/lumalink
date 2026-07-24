# LumaLink Host App

Runs on the gaming PC you want to stream **from**. Built with
[Tauri](https://tauri.app) (Rust) + a small React/TypeScript UI.

## What it actually does

- **Requires a LumaLink account** on first launch (login/signup). The
  session is persisted with `tauri-plugin-store` so the next launch
  auto-logs in. Closing the window **hides to the system tray** instead
  of quitting — signaling, discovery, and cloud heartbeats keep running
  until you choose "종료" from the tray menu.
- Registers this PC to the logged-in account every ~30s (`POST /api/devices`
  with name / LAN IP / MAC / PIN) so a Streaming app on the same account
  can list it without retyping an IP/PIN.
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
  over a real `RTCPeerConnection` — no mock renderer. The screen is
  captured once and shared across every connected client.
- **Supports multiple simultaneous clients** on the same PIN — the
  relay tags every message with a `clientId` so this app can run one
  independent `RTCPeerConnection` per connected client (see
  `signaling.rs` / `state.rs`).
- Applies the client's requested resolution/FPS/bitrate/quality
  trade-off to the capture + `RTCRtpSender` (`maxFramerate`,
  `maxBitrate`, `degradationPreference`, H.264 codec preference,
  `contentHint: "motion"`) — the highest FPS actually achieved still
  depends on the host's monitor, GPU/encoder, and network.
- Receives mouse/keyboard events from the client over an `RTCDataChannel`
  and injects them into the OS using the [`enigo`](https://docs.rs/enigo)
  crate, so the remote client can genuinely control this PC.
- Honors the client's `streamStartAction` on connect: Steam Big Picture,
  plain desktop (no extra launch), or a custom program path on this PC.
  A manual "Steam 빅픽처 모드 실행" button remains available too.
- Can also launch a selected Steam game via `steam://run/<appid>`.
- Broadcasts a small UDP announcement every 2s (`discovery.rs`, port
  58713) so the LumaLink Streaming *desktop* app can auto-discover this
  PC on the LAN instead of requiring a manually typed IP address. The
  announcement never includes the PIN.
- Reports this PC's MAC address during pairing so the Streaming desktop
  app can send a Wake-on-LAN magic packet later, if the PC's network
  adapter has WOL enabled.

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
- **No NAT traversal.** Only STUN is configured, no TURN — this targets
  same-network streaming, matching LumaLink's "low latency on my LAN"
  positioning, not internet-wide play.
- **FPS is a target, not a guarantee.** The UI allows requesting up to
  500 FPS to match Moonlight/Sunshine-style sliders, but the actual
  rate is bounded by the host's monitor refresh rate, `getDisplayMedia`
  + WebRTC's browser-native (not custom GPU/DXGI) capture pipeline, and
  the GPU's hardware H.264 encoder, if any. True Moonlight-class
  capture (Desktop Duplication API + NVENC/AMF) would require replacing
  this app's capture path with native Rust code — noted as a future
  direction, not implemented here.
- **Wake-on-LAN only wakes what the NIC/BIOS allow.** LumaLink can send
  the magic packet from the Streaming desktop app, but the host PC's
  network adapter must have WOL enabled in Windows device settings
  and/or BIOS for it to actually work.
- **Rust code in this app has not been compiled in the environment that
  generated it** (sandboxed dev environment without a working shell).
  Run `cargo check` / `npm run tauri:build` locally, or rely on the
  `.github/workflows/build-desktop.yml` CI job, to catch any compile
  errors — enigo/axum/tauri API surfaces shift between versions.
