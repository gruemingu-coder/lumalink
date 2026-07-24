import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { LandingPage } from "@/pages/LandingPage";
import { DownloadPage } from "@/pages/DownloadPage";
import { DevicesPage } from "@/pages/DevicesPage";
import { PairingPage } from "@/pages/PairingPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { PlayerPage } from "@/pages/PlayerPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LoginPage } from "@/pages/LoginPage";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/state/AuthContext";
import { isDesktopApp } from "@/utils/platform";

export default function App() {
  // The public website (plain browser build) is intro/download only — the
  // interactive app only exists inside the LumaLink Streaming desktop app,
  // behind the account login gate in `DesktopApp` below. Demo/mock PCs and
  // the old browser-based "try it out" flow have been retired.
  if (!isDesktopApp()) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return <DesktopApp />;
}

function DesktopApp() {
  const { status } = useAuth();

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-950">
        <Spinner label="로그인 정보를 확인하는 중..." />
      </div>
    );
  }

  if (status === "needsLogin") {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Navigate to="devices" replace />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="pairing" element={<PairingPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/:deviceId" element={<LibraryPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/player/:deviceId/:gameId" element={<PlayerPage />} />
      <Route path="/download" element={<DownloadPage />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
