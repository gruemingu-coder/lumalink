import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "@/state/AppStateContext";
import { connectToRealHost, RealHostAuthError } from "@/services/pairing/realHostClient";
import {
  discoverHostsOnLan,
  isLanDiscoverySupported,
  type DiscoveredHost,
} from "@/services/pairing/discoverHosts";
import { SIGNALING_PORT } from "@/services/streaming/signalingProtocol";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function PairingPage() {
  const { addDevice, setRealGames } = useAppState();
  const navigate = useNavigate();

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
      const result = await connectToRealHost(address, realPin, "LumaLink", realSignalPort);
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:py-10">
      <h1 className="text-2xl font-bold text-white">PC 페어링</h1>
      <p className="mt-1 text-sm text-slate-400">
        LumaLink Host 앱이 실행 중인 PC의 IP 주소와 PIN으로 안전하게 연결하세요.
      </p>

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
    </div>
  );
}
