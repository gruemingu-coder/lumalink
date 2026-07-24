import { Link } from "react-router-dom";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const features = [
  {
    title: "초저지연 스트리밍",
    description: "네트워크 경로를 최적화해 입력부터 화면 반응까지의 지연을 최소화합니다.",
    icon: <BoltIcon />,
  },
  {
    title: "어디서나 즉시 플레이",
    description: "노트북, 태블릿, 거실 TV 등 어떤 기기에서도 내 PC 게임 화면을 그대로 이어갑니다.",
    icon: <DevicesIcon />,
  },
  {
    title: "간편한 PC 페어링",
    description: "몇 번의 클릭과 PIN 확인만으로 새 PC를 안전하게 연결할 수 있습니다.",
    icon: <LinkIcon />,
  },
  {
    title: "세밀한 화질·성능 설정",
    description: "해상도, 프레임레이트, 비트레이트, 코덱까지 원하는 대로 조정하세요.",
    icon: <SlidersIcon />,
  },
];

const steps = [
  {
    step: "1",
    title: "내 PC 등록",
    description: "LumaLink 호스트 에이전트가 설치된 PC를 홈 네트워크에서 찾습니다.",
  },
  {
    step: "2",
    title: "PIN으로 페어링",
    description: "호스트 화면에 표시되는 PIN을 입력해 안전하게 신뢰 관계를 맺습니다.",
  },
  {
    step: "3",
    title: "게임 선택 후 스트리밍",
    description: "라이브러리에서 게임을 고르면 곧바로 저지연 스트리밍이 시작됩니다.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only-focusable fixed left-3 top-3 z-50 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
      >
        본문으로 건너뛰기
      </a>

      <header className="sticky top-0 z-40 border-b border-base-800/80 bg-base-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <nav aria-label="주 메뉴" className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#features" className="hover:text-white">
              기능
            </a>
            <a href="#how-it-works" className="hover:text-white">
              작동 방식
            </a>
            <Link to="/download" className="hover:text-white">
              앱 다운로드
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/download" className="hidden sm:block">
              <Button size="sm" variant="secondary">
                앱 다운로드
              </Button>
            </Link>
            <Link to="/app/devices">
              <Button size="sm">PC 연결하기</Button>
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content">
        {/* Hero */}
        <section className="relative overflow-hidden bg-hero-glow px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 lg:flex-row">
            <div className="max-w-xl text-center lg:text-left">
              <Badge tone="brand" className="mb-5">
                독립 데모 프로젝트
              </Badge>
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                내 PC 게임을
                <br />
                다른 기기에서
                <br />
                <span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-transparent">
                  낮은 지연으로 플레이
                </span>
              </h1>
              <p className="mt-5 text-base text-slate-400 sm:text-lg">
                LumaLink는 집에 있는 게이밍 PC의 화면과 사운드를 노트북, 태블릿, TV로
                실시간 전송하는 원격 스트리밍 클라이언트 데모입니다.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link to="/app/devices">
                  <Button size="lg" className="w-full sm:w-auto">
                    무료로 시작하기
                  </Button>
                </Link>
                <a href="#features">
                  <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                    기능 살펴보기
                  </Button>
                </a>
              </div>
            </div>

            <div className="w-full max-w-md">
              <Card className="p-4 shadow-glow">
                <div className="flex items-center justify-between border-b border-base-700 pb-3">
                  <span className="text-xs font-medium text-slate-400">AURORA-RIG · 스트리밍 중</span>
                  <Badge tone="success">온라인</Badge>
                </div>
                <div className="mt-4 aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500" />
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["해상도", "1440p"],
                    ["FPS", "120"],
                    ["지연", "11ms"],
                    ["비트레이트", "35Mbps"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-base-800 py-2">
                      <dt className="text-[10px] uppercase text-slate-500">{label}</dt>
                      <dd className="font-mono text-sm font-semibold text-slate-100">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">왜 LumaLink인가요</h2>
            <p className="mt-2 text-slate-400">가정용 PC를 개인 클라우드 게이밍 서버처럼 사용하세요.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title} className="p-5">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/15 text-brand-300">
                  {feature.icon}
                </div>
                <h3 className="font-semibold text-slate-100">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-slate-400">{feature.description}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">작동 방식</h2>
            <p className="mt-2 text-slate-400">3단계면 충분합니다.</p>
          </div>
          <ol className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {steps.map((s) => (
              <li key={s.step}>
                <Card className="h-full p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    {s.step}
                  </span>
                  <h3 className="mt-4 font-semibold text-slate-100">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-400">{s.description}</p>
                </Card>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex justify-center">
            <Link to="/app/pairing">
              <Button size="lg">지금 PC 페어링하기</Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-base-800 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Logo size="sm" />
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-slate-500">
            LumaLink는 학습·포트폴리오 목적의 독립적인 데모 프로젝트입니다. 웹 데모의 스트리밍
            화면은 모의(mock) 렌더링이며, LumaLink Host/Streaming 데스크톱 앱을{" "}
            <Link to="/download" className="underline hover:text-slate-300">
              설치
            </Link>
            하면 실제 WebRTC 기반 화면 공유로 연결할 수 있습니다. 특정 상용 소프트웨어의
            이름·로고·문구·이미지·코드를 사용하거나 이를 대체하지 않으며, 모든 브랜드 자산은
            LumaLink만의 오리지널 디자인입니다.
          </p>
          <p className="mt-4 text-xs text-slate-600">© 2026 LumaLink Demo Project.</p>
        </div>
      </footer>
    </div>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}
function DevicesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <rect x="2.5" y="4" width="14" height="10" rx="1.5" />
      <rect x="14.5" y="9" width="7" height="11" rx="1.5" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 15 9m-5-3 1.4-1.4a4 4 0 1 1 5.6 5.6L15.6 11M11 13l-1.4 1.4a4 4 0 1 1-5.6-5.6L5.4 7.4" />
    </svg>
  );
}
function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path strokeLinecap="round" d="M4 6h9m3 0h4M4 12h4m3 0h9M4 18h13m3 0h0" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="19" cy="18" r="2" />
    </svg>
  );
}
