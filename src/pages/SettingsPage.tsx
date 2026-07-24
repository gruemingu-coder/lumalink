import { useState } from "react";
import { useAppState } from "@/state/AppStateContext";
import { useAuth } from "@/state/AuthContext";
import type { StreamCodec, StreamLatencyMode, StreamResolution, StreamStartAction } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";

const resolutionOptions: { value: StreamResolution; label: string }[] = [
  { value: "720p", label: "720p (HD)" },
  { value: "1080p", label: "1080p (Full HD)" },
  { value: "1440p", label: "1440p (QHD)" },
  { value: "4k", label: "4K (UHD)" },
];

const FPS_PRESETS = [30, 60, 90, 120, 144, 165, 240, 360, 500];

const codecOptions: { value: StreamCodec; label: string }[] = [
  { value: "h264", label: "H.264 (호환성 우선, 하드웨어 인코딩 가능성 최고)" },
  { value: "h265", label: "H.265 / HEVC (권장)" },
  { value: "av1", label: "AV1 (최신 GPU 전용)" },
];

const latencyModeOptions: { value: StreamLatencyMode; label: string }[] = [
  { value: "quality", label: "화질 우선" },
  { value: "balanced", label: "균형" },
  { value: "latency", label: "지연 최소화 (프레임레이트 우선)" },
];

const streamStartActionOptions: { value: StreamStartAction; label: string }[] = [
  { value: "desktop", label: "바탕화면 그대로 유지" },
  { value: "bigPicture", label: "Steam 빅픽처 모드 실행" },
  { value: "custom", label: "지정한 프로그램 실행" },
];

