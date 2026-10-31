// ─── Create Layout ────────────────────────────────────────────────────────────
// Layout wrapper for /create/* routes. Header + content area, no theme/progress
// context assumptions (those are learning-specific).

import { Outlet } from 'react-router-dom';
import { Header } from '../components/Header';

export const CreateLayout = () => (
  <div className="min-h-screen bg-theme-base text-theme-text">
    <Header />
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Outlet />
    </main>
  </div>
);
