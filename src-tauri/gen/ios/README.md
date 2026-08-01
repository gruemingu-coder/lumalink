# iOS target (LumaLink Streaming)

Host remains Windows-only (DXGI). The Streaming client is a Tauri 2 iOS app.

## Requirements

- macOS with Xcode 15+
- Apple Developer team (device install / TestFlight / App Store)
- Rust iOS targets: `aarch64-apple-ios`, `aarch64-apple-ios-sim`
- CocoaPods (Tauri may install as needed)

## Local

```bash
npm install
npm run tauri:ios:init    # once — generates src-tauri/gen/apple
npm run tauri:ios:dev     # simulator / device
npm run tauri:ios:build   # archive / IPA
```

Set `APPLE_DEVELOPMENT_TEAM` (or Xcode signing team) before a device build.

## CI

See `.github/workflows/build-apple.yml` (tag `v*` or `workflow_dispatch`).

## Notes

- Local network permission strings live in `src-tauri/Info.plist` (merged into the Apple bundle).
- WebCodecs `VideoDecoder` needs a recent WKWebView / iOS 16.4+. Older devices may need a native decode follow-up.
