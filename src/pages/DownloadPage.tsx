import { Link } from "react-router-dom";
import { Logo } from "@/components/layout/Logo";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

/**
 * Served directly from this site (same origin) — see `public/downloads/`.
 * `.github/workflows/build-desktop.yml` builds both MSIs on every tag
 * push and commits them here under these exact stable filenames, so
 * these links never need to change between releases. Until the first
 * tagged CI run completes, the files won't exist yet and these links
 * will 404 — that's expected for a brand-new repo.
 */
const HOST_APP_DOWNLOAD_URL = "/downloads/LumaLink-Host-Setup.msi";
const STREAMING_APP_DOWNLOAD_URL = "/downloads/LumaLink-Streaming-Setup.msi";

const APPS = [
  {
    key: "host",
    name: "LumaLink Host",
    tagline: "스트리밍할 게이밍 PC에 설치하세요",
    description:
      "이 PC의 화면을 공유하고, PIN 페어링을 처리하고, 설치된 Steam 게임 목록을 보여줍니다. 실제로 화면 캡처와 WebRTC 전송, 입력 주입을 수행하는 앱입니다.",
    bullets: [
      "PIN 기반 페어링 (LAN 전용)",
      "Steam 라이브러리 자동 스캔",
      "실제 화면 공유 (getDisplayMedia + WebRTC)",
      "원격 마우스·키보드 입력 처리",
    ],
    downloadUrl: HOST_APP_DOWNLOAD_URL,
    fileName: "LumaLink-Host-Setup.msi",
  },
  {
    key: "streaming",
    name: "LumaLink Streaming App",
    tagline: "게임을 플레이할 기기에 설치하세요",
    description:
      "LumaLink 웹 앱과 동일한 화면을 네이티브 데스크톱 앱으로 제공합니다. 설치 없이 브라우저로 접속해도 되지만, 데스크톱 앱은 별도 창·전체화면에 더 적합합니다.",
    bullets: [
      "웹 버전과 동일한 UI/기능",
      "IP 주소로 실제 호스트에 직접 연결",
      "전체화면 저지연 플레이",
    ],
    downloadUrl: STREAMING_APP_DOWNLOAD_URL,
    fileName: "LumaLink-Streaming-Setup.msi",
  },
] as const;

export function DownloadPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-base-800/80 bg-base-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/">
            <Logo />
          </Link>
          <Link to="/app/devices">
            <Button size="sm" variant="secondary">
              웹에서 바로 시작하기
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="text-center">
          <Badge tone="brand" className="mb-4">
            데스크톱 앱 (Windows, MSI)
          </Badge>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">LumaLink 앱 다운로드</h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            게이밍 PC에는 호스트 앱을, 플레이할 기기에는 스트리밍 앱을 설치하세요. 두 앱 모두
            Windows용 MSI 설치 파일이며, 이 사이트에서 직접 제공합니다(외부 사이트로 이동하지
            않습니다).
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
          {APPS.map((app) => (
            <Card key={app.key} className="flex flex-col p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-100">{app.name}</h2>
                <Badge tone="neutral">Windows · MSI</Badge>
              </div>
              <p className="mt-1 text-sm font-medium text-brand-400">{app.tagline}</p>
              <p className="mt-3 text-sm text-slate-400">{app.description}</p>
              <ul className="mt-4 space-y-1.5">
                {app.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2 text-sm text-slate-300">
                    <CheckIcon />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <a href={app.downloadUrl} download={app.fileName}>
                  <Button className="w-full">{app.name} 다운로드 (.msi)</Button>
                </a>
                <p className="mt-2 text-center text-xs text-slate-600">{app.fileName}</p>
              </div>
            </Card>
          ))}
        </div>

        <Card className="mt-10 p-6">
          <h2 className="text-base font-semibold text-slate-100">설치 후 연결하는 방법</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-400">
            <li>
              <span className="font-medium text-slate-200">1. 게이밍 PC에 LumaLink Host를 설치하고 실행하세요.</span>
              <br />창에 표시되는 IP 주소와 4자리 PIN을 확인하세요.
            </li>
            <li>
              <span className="font-medium text-slate-200">
                2. 플레이할 기기에서 LumaLink Streaming App(또는 이 웹사이트)을 여세요.
              </span>
              <br />
              <Link to="/app/pairing" className="text-brand-400 hover:underline">
                PC 페어링
              </Link>{" "}
              화면에서 "IP로 실제 PC 연결" 탭을 선택하세요.
            </li>
            <li>
              <span className="font-medium text-slate-200">3. IP 주소와 PIN을 입력해 연결하세요.</span>
              <br />두 기기가 같은 홈 네트워크(Wi-Fi/LAN)에 있어야 합니다.
            </li>
            <li>
              <span className="font-medium text-slate-200">4. 라이브러리에서 게임을 선택하고 스트리밍을 시작하세요.</span>
            </li>
          </ol>
          <p className="mt-5 rounded-xl border border-warn-500/30 bg-warn-500/5 p-3 text-xs text-warn-400">
            보안 참고: 시그널링 연결은 같은 네트워크 안에서만 동작하도록 설계되었습니다(암호화되지
            않은 로컬 WebSocket). 공용 인터넷으로 포트를 개방하지 마세요.
          </p>
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-base font-semibold text-slate-100">저작권 · 독립성 고지</h2>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-500">
            <li>
              LumaLink는 <span className="text-slate-300">독립적인 프로젝트</span>이며 특정
              상용/오픈소스 원격 스트리밍 소프트웨어와 제휴·후원·파생 관계가 없습니다.
            </li>
            <li>
              "LumaLink" 이름·로고·UI·코드는 전부 이 프로젝트를 위해 새로 만든{" "}
              <span className="text-slate-300">오리지널 자산</span>이며, 타사 제품의 이름·로고·
              문구·이미지·코드를 그대로 사용하지 않습니다.
            </li>
            <li>
              언급될 수 있는 타사 제품명(예: Steam)은 각 소유자의 상표이며, 상호운용성 설명을
              위해서만 인용됩니다.
            </li>
          </ul>
        </Card>
      </main>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="mt-0.5 h-4 w-4 shrink-0 text-accent-400"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}
