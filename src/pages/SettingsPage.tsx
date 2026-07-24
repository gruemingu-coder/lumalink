import { useState } from "react";
import { useAppState } from "@/state/AppStateContext";
import type { StreamCodec, StreamFps, StreamResolution } from "@/types/domain";
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

const fpsOptions: { value: StreamFps; label: string }[] = [
  { value: 30, label: "30 FPS" },
  { value: 60, label: "60 FPS" },
  { value: 90, label: "90 FPS" },
  { value: 120, label: "120 FPS" },
];

const codecOptions: { value: StreamCodec; label: string }[] = [
  { value: "h264", label: "H.264 (호환성 우선)" },
  { value: "h265", label: "H.265 / HEVC (권장)" },
  { value: "av1", label: "AV1 (최신 GPU 전용)" },
];

export function SettingsPage() {
  const { settings, updateSettings, resetSettings, devices, renameDevice } = useAppState();
  const [savedFlash, setSavedFlash] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

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
              id="fps"
              label="프레임레이트"
              value={settings.fps}
              options={fpsOptions}
              onChange={(v) => {
                updateSettings({ fps: v });
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
            <div className="py-1">
              <label htmlFor="bitrate" className="mb-1 block text-sm font-medium text-slate-200">
                비트레이트: <span className="text-brand-300">{settings.bitrateMbps} Mbps</span>
              </label>
              <input
                id="bitrate"
                type="range"
                min={5}
                max={100}
                step={5}
                value={settings.bitrateMbps}
                onChange={(e) => updateSettings({ bitrateMbps: Number(e.target.value) })}
                onMouseUp={flashSaved}
                onTouchEnd={flashSaved}
                className="w-full accent-brand-500"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>5</span>
                <span>100 Mbps</span>
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
