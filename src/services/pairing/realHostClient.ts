import {
  SIGNALING_PORT,
  decodeSignalingMessage,
  encodeSignalingMessage,
  type RemoteGameSummary,
} from "@/services/streaming/signalingProtocol";

export interface RealHostHandshakeResult {
  hostName: string;
  games: RemoteGameSummary[];
}

export class RealHostAuthError extends Error {}

/**
 * One-shot handshake used by the pairing flow (and by the library
 * page, to refresh a real host's game list): opens a WebSocket to the
 * Host App's signaling relay, authenticates with the PIN shown in the
 * Host App window, waits briefly for the host's game list, then
 * closes the socket again. The actual streaming connection is a
 * separate, longer-lived `WebRtcStreamingEngine` instance created
 * only when the user presses "스트리밍 시작".
 */
export function connectToRealHost(
  address: string,
  pin: string,
  clientName: string,
  signalPort: number = SIGNALING_PORT,
  timeoutMs = 6000
): Promise<RealHostHandshakeResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let games: RemoteGameSummary[] = [];
    let ws: WebSocket;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };

    try {
      ws = new WebSocket(`ws://${address}:${signalPort}/signal?role=client&pin=${encodeURIComponent(pin)}`);
    } catch {
      reject(new RealHostAuthError("호스트 주소 형식이 올바르지 않습니다."));
      return;
    }

    const timer = window.setTimeout(() => {
      finish(() => {
        ws.close();
        reject(
          new RealHostAuthError(
            "응답 시간이 초과되었습니다. 호스트 앱이 실행 중인지, 같은 네트워크인지 확인해주세요."
          )
        );
      });
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(encodeSignalingMessage({ type: "auth", pin, clientName }));
    };

    ws.onmessage = (event) => {
      const msg = decodeSignalingMessage(String(event.data));
      if (!msg) return;

      if (msg.type === "auth-fail") {
        finish(() => {
          ws.close();
          reject(new RealHostAuthError(msg.reason || "PIN이 올바르지 않습니다."));
        });
        return;
      }

      if (msg.type === "games") {
        games = msg.games;
        return;
      }

      if (msg.type === "auth-ok") {
        const hostName = msg.hostName;
        // Give the host a brief window to also send its "games" message
        // (sent right after auth-ok) before we resolve and close.
        window.setTimeout(() => {
          finish(() => {
            ws.close();
            resolve({ hostName, games });
          });
        }, 500);
      }
    };

    ws.onerror = () => {
      finish(() => reject(new RealHostAuthError("네트워크 오류로 호스트에 연결하지 못했습니다.")));
    };

    ws.onclose = () => {
      finish(() => reject(new RealHostAuthError("연결이 종료되었습니다.")));
    };
  });
}
