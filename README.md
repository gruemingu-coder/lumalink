# LumaLink

**내 PC 게임을 다른 기기에서 낮은 지연으로 플레이.**

LumaLink는 원격 PC 게임 스트리밍 클라이언트의 **독립적인 데모/포트폴리오 프로젝트**입니다.
Moonlight 등 특정 상용/오픈소스 프로젝트의 이름, 로고, 문구, 이미지, 코드를 그대로 사용하지
않으며, 모든 UI·브랜딩·코드는 이 프로젝트를 위해 새로 작성되었습니다.

이 저장소에는 세 부분이 있습니다:

| 부분 | 위치 | 설명 |
| --- | --- | --- |
| 웹 앱 / 스트리밍 앱 | `src/` (+ 루트 `src-tauri/`) | React/TS 웹사이트. 데모 PC는 모의(mock) 스트리밍, "IP로 실제 PC 연결"로 페어링한 PC는 **진짜 WebRTC**로 스트리밍합니다. `src-tauri/`를 통해 동일 코드를 Windows용 MSI 데스크톱 앱으로도 빌드할 수 있습니다. |
| 호스트 앱 | `host-app/` | Tauri + Rust. 게이밍 PC에 설치해 PIN 페어링, Steam 라이브러리 스캔, 실제 화면 캡처(WebRTC 송신), 원격 입력 주입을 수행합니다. MSI로 배포됩니다. |
| (레거시) 호스트 에이전트 | `host-agent/` | 스트리밍 이전 단계에서 만든 Node.js 기반 프로토타입(HTTP 페어링 + Steam 스캔만, 스트리밍 없음). `host-app/`이 이를 대체하는 정식 경로이며, `host-agent/`는 참고용으로 남겨두었습니다. |

실시간 화면 전송이 필요한 부분(호스트의 화면 캡처, WebRTC 시그널링, 입력 주입)은
`host-app/`에서 **실제로 동작하도록** 구현했습니다 — 다만 LAN 환경, 단일 클라이언트,
TURN 서버 없음 등 데모 수준의 제약이 있습니다. 자세한 내용은 아래 "실제 스트리밍
아키텍처"와 `host-app/README.md`를 참고하세요.

## 화면 구성

| 화면 | 경로 | 설명 |
| --- | --- | --- |
| 랜딩 페이지 | `/` | 핵심 메시지, 기능 소개, 작동 방식 |
| 내 PC 목록 | `/app/devices` | 페어링된 PC 목록, 상태, PC 추가 |
| PC 페어링 | `/app/pairing` | 네트워크 검색 → PIN 확인 → 완료 |
| 게임 라이브러리 | `/app/library`, `/app/library/:deviceId` | PC 선택 → 게임 카드 그리드 (실기 연결 시 Steam 게임 실목록) |
| 스트리밍 플레이어 | `/player/:deviceId/:gameId` | 연결 상태, 해상도/FPS/지연시간 HUD, 종료 |
| 설정 | `/app/settings` | 해상도/FPS/비트레이트/코덱, 고급 옵션, PC 이름 관리 |
| 앱 다운로드 | `/download` | 호스트 앱 / 스트리밍 앱 MSI 다운로드 안내 |

## 기술 스택

