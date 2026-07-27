# Android target (LumaLink Streaming)

Host remains Windows-only (DXGI). The Streaming client can be built as an APK with Tauri 2 mobile.

## Local

Prerequisites: Android Studio / SDK, NDK, JDK 17, Rust Android targets.

```bash
npm install
npm run tauri:android:init   # once — generates this folder fully
npm run tauri:android:dev
npm run tauri:android:build  # APK
```

## CI

See `.github/workflows/build-android.yml` (tag `v*` or workflow_dispatch). Artifacts upload when the APK build succeeds.

Note: WebCodecs `VideoDecoder` availability varies by Android WebView version; native decode may need a follow-up path.
