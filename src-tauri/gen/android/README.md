# Android target (LumaLink Streaming)

Host remains Windows-only (DXGI). The Streaming client builds as an APK/AAB with Tauri 2 mobile.

## Requirements

- JDK 17
- Android SDK + NDK (Android Studio)
- Rust Android targets:
  `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`

## Local

```bash
npm install
npm run tauri:android:init   # once — generates this folder fully
npm run tauri:android:dev
npm run tauri:android:build  # APK
```

## CI

See `.github/workflows/build-android.yml` (tag `v*` or `workflow_dispatch`).
On tagged releases the APK is copied to `public/downloads/LumaLink-Streaming.apk`.

## Notes

WebCodecs `VideoDecoder` availability depends on the Android System WebView version.
If decode fails on a device, update WebView from Play Store first.