- React 18 + TypeScript
- Vite
- Tailwind CSS (다크 게임 런처 테마)
- React Router v6
- 상태 관리: React Context + `localStorage` 영속화 (별도 라이브러리 없음)
- 실제 스트리밍: 브라우저/웹뷰 네이티브 `RTCPeerConnection` + 자체 WebSocket 시그널링
- 데스크톱 패키징: [Tauri](https://tauri.app) (Rust) — `src-tauri/`(클라이언트),
  `host-app/src-tauri/`(호스트, `enigo` 입력 주입 포함)

## 실행 방법

```bash
# 1) 의존성 설치
npm install

# 2) 개발 서버 실행 (기본 포트 5173)
npm run dev

# 3) 프로덕션 빌드
npm run build

# 4) 빌드 결과 미리보기
npm run preview
```

Node.js 18 이상을 권장합니다. `npm install` 후 브라우저에서
`http://localhost:5173`을 열면 됩니다.

## 사용해보기 (데모 흐름)

1. 랜딩 페이지에서 **"무료로 시작하기"** 클릭 → 내 PC 목록으로 이동
   (이미 페어링된 예시 PC 2대가 시드 데이터로 들어있습니다).
2. **"+ PC 추가"** → 네트워크 검색 → PC 선택 → 화면에 표시된 PIN을 그대로
   입력창에 입력 → 페어링 완료.
3. 온라인 상태인 PC 카드의 **"라이브러리 열기"** 클릭 → 게임 카드를 선택.
4. 하단에 나타나는 **"스트리밍 시작"** 클릭 → 연결 협상 → 스트리밍 화면
   진입. 좌상단 HUD에서 해상도/FPS/지연시간/비트레이트 실시간 확인.
5. 하단 컨트롤의 **"장애 시뮬레이션"**으로 오류 상태와 재연결 흐름을,
   **"스트리밍 종료"**로 정상 종료 흐름을 확인할 수 있습니다.
6. **설정** 화면에서 해상도/FPS/코덱/비트레이트를 바꾸면 다음 스트리밍부터
   반영됩니다 (localStorage에 저장).

## 코드 구조

```
src/
  components/
    devices/    DeviceCard 등 PC 목록 관련 컴포넌트
    layout/     Logo, Sidebar, AppLayout (반응형 사이드바/드로어)
    library/    GameCard
    player/     StreamHud (오버레이 통계)
    ui/         Button, Card, Badge, Toggle, Select, Spinner,
                EmptyState, ErrorState, Skeleton (공용 UI 킷)
  data/         mockDevices.ts, mockGames.ts — 시드/모의 데이터
  hooks/        useStreamingSession — StreamingEngine ↔ React 상태 브릿지
  pages/        Landing/Devices/Pairing/Library/Player/Settings/NotFound
  services/
    pairing/    PairingService(mock) + MockPairingService,
                realHostClient.ts (실기 PIN 인증 핸드셰이크)
    streaming/  StreamingEngine 인터페이스 + MockStreamingEngine +
                WebRtcStreamingEngine(실기) + signalingProtocol.ts +
                createStreamingEngine 팩토리
  state/        AppStateContext (페어링된 PC, 스트리밍 설정, 실기 게임 목록) + storage.ts
  types/        domain.ts — 모든 도메인 타입 정의
  utils/        format.ts, games.ts (mock/실기 게임 목록 해석)
src-tauri/      스트리밍 앱을 Windows MSI로 패키징 (루트 웹앱 재사용)
host-app/       호스트 앱: Tauri+Rust (시그널링 릴레이, Steam 스캔, 입력 주입) + 자체 프론트엔드
host-agent/     (레거시) Node.js 기반 초기 프로토타입 — host-app으로 대체됨
.github/workflows/build-desktop.yml  두 앱 MSI 빌드 + public/downloads/ 자동 배포 CI
```

### 실제 스트리밍 아키텍처 (mock이 아닌 경로)

UI와 상태 관리 코드는 전송 계층을 전혀 알지 못하고, 오직
`src/services/streaming/StreamingEngine.ts`의 인터페이스에만 의존합니다. 이 인터페이스에는
두 구현체가 있습니다:

```ts
export interface StreamingEngine {
  connect(config: StreamConnectConfig): Promise<void>;
  disconnect(): Promise<void>;
  onStats(callback: (stats: StreamStats) => void): Unsubscribe;
  onStatusChange(callback: (status: StreamSessionStatus) => void): Unsubscribe;
  sendInput(event: InputForwardEvent): void;
  attachRenderTarget(target: HTMLCanvasElement | HTMLVideoElement): void;
  onRemoteGames?(callback: (games: RemoteGameSummary[]) => void): Unsubscribe;
}
```

- **`MockStreamingEngine`** — 데모 시드 PC용. 캔버스에 애니메이션을 그리고 통계는 난수로
  생성합니다. 실제 네트워크 전송이 없습니다.
- **`WebRtcStreamingEngine`** — `PairingPage`의 "IP로 실제 PC 연결"로 페어링한 실기용.
  `ws://<host-ip>:58712/signal`로 [`host-app`](./host-app)의 시그널링 릴레이에 접속해
  PIN 인증 → SDP/ICE 교환 → `RTCPeerConnection` 수립까지 **진짜로 수행**하고, 받은
  `MediaStream`을 `<video>`에 붙입니다. `onStats`는 `RTCPeerConnection.getStats()`를
  폴링한 실제 FPS/지연/비트레이트/패킷 손실률입니다. 입력은 `RTCDataChannel`로 호스트에
  전달되어 `enigo`로 실제 주입됩니다.

`createStreamingEngine(config)`가 `config.realHost` 유무로 둘 중 무엇을 반환할지
결정합니다 (`src/services/streaming/createStreamingEngine.ts`). `useStreamingSession`,
`PlayerPage`, `StreamHud` 등 나머지 코드는 어느 엔진이 쓰이는지 전혀 알 필요가 없습니다.

시그널링 프로토콜(JSON 메시지 타입)은 `src/services/streaming/signalingProtocol.ts`에
정의되어 있고, `host-app/src/signalingProtocol.ts`에 동일한 내용이 손으로 복사되어
있습니다(별도 npm 프로젝트라 워크스페이스 없이는 직접 import할 수 없어서입니다 — 하나를
고치면 다른 하나도 고쳐야 합니다).

같은 방식으로 `src/services/pairing/PairingService.ts`(데모용 mock)와
`src/services/pairing/realHostClient.ts`(실기용 PIN 인증 + 게임 목록 핸드셰이크)가
분리되어 있습니다.

## 데스크톱 앱 (호스트 / 스트리밍) 빌드하기

```powershell
# 스트리밍 앱 (루트 웹앱을 Tauri로 패키징)
npm install
npx tauri icon path\to\logo-1024.png   # 최초 1회, src-tauri/icons/README.md 참고
npm run tauri:build                     # -> src-tauri/target/release/bundle/msi/*.msi

# 호스트 앱
cd host-app
npm install
npx tauri icon path\to\logo-1024.png
npm run tauri:build                     # -> host-app/src-tauri/target/release/bundle/msi/*.msi
```

Rust/Tauri 툴체인이 로컬에 필요합니다
(<https://v2.tauri.app/start/prerequisites/>).

### 배포 방식: 사이트 자체 다운로드 (GitHub Release 아님)

MSI는 GitHub Release가 아니라 **이 웹사이트 자체에서 같은 출처(same-origin)로
직접 제공**됩니다. 태그(`v0.1.0` 등)를 푸시하면:

1. `.github/workflows/build-desktop.yml`의 `build` job이 두 앱을 Windows 러너에서
   빌드합니다 (Rust/Tauri 코드의 실제 컴파일 검증 경로입니다).
2. 이어서 `publish-to-site` job이 빌드된 MSI 두 개를 기본 브랜치(main)의
   `public/downloads/LumaLink-Host-Setup.msi`,
   `public/downloads/LumaLink-Streaming-Setup.msi`라는 **고정 파일명**으로 복사하고
   자동으로 커밋·푸시합니다.
3. 그 커밋을 로컬에 반영한 뒤(`git pull`), 사이트를 다시 빌드/배포하세요:
   ```powershell
   npm run build
   npx wrangler deploy
   ```
   (Cloudflare Pages의 Git 연동을 쓴다면 3단계는 push만으로 자동 진행됩니다.)

`src/pages/DownloadPage.tsx`(`/download`)는 위 고정 파일명을 가리키는 상대 경로
(`/downloads/...`)로 링크하므로, 새 버전을 릴리스해도 이 페이지 코드를 다시 고칠
필요가 없습니다. 저장소를 막 만들었다면(태그를 아직 푸시하지 않았다면) 이 파일들이
없어서 다운로드 링크가 404가 되는 게 정상입니다 — 첫 태그 릴리스 후 해결됩니다.

MSI 바이너리를 git에 커밋하는 방식이라 저장소 용량이 릴리스마다 조금씩 늘어납니다.
데모/개인 프로젝트 규모에서는 괜찮지만, 장기적으로는 Cloudflare R2 + Worker 라우트나
Git LFS로 옮기는 것을 고려하세요.

## 접근성 / 반응형 / 상태 처리

- 키보드 포커스 링, 스킵 링크(`본문으로 건너뛰기`), `aria-live`/`role="status"`,
  `role="switch"`, 아이콘 버튼 `aria-label` 적용.
- `sm/md/lg/xl` 브레이크포인트 기반 반응형 그리드, 모바일 드로어 내비게이션.
- 모든 주요 화면에 로딩(스켈레톤/스피너), 오류(재시도 포함), 빈 상태 UI 포함.

## 알려진 한계

- **LAN 전용**: 시그널링은 암호화되지 않은 `ws://`이며 PIN 인증만 있습니다. 공용
  인터넷에 포트를 열지 마세요.
- **동시 클라이언트 1개**: 호스트 앱의 릴레이는 호스트 1 + 클라이언트 1 연결만 추적합니다.
- **NAT 통과 없음**: STUN만 설정되어 있고 TURN 서버가 없어 같은 네트워크 밖에서는
  연결이 실패할 수 있습니다.
- **Rust 코드는 이 저장소를 생성한 환경에서 컴파일 검증되지 않았습니다** (셸이 동작하지
  않는 샌드박스). `.github/workflows/build-desktop.yml` CI 또는 로컬
  `npm run tauri:build`가 실제 검증 경로입니다. `enigo`/`axum`/`tauri` crate 버전에
  따라 API가 조금씩 달라질 수 있으니 컴파일 에러가 나면 해당 crate의 최신 문서를
  참고해 조정해주세요.
- 앱 아이콘(`icons/icon.ico` 등)은 바이너리라 이 저장소에 커밋되어 있지 않습니다.
  `npx tauri icon`으로 직접 생성하거나, CI가 자동으로 생성하는 임시 placeholder를
  사용하세요.

## 면책 고지

이 프로젝트는 학습/포트폴리오 목적의 독립적인 데모이며 특정 상용 소프트웨어와
무관합니다. 모든 브랜드 자산(이름, 로고, 카피)은 LumaLink만의 오리지널 디자인입니다.
데모 시드 PC는 여전히 모의(mock) 스트리밍이며, `host-app`/`src-tauri`로 빌드한 실제
데스크톱 앱을 통해서만 실제 WebRTC 화면 공유가 동작합니다.
