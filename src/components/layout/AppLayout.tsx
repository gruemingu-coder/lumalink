import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Logo } from "./Logo";

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen bg-base-950">
      <a
        href="#main-content"
        className="sr-only-focusable fixed left-3 top-3 z-50 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
      >
        본문으로 건너뛰기
      </a>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-base-800 md:block">
        <Sidebar />
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-base-800 bg-base-900/70 px-4 py-3 backdrop-blur-sm md:hidden">
          <Logo size="sm" />
          <button
            type="button"
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-base-700 text-slate-300 hover:bg-base-800"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </header>

        <main id="main-content" className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="메뉴 닫기"
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[80vw] bg-base-900 shadow-panel">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
