import type { Game, PcDevice } from "@/types/domain";
import { getGamesForDevice as getMockGamesForDevice } from "@/data/mockGames";

/**
 * Games shown for a device: real Steam games reported by the Host
 * App for real (`isReal: true`) devices, or the built-in mock
 * library for demo devices.
 */
export function resolveGamesForDevice(
  device: PcDevice | undefined,
  realGamesByDevice: Record<string, Game[]>
): Game[] {
  if (!device) return [];
  if (device.isReal) return realGamesByDevice[device.id] ?? [];
  return getMockGamesForDevice(device.id);
}
