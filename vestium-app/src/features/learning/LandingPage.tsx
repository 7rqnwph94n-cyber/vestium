import { Link } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react';

const EVIDENCE_CHAIN = [
  {
    step: 'Create',
    title: 'Generate governed content',
    body: 'Training modules, SOPs, and RAMS — each generated from your real workplace context with regulatory guardrails active throughout. You review findings, attest, and deploy.',
    tone: 'from-sky-500/25 to-transparent border-sky-500/40',
  },
  {
    step: 'Learn',
    title: 'Deliver to your workforce',
    body: 'Staged assessments, adaptive review, and competency evidence. Learners progress through deployed content with certificates issued on completion.',
    tone: 'from-amber-500/25 to-transparent border-amber-500/40',
  },
  {
    step: 'Audit',
    title: 'Evidence everything',
    body: 'Locked audit trail, SHA-256 certificate chain, and named reviewer sign-off. Every decision is timestamped and attributable — ready for HSE inspection.',
    tone: 'from-emerald-500/25 to-transparent border-emerald-500/40',
  },
] as const;

const SCHEMAS = [
  'MHSWR 1999', 'COSHH 2002', 'PUWER 1998', 'LOLER 1998',
  'Manual Handling 1992', 'DSE 1992', 'DSEAR 2002', 'CDM 2015',
  'Noise 2005', 'Vibration 2005', 'Electricity at Work 1989',
  'Confined Spaces 1997', 'Asbestos (CAW) 2012', 'Fire Safety 2005',
  'RIDDOR 2013', 'HSWA 1974 §2/§3',
] as const;

const ASSURANCE_PILLARS = [
  {
    title: 'Made for compliance teams',
    body: 'Designed for regulated operations that need defensible decisions and reliable training quality, not just completion metrics.',
  },
  {
    title: 'Audit records are locked',
    body: 'Audit entries are write-once records, protected against later editing or deletion.',
  },
  {
    title: 'Named reviewer sign-off',
    body: 'Release requires named reviewer sign-off, role accountability, and rationale after all findings are closed.',
  },
] as const;

