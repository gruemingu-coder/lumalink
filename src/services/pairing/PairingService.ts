import type { DiscoveredDevice, PcDevice } from "@/types/domain";

/**
 * Abstraction over "find PCs on the network and pair with one".
 * The mock implementation simulates network delay and a PIN exchange;
 * a production implementation would talk to an mDNS/LAN discovery
 * service and a real pairing handshake (e.g. TLS cert exchange).
 */
export interface PairingService {
  discover(): Promise<DiscoveredDevice[]>;
  /** Ask the (virtual) host to display a PIN the user must confirm. */
  requestPin(deviceId: string): Promise<string>;
  /** Complete pairing by confirming the PIN shown on the host. */
  confirmPairing(
    device: DiscoveredDevice,
    enteredPin: string,
    expectedPin: string
  ): Promise<PcDevice>;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export class MockPairingService implements PairingService {
  constructor(private readonly pool: DiscoveredDevice[]) {}

  async discover(): Promise<DiscoveredDevice[]> {
    await delay(1400);
    return this.pool;
  }

  async requestPin(_deviceId: string): Promise<string> {
    await delay(500);
    return randomPin();
  }

  async confirmPairing(
    device: DiscoveredDevice,
    enteredPin: string,
    expectedPin: string
  ): Promise<PcDevice> {
    await delay(900);
    if (enteredPin !== expectedPin) {
      throw new Error("PIN이 일치하지 않습니다. 호스트 PC 화면의 숫자를 다시 확인해주세요.");
    }
    return {
      id: device.id,
      name: device.name,
      platform: device.platform,
      address: device.address,
      status: "online",
      specs: { gpu: "알 수 없음", cpu: "알 수 없음", ramGb: 16 },
      pairedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
  }
}
