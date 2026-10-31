// ─── Studio Layout ───────────────────────────────────────────────────────────
// Layout wrapper for /studio/* routes. Uses the shared Header (TopNav, auth,
// theme picker) — no more island layout.

import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../components/Header';

export function StudioLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-theme-base text-theme-text">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
