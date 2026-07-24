import type { Game, PcDevice } from "@/types/domain";
import { getGamesForDevice as getMockGamesForDevice } from "@/data/mockGames";
import { DESKTOP_MODE_GAME_ID } from "@/services/streaming/signalingProtocol";

/** Synthetic "그냥 원격 데스크탑" entry, prepended for every real device's library. */
export function desktopModeGame(deviceId: string): Game {
  return {
    id: DESKTOP_MODE_GAME_ID,
    title: "데스크탑 전체 화면 스트리밍",
    genre: [],
    coverGradient: "from-slate-700 via-slate-600 to-base-800",
    installedOnDeviceId: deviceId,
    lastPlayedAt: null,
    playtimeHours: 0,
    sizeGb: 0,
    isDesktopMode: true,
  };
}

/**
 * Games shown for a device: real Steam games reported by the Host
 * App for real (`isReal: true`) devices, or the built-in mock
 * library for demo devices. Real devices always get a synthetic
 * "desktop mode" entry first so a session can start without launching
 * any specific game.
 */
export function resolveGamesForDevice(
  device: PcDevice | undefined,
  realGamesByDevice: Record<string, Game[]>
): Game[] {
  if (!device) return [];
  if (device.isReal) {
    return [desktopModeGame(device.id), ...(realGamesByDevice[device.id] ?? [])];
  }
  return getMockGamesForDevice(device.id);
}
