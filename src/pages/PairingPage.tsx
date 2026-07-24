import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "@/state/AppStateContext";
import { MockPairingService } from "@/services/pairing/PairingService";
import { mockDiscoverableDevices } from "@/data/mockDevices";
import { connectToRealHost, RealHostAuthError } from "@/services/pairing/realHostClient";
import {
  discoverHostsOnLan,
  isLanDiscoverySupported,
  type DiscoveredHost,
} from "@/services/pairing/discoverHosts";
import { SIGNALING_PORT } from "@/services/streaming/signalingProtocol";
import type { DiscoveredDevice } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge } from "@/components/ui/Badge";

type Step = "discover" | "pin" | "success";
type PairingMode = "demo" | "real";

const STEP_ORDER: { key: Step; label: string }[] = [
  { key: "discover", label: "PC 선택" },
  { key: "pin", label: "PIN 확인" },
  { key: "success", label: "완료" },
];

export function PairingPage() {
  const { devices, addDevice, setRealGames } = useAppState();
  const navigate = useNavigate();
  const [mode, setMode] = useState<PairingMode>("demo");

  const [realAddress, setRealAddress] = useState("");
  const [realSignalPort, setRealSignalPort] = useState(SIGNALING_PORT);
  const [realPin, setRealPin] = useState("");
  const [isConnectingReal, setIsConnectingReal] = useState(false);
  const [realError, setRealError] = useState<string | null>(null);
  const [realPairedName, setRealPairedName] = useState("");

  const [lanSupported, setLanSupported] = useState(false);
  const [lanHosts, setLanHosts] = useState<DiscoveredHost[] | null>(null);
  const [isDiscoveringLan, setIsDiscoveringLan] = useState(false);

  useEffect(() => {
    void isLanDiscoverySupported().then(setLanSupported);
  }, []);

  const runLanDiscovery = async () => {
    setIsDiscoveringLan(true);
    setLanHosts(null);
    try {
      const hosts = await discoverHostsOnLan();
      setLanHosts(hosts);
    } finally {
      setIsDiscoveringLan(false);
    }
  };

  const handleSelectLanHost = (host: DiscoveredHost) => {
    setRealAddress(host.address);
    setRealSignalPort(host.signalPort);
  };

  const handleConnectReal = async () => {
    if (!realAddress.trim() || realPin.length !== 4) return;
    setIsConnectingReal(true);
    setRealError(null);
    try {
      const address = realAddress.trim();
      const result = await connectToRealHost(address, realPin, "LumaLink Web", realSignalPort);
      const id = `real-${address}`;
      addDevice({
        id,
        name: result.hostName || address,
        platform: "windows",
        address,
        status: "online",
        specs: { gpu: "확인 안 됨", cpu: "확인 안 됨", ramGb: 0 },
        pairedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        isReal: true,
        signalPort: realSignalPort,
        pairingPin: realPin,
        macAddress: result.macAddress,
      });
      setRealGames(id, result.games);
      setRealPairedName(result.hostName || address);
    } catch (err) {
      setRealError(
        err instanceof RealHostAuthError || err instanceof Error
          ? err.message
          : "호스트에 연결하지 못했습니다."
      );
    } finally {
      setIsConnectingReal(false);
    }
  };

  const resetRealForm = () => {
    setRealAddress("");
    setRealSignalPort(SIGNALING_PORT);
    setRealPin("");
    setRealError(null);
    setRealPairedName("");
    setLanHosts(null);
  };

  const pairingService = useMemo(() => {
    const alreadyPairedIds = new Set(devices.map((d) => d.id));
    return new MockPairingService(
      mockDiscoverableDevices.filter((d) => !alreadyPairedIds.has(d.id))
    );
  }, [devices]);

  const [step, setStep] = useState<Step>("discover");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredDevice[] | null>(null);

  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [expectedPin, setExpectedPin] = useState<string | null>(null);
  const [enteredPin, setEnteredPin] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairedName, setPairedName] = useState("");

  const runDiscovery = async () => {
    setIsDiscovering(true);
    setDiscoverError(null);
    try {
      const results = await pairingService.discover();
      setDiscovered(results);
    } catch {
      setDiscoverError("네트워크 검색 중 오류가 발생했습니다.");
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSelectDevice = async (device: DiscoveredDevice) => {
    setSelectedDevice(device);
    setPairError(null);
    setEnteredPin("");
    setExpectedPin(null);
    setStep("pin");
    const pin = await pairingService.requestPin(device.id);
    setExpectedPin(pin);
  };

  const handleConfirmPin = async () => {
    if (!selectedDevice || !expectedPin) return;
    setIsPairing(true);
    setPairError(null);
    try {
      const device = await pairingService.confirmPairing(selectedDevice, enteredPin, expectedPin);
      addDevice(device);
      setPairedName(device.name);
      setStep("success");
    } catch (err) {
      setPairError(err instanceof Error ? err.message : "페어링에 실패했습니다.");
    } finally {
      setIsPairing(false);
    }
  };

  const resetToDiscover = () => {
    setStep("discover");
    setSelectedDevice(null);
    setExpectedPin(null);
    setEnteredPin("");
    setPairError(null);
    setDiscovered(null);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:py-10">
      <h1 className="text-2xl font-bold text-white">PC 페어링</h1>
      <p className="mt-1 text-sm text-slate-400">
        같은 네트워크에 있는 게이밍 PC를 검색하고 PIN으로 안전하게 연결하세요.
      </p>

      <div className="mt-5 inline-flex rounded-xl border border-base-700 bg-base-900 p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "demo"}
          onClick={() => setMode("demo")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === "demo" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          네트워크 검색 (데모)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "real"}
          onClick={() => setMode("real")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === "real" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          IP로 실제 PC 연결
        </button>
      </div>

      {mode === "real" ? (
        <Card className="mt-6 p-6">
          {!realPairedName ? (
            <div className="mx-auto max-w-sm">
              <h2 className="text-center text-sm font-medium text-slate-300">
                LumaLink Host 앱이 실행 중인 PC에 연결
              </h2>
              <p className="mt-1 text-center text-xs text-slate-500">
                호스트 PC에서 LumaLink Host 앱을 실행하면 IP 주소와 PIN이 표시됩니다. 두 기기가 같은
                LAN/Wi-Fi에 연결되어 있어야 합니다.
              </p>

              {lanSupported ? (
                <div className="mt-5 rounded-xl border border-base-700 bg-base-800/40 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-300">같은 Wi-Fi/LAN에서 자동 검색</p>
                    <Button size="sm" variant="secondary" isLoading={isDiscoveringLan} onClick={runLanDiscovery}>
                      검색
                    </Button>
                  </div>
                  {lanHosts && lanHosts.length === 0 && !isDiscoveringLan && (
                    <p className="mt-2 text-xs text-slate-500">
                      검색된 호스트가 없습니다. 호스트 PC에서 LumaLink Host 앱이 실행 중인지 확인하세요.
                    </p>
                  )}
                  {lanHosts && lanHosts.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {lanHosts.map((host) => (
                        <li key={host.address}>
                          <button
                            type="button"
                            onClick={() => handleSelectLanHost(host)}
                            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                              realAddress === host.address
                                ? "border-brand-500 bg-brand-500/10 text-slate-100"
                                : "border-base-600 text-slate-300 hover:border-brand-500/60"
                            }`}
                          >
                            <span className="font-medium">{host.name}</span>
                            <span className="text-xs text-slate-500">{host.address}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="mt-5 rounded-xl border border-base-700 bg-base-800/40 p-3 text-center text-[11px] text-slate-500">
                  자동 검색은 LumaLink Streaming 데스크톱 앱에서만 지원됩니다. 웹에서는 IP 주소를
                  직접 입력해주세요.
                </p>
              )}

              <div className="mt-5 space-y-4 text-left">
                <div>
                  <label htmlFor="real-address" className="mb-1.5 block text-sm text-slate-300">
                    호스트 IP 주소
                  </label>
                  <input
                    id="real-address"
                    value={realAddress}
                    onChange={(e) => setRealAddress(e.target.value)}
                    placeholder="예: 192.168.0.42"
                    className="w-full rounded-xl border border-base-600 bg-base-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label htmlFor="real-pin" className="mb-1.5 block text-sm text-slate-300">
                    PIN
                  </label>
                  <input
                    id="real-pin"
                    inputMode="numeric"
                    maxLength={4}
                    value={realPin}
                    onChange={(e) => setRealPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="0000"
                    className="w-full rounded-xl border border-base-600 bg-base-900 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-slate-100 focus:border-brand-500"
                    aria-describedby={realError ? "real-pin-error" : undefined}
                  />
                </div>

                {realError && (
                  <p id="real-pin-error" role="alert" className="text-sm text-danger-400">
                    {realError}
                  </p>
                )}

                <Button
                  className="w-full"
                  disabled={!realAddress.trim() || realPin.length !== 4}
                  isLoading={isConnectingReal}
                  onClick={handleConnectReal}
                >
                  연결
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-500/15 text-accent-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-7 w-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-100">
                {realPairedName} 연결 완료
              </h2>
              <p className="max-w-sm text-sm text-slate-400">
                실제 호스트 앱과 연결되었습니다. 라이브러리에서 Steam 게임 목록을 확인하고 바로
                스트리밍을 시작할 수 있어요.
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={resetRealForm}>
                  다른 PC 추가
                </Button>
                <Button onClick={() => navigate("/app/devices")}>내 PC 목록 보기</Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <>
      <ol className="mt-6 flex items-center gap-2" aria-label="페어링 진행 단계">
        {STEP_ORDER.map((s, i) => {
          const currentIndex = STEP_ORDER.findIndex((x) => x.key === step);
          const isDone = i < currentIndex;
          const isCurrent = s.key === step;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isDone
                    ? "bg-accent-500 text-base-950"
                    : isCurrent
                      ? "bg-brand-600 text-white"
                      : "bg-base-800 text-slate-500"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </span>
              <span className={`text-xs ${isCurrent ? "text-slate-100" : "text-slate-500"}`}>
                {s.label}
              </span>
              {i < STEP_ORDER.length - 1 && <span className="h-px flex-1 bg-base-700" />}
            </li>
          );
        })}
      </ol>

      <Card className="mt-6 p-6">
        {step === "discover" && (
          <div>
            {!discovered && !isDiscovering && !discoverError && (
              <EmptyState
                icon={<SearchIcon />}
                title="네트워크에서 PC 검색"
                description="LumaLink 호스트 에이전트가 실행 중인 PC를 찾습니다. 같은 Wi-Fi/LAN에 연결되어 있어야 합니다."
                action={<Button onClick={runDiscovery}>검색 시작</Button>}
              />
            )}

            {isDiscovering && (
              <div className="py-10">
                <Spinner label="네트워크를 검색하는 중..." />
              </div>
            )}

            {discoverError && (
              <ErrorState description={discoverError} onRetry={runDiscovery} />
            )}

            {discovered && discovered.length === 0 && !isDiscovering && (
              <EmptyState
                icon={<SearchIcon />}
                title="새로운 PC를 찾지 못했습니다"
                description="호스트 PC에서 LumaLink 에이전트가 실행 중인지, 같은 네트워크에 있는지 확인해주세요."
                action={
                  <Button variant="secondary" onClick={runDiscovery}>
                    다시 검색
                  </Button>
                }
              />
            )}

            {discovered && discovered.length > 0 && !isDiscovering && (
              <div>
                <h2 className="mb-3 text-sm font-medium text-slate-300">
                  검색된 PC ({discovered.length})
                </h2>
                <ul className="space-y-2">
                  {discovered.map((device) => (
                    <li key={device.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectDevice(device)}
                        className="flex w-full items-center justify-between rounded-xl border border-base-700 bg-base-800/60 px-4 py-3 text-left transition-colors hover:border-brand-500/60 hover:bg-base-800"
                      >
                        <span>
                          <span className="block text-sm font-medium text-slate-100">
                            {device.name}
                          </span>
                          <span className="block text-xs text-slate-500">{device.address}</span>
                        </span>
                        <Badge tone="brand">{device.platform}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
                <Button variant="ghost" size="sm" className="mt-3" onClick={runDiscovery}>
                  다시 검색
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "pin" && selectedDevice && (
          <div className="flex flex-col items-center gap-5 py-2 text-center">
            <p className="text-sm text-slate-400">
              <span className="font-semibold text-slate-100">{selectedDevice.name}</span>
              에 연결 중입니다
            </p>

            {!expectedPin ? (
              <Spinner label="PIN을 요청하는 중..." />
            ) : (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    호스트 PC 화면에 표시된 PIN (데모용으로 여기에 함께 표시됩니다)
                  </p>
                  <p className="mt-2 font-mono text-4xl font-bold tracking-[0.3em] text-brand-300">
                    {expectedPin}
                  </p>
                </div>

                <div className="w-full max-w-xs text-left">
                  <label htmlFor="pin-input" className="mb-1.5 block text-sm text-slate-300">
                    PIN 입력
                  </label>
                  <input
                    id="pin-input"
                    inputMode="numeric"
                    maxLength={4}
                    value={enteredPin}
                    onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="0000"
                    className="w-full rounded-xl border border-base-600 bg-base-900 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-slate-100 focus:border-brand-500"
                    aria-describedby={pairError ? "pin-error" : undefined}
                  />
                </div>

                {pairError && (
                  <p id="pin-error" role="alert" className="text-sm text-danger-400">
                    {pairError}
                  </p>
                )}

                <div className="flex w-full max-w-xs gap-2">
                  <Button variant="secondary" className="flex-1" onClick={resetToDiscover}>
                    취소
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={enteredPin.length !== 4}
                    isLoading={isPairing}
                    onClick={handleConfirmPin}
                  >
                    페어링 확인
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-500/15 text-accent-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-7 w-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-100">
              {pairedName} 페어링 완료
            </h2>
            <p className="max-w-sm text-sm text-slate-400">
              이제 이 PC의 게임 라이브러리를 불러와 바로 스트리밍을 시작할 수 있어요.
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" onClick={resetToDiscover}>
                다른 PC 추가
              </Button>
              <Button onClick={() => navigate("/app/devices")}>내 PC 목록 보기</Button>
            </div>
          </div>
        )}
      </Card>
        </>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="m20 20-3.5-3.5" />
    </svg>
  );
}
