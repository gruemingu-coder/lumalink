import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { LandingPage } from "@/pages/LandingPage";
import { DownloadPage } from "@/pages/DownloadPage";
import { DevicesPage } from "@/pages/DevicesPage";
import { PairingPage } from "@/pages/PairingPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { PlayerPage } from "@/pages/PlayerPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/download" element={<DownloadPage />} />

      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Navigate to="devices" replace />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="pairing" element={<PairingPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/:deviceId" element={<LibraryPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/player/:deviceId/:gameId" element={<PlayerPage />} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
