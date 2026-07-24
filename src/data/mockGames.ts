import type { Game } from "@/types/domain";

/**
 * Mock game library keyed by host device id. Replace with a real
 * "installed apps" scan from the host agent in a production build.
 */
export const mockGamesByDevice: Record<string, Game[]> = {
  "pc-aurora": [
    {
      id: "g-starfall",
      title: "Starfall Vanguard",
      genre: ["action", "rpg"],
      coverGradient: "from-brand-600 via-brand-500 to-accent-400",
      installedOnDeviceId: "pc-aurora",
      lastPlayedAt: "2026-07-20T13:20:00.000Z",
      playtimeHours: 128,
      sizeGb: 74,
    },
    {
      id: "g-emberdrift",
      title: "Ember Drift",
      genre: ["racing"],
      coverGradient: "from-warn-500 via-danger-500 to-brand-600",
      installedOnDeviceId: "pc-aurora",
      lastPlayedAt: "2026-07-18T20:05:00.000Z",
      playtimeHours: 41,
      sizeGb: 38,
    },
    {
      id: "g-hollowmere",
      title: "Hollowmere",
      genre: ["adventure", "indie"],
      coverGradient: "from-emerald-600 via-accent-500 to-base-800",
      installedOnDeviceId: "pc-aurora",
      lastPlayedAt: null,
      playtimeHours: 0,
      sizeGb: 19,
    },
    {
      id: "g-ironline",
      title: "Ironline Tactics",
      genre: ["strategy"],
      coverGradient: "from-slate-600 via-base-600 to-brand-700",
      installedOnDeviceId: "pc-aurora",
      lastPlayedAt: "2026-06-30T11:00:00.000Z",
      playtimeHours: 63,
      sizeGb: 26,
    },
    {
      id: "g-fardock",
      title: "Fardock 9",
      genre: ["action", "indie"],
      coverGradient: "from-fuchsia-600 via-brand-500 to-base-800",
      installedOnDeviceId: "pc-aurora",
      lastPlayedAt: "2026-07-01T08:45:00.000Z",
      playtimeHours: 15,
      sizeGb: 12,
    },
    {
      id: "g-clutchleague",
      title: "Clutch League",
      genre: ["sports"],
      coverGradient: "from-sky-600 via-brand-500 to-accent-500",
      installedOnDeviceId: "pc-aurora",
      lastPlayedAt: "2026-07-15T19:30:00.000Z",
      playtimeHours: 87,
      sizeGb: 45,
    },
  ],
  "pc-nightfall": [
    {
      id: "g-quietsector",
      title: "Quiet Sector",
      genre: ["adventure"],
      coverGradient: "from-base-700 via-brand-700 to-base-900",
      installedOnDeviceId: "pc-nightfall",
      lastPlayedAt: "2026-07-10T22:10:00.000Z",
      playtimeHours: 22,
      sizeGb: 31,
    },
    {
      id: "g-scrapyard",
      title: "Scrapyard Kings",
      genre: ["strategy", "indie"],
      coverGradient: "from-warn-500 via-warn-400 to-base-800",
      installedOnDeviceId: "pc-nightfall",
      lastPlayedAt: null,
      playtimeHours: 0,
      sizeGb: 8,
    },
  ],
};

export function getGamesForDevice(deviceId: string): Game[] {
  return mockGamesByDevice[deviceId] ?? [];
}
