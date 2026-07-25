# LumaLink

**내 PC 게임을 다른 기기에서 낮은 지연으로 플레이.**

LumaLink는 원격 PC 게임 스트리밍의 **독립적인 프로젝트**입니다. 어떤 상용/오픈소스
소프트웨어(예: Moonlight)의 이름, 로고, 문구, 이미지, 코드를 그대로 사용하지 않으며, 모든
UI·브랜딩·코드는 이 프로젝트를 위해 새로 작성되었습니다.

이 저장소에는 세 부분이 있습니다:

| 부분 | 위치 | 설명 |
| --- | --- | --- |
| 웹사이트 | `src/` (브라우저 빌드) | 소개·다운로드 전용. `/`와 `/download`만 노출하며, 브라우저에서는 스트리밍 UI에 들어가지 않습니다. |
| 스트리밍 앱 | `src/` + `src-tauri/` | 같은 React UI를 Tauri로 패키징. **계정 로그인 필수**, 클라우드에 등록된 PC 목록 동기화, **네이티브 H.264 수신(WebCodecs)**, WOL/LAN 검색. MSI로 배포. |
| 호스트 앱 | `host-app/` | Tauri + Rust. 게이밍 PC에 설치. **계정 로그인 필수**, PIN 페어링, Steam 스캔, **DXGI + NVENC(ffmpeg) 캡처**, 입력 주입, **트레이 백그라운드**, 클라우드 하트비트. MSI로 배포. |

계정 API는 Cloudflare Worker + D1 (`worker/`, `migrations/`)로 동작합니다. 정적 사이트와
같은 Worker가 `/api/*`를 처리합니다.

실제로 동작하는 기능:

- **계정 / 자동 로그인**: 호스트·스트리밍 앱 모두 최초 실행 시 로그인/회원가입. 세션은
  `tauri-plugin-store`로 저장되어 다음 실행부터 자동 로그인.
- **클라우드 PC 동기화**: 호스트가 주기적으로 IP/PIN/MAC을 계정에 등록하면, 같은 계정으로
  로그인한 스트리밍 앱에 자동으로 목록이 표시됩니다.
- **다중 클라이언트**: 같은 PIN으로 여러 기기가 동시에 한 호스트에 접속할 수 있습니다.
- **Wi-Fi/LAN 자동 검색**: 스트리밍 데스크톱 앱에서 같은 네트워크의 호스트를 UDP로 검색.
- **Wake-on-LAN(WOL)**: 페어링/동기화 시 저장된 MAC으로 매직 패킷 전송.
- **스트리밍 시작 동작 커스텀**: 클라이언트 설정에서 빅픽처 / 바탕화면 / 커스텀 프로그램
  실행을 선택하면, 연결 시 호스트가 자동으로 수행합니다. 호스트의 수동 빅픽처 버튼도 유지.
- **호스트 트레이 상주**: 창을 닫아도 트레이에서 계속 실행되며 연결을 받습니다. 완전 종료는
  트레이 메뉴의 "종료".
- **고FPS 설정**: 최대 500 FPS 목표(실제 값은 모니터·GPU·네트워크에 따라 제한).
- **DXGI + NVENC**: 호스트는 Windows DXGI 데스크톱 복제로 캡처하고, PATH의 `ffmpeg`로
  `h264_nvenc`(없으면 `libx264`) 인코딩 후 TCP로 전송합니다. Sunshine/Moonlight 프로토콜과는
  무관합니다.

## 화면 구성

| 화면 | 경로 | 어디서 | 설명 |
| --- | --- | --- | --- |
| 랜딩 | `/` | 웹사이트 | 소개, 기능, 작동 방식 |
| 앱 다운로드 | `/download` | 웹사이트 (+데스크톱에서도 접근 가능) | Host / Streaming MSI |
| 로그인 | (앱 진입 게이트) | 데스크톱 앱만 | 회원가입 / 로그인 |
| 내 PC | `/app/devices` | 스트리밍 앱 | 클라우드 동기화 + 수동 페어링 PC |
| PC 페어링 | `/app/pairing` | 스트리밍 앱 | LAN 검색 또는 IP/PIN 직접 입력 |
| 게임 라이브러리 | `/app/library` | 스트리밍 앱 | Steam 목록 + 데스크탑 전체 화면 |
| 플레이어 | `/player/:deviceId/:gameId` | 스트리밍 앱 | HUD, 종료 |
| 설정 | `/app/settings` | 스트리밍 앱 | 화질/시작 동작/계정 |

## 기술 스택

- React 18 + TypeScript + Vite + Tailwind CSS
- React Router v6 (브라우저: 소개만 / Tauri: 풀 앱 + 로그인 게이트)
- Cloudflare Workers (Hono) + D1 — 계정·기기 동기화 API
- DXGI + ffmpeg (`h264_nvenc` / `libx264`) + TCP 미디어 + WebCodecs 디코드
- 호스트 로컬 WebSocket 시그널링 (세션/입력), Tauri 2 — MSI, store, 트레이

