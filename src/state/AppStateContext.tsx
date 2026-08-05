import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Game, PcDevice, StreamSettings } from "@/types/domain";
import { DEFAULT_STREAM_SETTINGS } from "@/types/domain";
import type { RemoteGameSummary } from "@/services/streaming/signalingProtocol";
import { CLOUD_DEVICE_PREFIX } from "@/utils/cloudDevices";
import { loadFromStorage, saveToStorage } from "./storage";

interface AppState {
  devices: PcDevice[];
  settings: StreamSettings;
  realGamesByDevice: Record<string, Game[]>;
}

interface AppStateContextValue extends AppState {
  addDevice: (device: PcDevice) => void;
  removeDevice: (deviceId: string) => void;
  updateDeviceStatus: (deviceId: string, status: PcDevice["status"]) => void;
  renameDevice: (deviceId: string, name: string) => void;
  updateSettings: (patch: Partial<StreamSettings>) => void;
  resetSettings: () => void;
  getDevice: (deviceId: string) => PcDevice | undefined;
  /** Store the game list a real Host App reported for a device. */
  setRealGames: (deviceId: string, games: RemoteGameSummary[]) => void;
  /** Replaces the account's cloud-synced devices (see `utils/cloudDevices.ts`)
   * with a fresh snapshot, leaving manually-paired devices untouched. */
  syncCloudDevices: (cloudDevices: PcDevice[]) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

const DEVICES_KEY = "devices";
const SETTINGS_KEY = "settings";
const REAL_GAMES_KEY = "realGames";

const REAL_GAME_COVER_GRADIENTS = [
  "from-brand-600 via-brand-500 to-accent-400",
  "from-sky-600 via-brand-500 to-accent-500",
  "from-emerald-600 via-accent-500 to-base-800",
  "from-fuchsia-600 via-brand-500 to-base-800",
  "from-warn-500 via-danger-500 to-brand-600",
];

function toGame(summary: RemoteGameSummary, deviceId: string, index: number): Game {
  return {
    id: summary.id,
    title: summary.title,
    genre: [],
    coverGradient: REAL_GAME_COVER_GRADIENTS[index % REAL_GAME_COVER_GRADIENTS.length],
    installedOnDeviceId: deviceId,
    lastPlayedAt: null,
    playtimeHours: 0,
    sizeGb: 0,
  };
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  // No seeded/demo PCs — every device here was actually paired against a
  // real AlaveX Host App (or synced from the account's cloud device
  // list once logged in).
  const [devices, setDevices] = useState<PcDevice[]>(() => loadFromStorage(DEVICES_KEY, []));
  const [settings, setSettings] = useState<StreamSettings>(() =>
    loadFromStorage(SETTINGS_KEY, DEFAULT_STREAM_SETTINGS)
  );
  const [realGamesByDevice, setRealGamesByDevice] = useState<Record<string, Game[]>>(() =>
    loadFromStorage(REAL_GAMES_KEY, {})
  );

  useEffect(() => {
    saveToStorage(DEVICES_KEY, devices);
  }, [devices]);

  useEffect(() => {
    saveToStorage(SETTINGS_KEY, settings);
  }, [settings]);

  useEffect(() => {
    saveToStorage(REAL_GAMES_KEY, realGamesByDevice);
  }, [realGamesByDevice]);

  const addDevice = useCallback((device: PcDevice) => {
    setDevices((prev) => {
      const withoutExisting = prev.filter((d) => d.id !== device.id);
      return [...withoutExisting, device];
    });
  }, []);

  const removeDevice = useCallback((deviceId: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== deviceId));
  }, []);

  const updateDeviceStatus = useCallback(
    (deviceId: string, status: PcDevice["status"]) => {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId
            ? { ...d, status, lastSeenAt: new Date().toISOString() }
            : d
        )
      );
    },
    []
  );

  const renameDevice = useCallback((deviceId: string, name: string) => {
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, name } : d)));
  }, []);

  const updateSettings = useCallback((patch: Partial<StreamSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_STREAM_SETTINGS);
  }, []);

  const getDevice = useCallback(
    (deviceId: string) => devices.find((d) => d.id === deviceId),
    [devices]
  );

  const setRealGames = useCallback((deviceId: string, games: RemoteGameSummary[]) => {
    setRealGamesByDevice((prev) => ({
      ...prev,
      [deviceId]: games.map((g, i) => toGame(g, deviceId, i)),
    }));
  }, []);

  const syncCloudDevices = useCallback((cloudDevices: PcDevice[]) => {
    setDevices((prev) => [
      ...prev.filter((d) => !d.id.startsWith(CLOUD_DEVICE_PREFIX)),
      ...cloudDevices,
    ]);
  }, []);

  const value = useMemo<AppStateContextValue>(
    () => ({
      devices,
      settings,
      realGamesByDevice,
      addDevice,
      removeDevice,
      updateDeviceStatus,
      renameDevice,
      updateSettings,
      resetSettings,
      getDevice,
      setRealGames,
      syncCloudDevices,
    }),
    [
      devices,
      settings,
      realGamesByDevice,
      addDevice,
      removeDevice,
      updateDeviceStatus,
      renameDevice,
      updateSettings,
      resetSettings,
      getDevice,
      setRealGames,
      syncCloudDevices,
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState는 AppStateProvider 내부에서만 사용할 수 있습니다.");
  }
  return ctx;
}
