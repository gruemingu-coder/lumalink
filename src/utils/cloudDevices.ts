import type { CloudDevice } from "@/services/account/authClient";
import type { PcDevice } from "@/types/domain";

/** Cloud-synced devices are namespaced so they never collide with a
 * manually-paired ("real-<address>") entry for the same PC, and so a
 * fresh sync can cleanly replace the previous cloud snapshot. */
export const CLOUD_DEVICE_PREFIX = "cloud-";

const HEARTBEAT_STALE_MS = 90_000; // Host app heartbeats every ~30s.

function statusFromLastSeen(lastSeenAt: string): PcDevice["status"] {
  const age = Date.now() - new Date(lastSeenAt).getTime();
  if (Number.isNaN(age)) return "offline";
  return age < HEARTBEAT_STALE_MS ? "online" : "offline";
}

export function cloudDeviceToPcDevice(device: CloudDevice): PcDevice {
  return {
    id: `${CLOUD_DEVICE_PREFIX}${device.id}`,
    name: device.name,
    platform: "windows",
    address: device.lastIp ?? "",
    status: statusFromLastSeen(device.lastSeenAt),
    specs: { gpu: "확인 안 됨", cpu: "확인 안 됨", ramGb: 0 },
    pairedAt: device.lastSeenAt,
    lastSeenAt: device.lastSeenAt,
    isReal: true,
    signalPort: device.signalPort,
    pairingPin: device.pairingPin ?? undefined,
    macAddress: device.macAddress,
  };
}