## 로컬 실행

```bash
npm install
npm run dev          # 웹사이트 (소개/다운로드) — http://localhost:5173
npm run build
```

계정 API까지 로컬에서 돌리려면:

```bash
# 1) D1 생성 (최초 1회) — 출력되는 database_id를 wrangler.toml에 붙여넣기
npx wrangler d1 create lumalink

# 2) 스키마 적용
npx wrangler d1 execute lumalink --local --file=./migrations/0001_init.sql
npx wrangler d1 execute lumalink --remote --file=./migrations/0001_init.sql

# 3) JWT 시크릿
copy .dev.vars.example .dev.vars   # 로컬용
npx wrangler secret put JWT_SECRET # 프로덕션용

# 4) 배포 (정적 dist + /api Worker)
npm run build
npx wrangler deploy
```

데스크톱 앱:

```powershell
# 스트리밍 앱
npm run tauri:dev
npm run tauri:build

# 호스트 앱
cd host-app
npm install
npm run tauri:dev
npm run tauri:build
```

## 사용해보기 (실제 흐름)

1. `/download`에서 Host MSI와 Streaming MSI를 설치합니다.
2. **같은 이메일/비밀번호**로 두 앱에 로그인(또는 회원가입)합니다.
3. 호스트 앱이 트레이에서 대기하며 PIN을 표시하고, 클라우드에 이 PC를 등록합니다.
4. 스트리밍 앱의 **내 PC**에 호스트가 자동으로 나타납니다. (안 보이면 LAN 검색/IP+PIN으로
   수동 페어링도 가능합니다.)
5. 라이브러리에서 게임 또는 "데스크탑 전체 화면"을 고른 뒤 스트리밍을 시작합니다.
6. 설정에서 해상도/FPS/시작 동작(빅픽처·바탕화면·커스텀 프로그램)을 바꿀 수 있습니다.

## 코드 구조

```
src/                  웹사이트 + 스트리밍 앱 UI
  pages/              Landing, Download, Login, Devices, Pairing, Library, Player, Settings
  services/
    account/          authClient.ts — Worker /api 호출
    pairing/          discoverHosts, realHostClient
    streaming/        WebRtcStreamingEngine, signalingProtocol, createStreamingEngine
  state/              AuthContext, AppStateContext
  utils/              platform (isDesktopApp), cloudDevices, games
worker/               Cloudflare Worker (Hono) — /api/auth/*, /api/devices
migrations/           D1 스키마
src-tauri/            스트리밍 앱 네이티브 (WOL, LAN discovery, store)
host-app/             호스트 앱 (시그널링, Steam, 입력, tray, 하트비트)
```

### 스트리밍 경로

UI는 `StreamingEngine` 인터페이스만 봅니다. 현재는 항상 `WebRtcStreamingEngine`을
사용합니다(모의 엔진/시드 PC는 제거됨).

호스트 `startSharing()`은 클라이언트가 offer에 실어 보낸 `quality.streamStartAction`에 따라
`launch_big_picture` / `launch_custom_program`을 호출합니다.

### 계정 토큰

로그인 성공 시 받은 bearer token은 각 앱의 로컬 store에 저장되고, 다음 실행 시
`GET /api/auth/me`로 검증해 유효하면 로그인 화면을 건너뜁니다.

## MSI 배포

태그(`v0.3.0` 등)를 푸시하면 `.github/workflows/build-desktop.yml`이 두 MSI를 빌드해
`public/downloads/`에 고정 파일명으로 커밋합니다. 이후:

```powershell
git pull
npm run build
npx wrangler deploy
```

## 알려진 한계

- **LAN 전용 영상 경로**: 시그널링은 암호화되지 않은 `ws://`이며 PIN 인증만 있습니다.
  공용 인터넷에 포트를 열지 마세요. 계정 API만 HTTPS입니다.
- **NAT 통과 없음**: STUN만 설정되어 있고 TURN이 없어 같은 네트워크 밖에서는 실패할 수
  있습니다. 클라우드 동기화는 LAN IP를 기억할 뿐, 원격 중계는 하지 않습니다.
- **이메일 인증/비밀번호 재설정/OAuth**는 아직 없습니다.
- 앱 아이콘은 `npx tauri icon`으로 생성하세요.

## 저작권 · 독립성 고지

- LumaLink는 **독립적인 프로젝트**이며, 특정 상용/오픈소스 원격 스트리밍 소프트웨어와
  제휴·후원·파생 관계가 전혀 없습니다.
- "LumaLink" 이름·로고·UI·코드는 전부 이 프로젝트를 위해 새로 만든 **오리지널 자산**입니다.
- 언급될 수 있는 타사 제품명(예: Steam)은 각 소유자의 상표이며, 상호운용성 설명용으로만
  인용됩니다.
- 실제 WebRTC 화면 공유는 Host/Streaming 데스크톱 앱을 설치하고 계정으로 로그인한 뒤에만
  동작합니다. 이 웹사이트는 소개·다운로드 전용입니다.
