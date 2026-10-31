// ─── Router ───────────────────────────────────────────────────────────────────
// Top-level route structure: / (landing), /create/*, /learn/*, /audit/*
// Old routes (/studio, /modules, /reviewer, /director, /sops/*, /rams/*) redirect.

import { Suspense, lazy, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { CreateLayout } from './CreateLayout';
import { StudioLayout } from './StudioLayout';
import { RouteGuard } from '../components/RouteGuard';

// ─── Lazy page imports ────────────────────────────────────────────────────────

const StudioPage = lazy(() =>
  import('../features/studio/StudioPage').then((m) => ({ default: m.StudioPage }))
);
const DashboardPage = lazy(() =>
  import('../features/learning/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const LandingPage = lazy(() =>
  import('../features/learning/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const ModulesPage = lazy(() =>
  import('../features/learning/ModulesPage').then((m) => ({ default: m.ModulesPage }))
);
const StagePage = lazy(() =>
  import('../features/learning/StagePage').then((m) => ({ default: m.StagePage }))
);
const LessonPage = lazy(() =>
  import('../features/learning/LessonPage').then((m) => ({ default: m.LessonPage }))
);
const StageTestPage = lazy(() =>
  import('../features/learning/StageTestPage').then((m) => ({ default: m.StageTestPage }))
);
const SourcesPage = lazy(() =>
  import('../features/learning/SourcesPage').then((m) => ({ default: m.SourcesPage }))
);
const FieldReferencePage = lazy(() =>
  import('../features/learning/FieldReferencePage').then((m) => ({ default: m.FieldReferencePage }))
);
const PlacementAssessmentPage = lazy(() =>
  import('../features/learning/PlacementAssessmentPage').then((m) => ({
    default: m.PlacementAssessmentPage
  }))
);
const AdaptiveReviewPage = lazy(() =>
  import('../features/learning/AdaptiveReviewPage').then((m) => ({ default: m.AdaptiveReviewPage }))
);
const LadderBuilderPage = lazy(() =>
  import('../features/learning/LadderBuilderPage').then((m) => ({ default: m.LadderBuilderPage }))
);
const CapstoneChallengePage = lazy(() =>
  import('../features/learning/CapstoneChallengePage').then((m) => ({
    default: m.CapstoneChallengePage
  }))
);
const StageCertificatePage = lazy(() =>
  import('../features/learning/StageCertificatePage').then((m) => ({
    default: m.StageCertificatePage
  }))
);
const FaultCampaignPage = lazy(() =>
  import('../features/learning/FaultCampaignPage').then((m) => ({ default: m.FaultCampaignPage }))
);
const PidIntroPage = lazy(() =>
  import('../features/learning/PidIntroPage').then((m) => ({ default: m.PidIntroPage }))
);
const ReviewerPortalPage = lazy(() =>
  import('../features/review/ReviewerPortalPage').then((m) => ({ default: m.ReviewerPortalPage }))
);
const LearnerEntryPage = lazy(() =>
  import('../features/learning/LearnerEntryPage').then((m) => ({ default: m.LearnerEntryPage }))
);
const LearnerCompletePage = lazy(() =>
  import('../features/learning/LearnerCompletePage').then((m) => ({ default: m.LearnerCompletePage }))
);
const DutyHolderAssessmentPage = lazy(() =>
  import('../features/learning/DutyHolderAssessmentPage').then((m) => ({ default: m.DutyHolderAssessmentPage }))
);
const DirectorDashboardPage = lazy(() =>
  import('../features/learning/DirectorDashboardPage').then((m) => ({ default: m.DirectorDashboardPage }))
);
const SopViewerPage = lazy(() =>
  import('../features/sop/SopViewerPage').then((m) => ({ default: m.SopViewerPage }))
);
const SopReviewPage = lazy(() =>
  import('../features/sop/SopReviewPage').then((m) => ({ default: m.SopReviewPage }))
);
const RamsViewerPage = lazy(() =>
  import('../features/rams/RamsViewerPage').then((m) => ({ default: m.RamsViewerPage }))
);
const RamsReviewPage = lazy(() =>
  import('../features/rams/RamsReviewPage').then((m) => ({ default: m.RamsReviewPage }))
);
const OnboardingPage = lazy(() =>
  import('../features/onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage }))
);
const MembersPage = lazy(() =>
  import('../features/members/MembersPage').then((m) => ({ default: m.MembersPage }))
);
const EvidenceDashboardPage = lazy(() =>
  import('../features/dashboard/EvidenceDashboardPage').then((m) => ({ default: m.EvidenceDashboardPage }))
);

// ─── Studio pages ─────────────────────────────────────────────────────────────

const StudioLibraryPage = lazy(() =>
  import('../features/studio/StudioLibraryPage').then((m) => ({ default: m.StudioLibraryPage }))
);
const ModuleCreatePage = lazy(() =>
  import('../features/studio/ModuleCreatePage').then((m) => ({ default: m.ModuleCreatePage }))
);
const SopCreatePage = lazy(() =>
  import('../features/studio/SopCreatePage').then((m) => ({ default: m.SopCreatePage }))
);
const StudioRamsCreatePage = lazy(() =>
  import('../features/studio/RamsCreatePage').then((m) => ({ default: m.RamsCreatePage }))
);
const ModuleDetailPage = lazy(() =>
  import('../features/studio/ModuleDetailPage').then((m) => ({ default: m.ModuleDetailPage }))
);

// ─── Hub pages ────────────────────────────────────────────────────────────────

const LearnHubPage = lazy(() =>
  import('../features/learn/LearnHubPage').then((m) => ({ default: m.LearnHubPage }))
);
const AuditHubPage = lazy(() =>
  import('../features/audit/AuditHubPage').then((m) => ({ default: m.AuditHubPage }))
);
const CreateRamsPage = lazy(() =>
  import('../features/create/CreateRamsPage').then((m) => ({ default: m.CreateRamsPage }))
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const page = (element: ReactNode) => (
  <Suspense fallback={<div className="rounded border border-theme-border bg-theme-panel/60 p-4 text-sm text-theme-secondary">Loading…</div>}>
    {element}
  </Suspense>
);


// ─── Shared learning routes (reused under /learn/:themeId and root /:themeId) ─

const sharedLearningRoutes = [
  { path: 'dashboard', element: page(<DashboardPage />) },
  { path: 'stage/:stageId', element: page(<StagePage />) },
  { path: 'stage/:stageId/lesson/:lessonId', element: page(<LessonPage />) },
  { path: 'stage/:stageId/test', element: page(<StageTestPage />) },
  { path: 'stage/:stageId/certificate', element: page(<StageCertificatePage />) },
  { path: 'field-reference', element: page(<FieldReferencePage />) },
  { path: 'placement', element: page(<PlacementAssessmentPage />) },
  { path: 'review', element: page(<AdaptiveReviewPage />) },
  { path: 'builder', element: page(<LadderBuilderPage />) },
  { path: 'fault-campaign', element: page(<FaultCampaignPage />) },
  { path: 'pid-intro', element: page(<PidIntroPage />) },
  { path: 'capstone', element: page(<CapstoneChallengePage />) },
  { path: 'sources', element: page(<SourcesPage />) },
  { path: 'duty-holder', element: page(<DutyHolderAssessmentPage />) },
] as const;

// ─── Router ───────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // ── Landing ─────────────────────────────────────────────────────────────────
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: page(<LandingPage />) },
      ...sharedLearningRoutes,
    ],
  },

  // ── Studio ─────────────────────────────────────────────────────────────────
  {
    path: '/studio',
    element: <RouteGuard requires="canGenerate"><StudioLayout /></RouteGuard>,
    children: [
      { index: true, element: page(<StudioLibraryPage />) },
      // Creation routes
      { path: 'new/module', element: page(<ModuleCreatePage />) },
      { path: 'new/sop', element: page(<SopCreatePage />) },
      { path: 'new/rams', element: page(<StudioRamsCreatePage />) },
      // Detail routes
      { path: 'module/:id', element: page(<ModuleDetailPage />) },
      { path: 'sop/:id', element: page(<SopViewerPage />) },
      { path: 'rams/:id', element: page(<RamsViewerPage />) },
    ],
  },

  // ── Create (legacy — redirects to Studio) ──────────────────────────────────
  {
    path: '/create',
    element: <CreateLayout />,
    children: [
      { index: true, element: <Navigate to="/studio" replace /> },
      { path: 'modules', element: page(<ModulesPage />) },
      { path: 'rams', element: page(<CreateRamsPage />) },
      { path: 'reviewer', element: <Navigate to="/audit/reviewer" replace /> },
      { path: 'sops/:id', element: page(<SopViewerPage />) },
      { path: 'sops/:id/review', element: page(<SopReviewPage />) },
      { path: 'rams/:id', element: page(<RamsViewerPage />) },
      { path: 'rams/:id/review', element: page(<RamsReviewPage />) },
    ],
  },
  // Studio module creation — still uses StudioPage until ModuleCreatePage is built
  {
    path: '/create/module',
    element: (
      <Suspense fallback={<div className="p-8 text-sm text-theme-secondary">Loading Studio...</div>}>
        <StudioPage />
      </Suspense>
    ),
  },
  // SOP creation goes through Studio with sopMode pre-selected
  {
    path: '/create/sop',
    element: <Navigate to="/create/module?mode=sop" replace />,
  },

  // ── Learn ───────────────────────────────────────────────────────────────────
  {
    path: '/learn',
    element: <AppLayout />,
    children: [
      { index: true, element: page(<LearnHubPage />) },
      ...sharedLearningRoutes,
    ],
  },
  {
    path: '/learn/:moduleId',
    element: page(<LearnerEntryPage />),
  },
  {
    path: '/learn/:moduleId/complete',
    element: page(<LearnerCompletePage />),
  },
  // Theme-scoped learning routes (/:themeId/dashboard, /:themeId/stage/...)
  {
    path: '/:themeId',
    element: <AppLayout />,
    children: [
      { index: true, element: page(<DashboardPage />) },
      ...sharedLearningRoutes,
    ],
  },

  // ── Audit ───────────────────────────────────────────────────────────────────
  {
    path: '/audit',
    element: <CreateLayout />,
    children: [
      { index: true, element: page(<AuditHubPage />) },
      { path: 'director', element: page(<DirectorDashboardPage />) },
      { path: 'evidence', element: page(<EvidenceDashboardPage />) },
      { path: 'reviewer', element: page(<ReviewerPortalPage />) },
      { path: 'sops/:id/review', element: page(<SopReviewPage />) },
      { path: 'rams/:id/review', element: page(<RamsReviewPage />) },
    ],
  },

  // ── Admin ───────────────────────────────────────────────────────────────────
  {
    path: '/onboarding',
    element: page(<OnboardingPage />),
  },
  {
    path: '/members',
    element: <AppLayout />,
    children: [
      { index: true, element: page(<MembersPage />) },
    ],
  },

  // ── Legacy routes (old URLs still work) ──────────────────────────────────────
  { path: '/modules', element: <Navigate to="/create/modules" replace /> },
  { path: '/reviewer', element: <Navigate to="/audit/reviewer" replace /> },
  { path: '/director', element: <Navigate to="/audit/director" replace /> },
  // Parameterized routes can't use Navigate — render the same components directly
  { path: '/sops/:id/review', element: page(<SopReviewPage />) },
  { path: '/sops/:id', element: page(<SopViewerPage />) },
  { path: '/rams/:id/review', element: page(<RamsReviewPage />) },
  { path: '/rams/:id', element: page(<RamsViewerPage />) },
]);
