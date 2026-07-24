import type { DiscoveredDevice, PcDevice } from "@/types/domain";

/**
 * Seed data for already-paired PCs, shown on first run.
 * In a real deployment this would come from persisted pairing
 * records + a live discovery/heartbeat service.
 */
export const seedPairedDevices: PcDevice[] = [
  {
    id: "pc-aurora",
    name: "AURORA-RIG",
    platform: "windows",
    address: "192.168.0.42",
    status: "online",
    specs: { gpu: "RTX 4080", cpu: "Ryzen 7 7800X3D", ramGb: 32 },
    pairedAt: "2026-06-02T09:12:00.000Z",
    lastSeenAt: new Date().toISOString(),
  },
  {
    id: "pc-nightfall",
    name: "NIGHTFALL-STUDIO",
    platform: "windows",
    address: "192.168.0.57",
    status: "sleeping",
    specs: { gpu: "RTX 3070", cpu: "Intel i7-12700K", ramGb: 16 },
    pairedAt: "2026-05-18T15:40:00.000Z",
    lastSeenAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
  },
];

/**
 * Devices "discovered" during the pairing flow. A real implementation
 * would replace this with mDNS/LAN broadcast discovery or a relay
 * lookup service.
 */
export const mockDiscoverableDevices: DiscoveredDevice[] = [
  {
    id: "pc-forge",
    name: "FORGE-DESKTOP",
    platform: "windows",
    address: "192.168.0.63",
  },
  {
    id: "pc-basecamp",
    name: "BASECAMP-MINI",
    platform: "linux",
    address: "192.168.0.71",
  },
];