export const LandingPage = () => {
  return (
    <div className="space-y-16 pb-20">
      <section className="relative overflow-hidden rounded-2xl border border-theme-border bg-theme-panel px-6 py-6 sm:px-10 sm:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(245,158,11,0.08),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.06),transparent_32%)] opacity-60" />
        <div className="relative grid gap-8 lg:grid-cols-[1.6fr,1fr] lg:items-start">
          <div>
            <img
              src="/assets/brand/vestium-pill.png"
              alt="Vestium"
              className="h-28 w-auto object-contain"
              loading="eager"
            />
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-theme-text sm:text-4xl lg:text-5xl">
              Not Artificial Intelligence.
              <span className="text-amber-300"> Auditable Intelligence.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-theme-secondary sm:text-base">
              Vestium helps teams create governed operational content — training modules, SOPs, and RAMS — faster without compromising governance.
              Everything is human-reviewed, signed off, and hash-locked, with timestamped traceability showing who approved what, when, and why.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5 text-[11px]">
              <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-3 py-1 text-amber-200">Reviewer sign-off workflow</span>
              <span className="rounded-full border border-sky-400/50 bg-sky-400/10 px-3 py-1 text-sky-200">Locked audit trail</span>
              <span className="rounded-full border border-emerald-400/50 bg-emerald-400/10 px-3 py-1 text-emerald-200">QR-verifiable certificates</span>
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <SignedOut>
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="rounded-lg border border-amber-300 bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-200"
                  >
                    Sign in
                  </button>
                </SignInButton>
                <a
                  href="mailto:rich@vestium.co.uk"
                  className="rounded-lg border border-theme-border bg-theme-panel px-5 py-2.5 text-sm font-semibold text-theme-text transition-colors hover:border-theme-border-subtle hover:text-theme-text"
                >
                  Request access
                </a>
              </SignedOut>
              <SignedIn>
                <Link
                  to="/learn"
                  className="rounded-lg border border-amber-300 bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-200"
                >
                  Learn
                </Link>
                <Link
                  to="/studio"
                  className="rounded-lg border border-theme-border bg-theme-panel px-5 py-2.5 text-sm font-semibold text-theme-text transition-colors hover:border-theme-border-subtle hover:text-theme-text"
                >
                  Studio
                </Link>
              </SignedIn>
            </div>
          </div>
          <div className="rounded-xl border border-theme-border bg-theme-base p-5 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-theme-secondary">Three workflows</p>
            <p className="mt-3 text-sm text-theme-text">Create &middot; Learn &middot; Audit</p>
            <p className="mt-2 text-xs leading-relaxed text-theme-secondary">
              Authors create and review. Learners complete. Auditors verify.
            </p>
            <div className="mt-4 space-y-2 text-xs text-theme-secondary">
              <p className="rounded border border-sky-700/40 bg-sky-900/10 px-3 py-2">Modules, SOPs, RAMS — governed from draft to deployment</p>
              <p className="rounded border border-amber-700/40 bg-amber-900/10 px-3 py-2">Staged learning with competency certificates</p>
              <p className="rounded border border-emerald-700/40 bg-emerald-900/10 px-3 py-2">Locked audit trail + SHA-256 certificate chain</p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-theme-muted">
          Why teams switch
        </p>
        <div className="rounded-xl border border-theme-border bg-theme-panel px-6 py-6">
          <p className="max-w-4xl text-base leading-relaxed text-theme-text sm:text-lg">
            Most platforms can generate learning content. Far fewer can clearly evidence who reviewed it, what changed, and what was ultimately released.
            <span className="text-amber-300"> Vestium makes that evidence trail part of the standard workflow.</span>
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-theme-muted">
          Evidence chain
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {EVIDENCE_CHAIN.map((item) => (
            <article
              key={item.step}
              className={`rounded-xl border bg-gradient-to-br shadow-theme ${item.tone} px-5 py-5 transition-colors hover:border-theme-border-subtle`}
            >
              <p className="text-xs font-semibold tracking-[0.2em] text-theme-secondary">{item.step}</p>
              <h3 className="mt-2 text-sm font-semibold text-theme-text">{item.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-theme-secondary">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-theme-muted">
          Assurance design
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {ASSURANCE_PILLARS.map((item) => (
            <article key={item.title} className="rounded-xl border border-theme-border bg-theme-panel px-5 py-5">
              <h3 className="text-sm font-semibold text-theme-text">{item.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-theme-secondary">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-theme-muted">
          Regulatory coverage
        </p>
        <div className="rounded-xl border border-theme-border bg-theme-panel px-5 py-5">
          <p className="mb-3 text-xs text-theme-secondary">
            Classification runs across applicable schemas so generated content maps to workplace obligations, not generic topic templates.
          </p>
          <div className="flex flex-wrap gap-2">
            {SCHEMAS.map((schema) => (
              <span
                key={schema}
                className="rounded-md border border-theme-border bg-theme-surface px-2.5 py-1 text-xs font-medium text-theme-secondary"
              >
                {schema}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Signed-in quick access ────────────────────────────────────────── */}
      <SignedIn>
        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-theme-muted">
            Quick access
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link
              to="/studio"
              className="block rounded-xl border border-theme-border bg-theme-panel px-5 py-5 transition-colors hover:border-theme-border-subtle hover:bg-theme-surface"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-400">Studio</p>
              <p className="mt-1 text-sm text-theme-text">Generate modules, SOPs, RAMS — review and deploy</p>
            </Link>
            <Link
              to="/learn"
              className="block rounded-xl border border-theme-border bg-theme-panel px-5 py-5 transition-colors hover:border-theme-border-subtle hover:bg-theme-surface"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Learn</p>
              <p className="mt-1 text-sm text-theme-text">Assigned modules, progress, and certificates</p>
            </Link>
            <Link
              to="/audit"
              className="block rounded-xl border border-theme-border bg-theme-panel px-5 py-5 transition-colors hover:border-theme-border-subtle hover:bg-theme-surface"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Audit</p>
              <p className="mt-1 text-sm text-theme-text">Governance oversight, certificate ledger, evidence</p>
            </Link>
          </div>
        </section>
      </SignedIn>

      {/* ── Footer note ───────────────────────────────────────────────────── */}
      <footer className="border-t border-theme-border-subtle pt-6 text-center">
        <p className="text-xs text-theme-muted">
          Vestium — UK Health &amp; Safety training workflow for controlled generation, qualified review, and auditable release.
        </p>
      </footer>
    </div>
  );
};