export function SettingsPage() {
  const { settings, updateSettings, resetSettings, devices, renameDevice } = useAppState();
  const { user, logout } = useAuth();
  const [savedFlash, setSavedFlash] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const flashSaved = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">설정</h1>
          <p className="mt-1 text-sm text-slate-400">스트리밍 화질과 성능을 조정하세요.</p>
        </div>
        {savedFlash && <Badge tone="success">저장됨</Badge>}
      </div>

      <div className="space-y-5">
        {user && (
          <Card className="flex items-center justify-between gap-3 p-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">계정</h2>
              <p className="mt-1 text-sm text-slate-400">{user.email}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              isLoading={isLoggingOut}
              onClick={async () => {
                setIsLoggingOut(true);
                try {
                  await logout();
                } finally {
                  setIsLoggingOut(false);
                }
              }}
            >
              로그아웃
            </Button>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">화질 &amp; 성능</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="resolution"
              label="해상도"
              value={settings.resolution}
              options={resolutionOptions}
              onChange={(v) => {
                updateSettings({ resolution: v });
                flashSaved();
              }}
            />
            <Select
              id="codec"
              label="비디오 코덱"
              value={settings.codec}
              options={codecOptions}
              onChange={(v) => {
                updateSettings({ codec: v });
                flashSaved();
              }}
            />
            <Select
              id="latency-mode"
              label="인코더 우선순위"
              value={settings.latencyMode}
              options={latencyModeOptions}
              onChange={(v) => {
                updateSettings({ latencyMode: v });
                flashSaved();
              }}
            />
            <div className="py-1 sm:col-span-2">
              <label htmlFor="fps" className="mb-1 block text-sm font-medium text-slate-200">
                최대 프레임레이트: <span className="text-brand-300">{settings.fps} FPS</span>
              </label>
              <input
                id="fps"
                type="range"
                min={30}
                max={500}
                step={5}
                value={settings.fps}
                onChange={(e) => updateSettings({ fps: Number(e.target.value) })}
                onMouseUp={flashSaved}
                onTouchEnd={flashSaved}
                className="w-full accent-brand-500"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>30</span>
                <span>500 FPS</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {FPS_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      updateSettings({ fps: preset });
                      flashSaved();
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      settings.fps === preset
                        ? "bg-brand-600 text-white"
                        : "bg-base-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                여기서 설정한 값은 호스트에 전달되는 목표치입니다. 실제로 달성되는 프레임레이트는
                호스트 모니터 주사율, GPU 인코더 성능, 네트워크 대역폭에 따라 이보다 낮을 수
                있습니다.
              </p>
            </div>
            <div className="py-1 sm:col-span-2">
              <label htmlFor="bitrate" className="mb-1 block text-sm font-medium text-slate-200">
                비트레이트: <span className="text-brand-300">{settings.bitrateMbps} Mbps</span>
              </label>
              <input
                id="bitrate"
                type="range"
                min={5}
                max={300}
                step={5}
                value={settings.bitrateMbps}
                onChange={(e) => updateSettings({ bitrateMbps: Number(e.target.value) })}
                onMouseUp={flashSaved}
                onTouchEnd={flashSaved}
                className="w-full accent-brand-500"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>5</span>
                <span>300 Mbps</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">고급 옵션</h2>
          <div className="divide-y divide-base-700">
            <Toggle
              id="hw-decode"
              checked={settings.hardwareDecode}
              onChange={(v) => {
                updateSettings({ hardwareDecode: v });
                flashSaved();
              }}
              label="하드웨어 디코딩"
              description="지원되는 GPU에서 디코딩 부하를 낮춰 지연을 줄입니다."
            />
            <Toggle
              id="host-audio"
              checked={settings.hostAudio}
              onChange={(v) => {
                updateSettings({ hostAudio: v });
                flashSaved();
              }}
              label="호스트 오디오 재생"
              description="호스트 PC의 사운드를 스트리밍 기기로 함께 전송합니다."
            />
            <Toggle
              id="vsync"
              checked={settings.vsync}
              onChange={(v) => {
                updateSettings({ vsync: v });
                flashSaved();
              }}
              label="수직 동기화(V-Sync)"
              description="화면 찢김을 줄이지만 입력 지연이 소폭 늘어날 수 있습니다."
            />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">스트리밍 시작 시 동작</h2>
          <p className="mb-3 text-xs text-slate-500">
            연결이 시작될 때 호스트 PC에서 자동으로 할 일을 정합니다. 호스트 앱의 "Steam 빅픽처
            모드 실행" 버튼은 이 설정과 별개로 언제든 수동으로도 사용할 수 있습니다.
          </p>
          <Select
            id="stream-start-action"
            label="시작 동작"
            value={settings.streamStartAction}
            options={streamStartActionOptions}
            onChange={(v) => {
              updateSettings({ streamStartAction: v });
              flashSaved();
            }}
          />
          {settings.streamStartAction === "custom" && (
            <div className="mt-3">
              <label htmlFor="custom-program-path" className="mb-1 block text-sm font-medium text-slate-200">
                실행할 프로그램 경로 (호스트 PC 기준)
              </label>
              <input
                id="custom-program-path"
                type="text"
                value={settings.customProgramPath}
                onChange={(e) => updateSettings({ customProgramPath: e.target.value })}
                onBlur={flashSaved}
                placeholder="예: C:\Games\MyLauncher\launcher.exe"
                className="w-full rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500"
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                이 경로는 클라이언트가 아니라 호스트 PC에서 실행됩니다. 호스트 PC에 실제로 존재하는
                절대 경로를 입력해주세요.
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">페어링된 PC 이름</h2>
          {devices.length === 0 ? (
            <p className="text-sm text-slate-500">페어링된 PC가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {devices.map((device) => (
                <li key={device.id} className="flex items-center gap-2">
                  {renamingId === device.id ? (
                    <>
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        aria-label={`${device.name} 새 이름`}
                        className="flex-1 rounded-lg border border-base-600 bg-base-900 px-3 py-1.5 text-sm text-slate-100 focus:border-brand-500"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (nameDraft.trim()) renameDevice(device.id, nameDraft.trim());
                          setRenamingId(null);
                          flashSaved();
                        }}
                      >
                        저장
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>
                        취소
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-slate-200">{device.name}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setRenamingId(device.id);
                          setNameDraft(device.name);
                        }}
                      >
                        이름 변경
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              resetSettings();
              flashSaved();
            }}
          >
            기본값으로 초기화
          </Button>
        </div>
      </div>
    </div>
  );
}
