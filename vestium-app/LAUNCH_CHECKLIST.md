# Launch Checklist

## 1) Pre-Deploy

- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] Latest branding/content changes pushed to `main`
- [ ] `.env.example` matches current required vars
- [ ] `README.md` and `DEPLOY.md` reflect current app behavior

## 2) Deploy Config

- [ ] Vercel project connected to correct repo/branch
- [ ] `VITE_ENABLE_STUDIO` set intentionally (`true` or `false`)
- [ ] Optional analytics vars set (if used)

## 3) Smoke Test (Live)

- [ ] `/` landing page works
- [ ] `/modules` works
- [ ] Open at least one module dashboard and lesson
- [ ] Complete one quiz interaction
- [ ] Run one simulator mission
- [ ] Refresh and confirm state persistence
- [ ] `/studio` availability matches env setting

## 4) Portfolio Readiness

- [ ] App description clearly states personal development/portfolio scope
- [ ] Disclaimer visible and accurate
- [ ] Repo About section updated (name, description, URL)
- [ ] Demo URL and repo URL ready for sharing

## 5) Go-Live Pack

- [ ] Public app URL
- [ ] GitHub repo URL
- [ ] Short product blurb
- [ ] 2-3 minute demo recording
- [ ] Social post draft with CTA
