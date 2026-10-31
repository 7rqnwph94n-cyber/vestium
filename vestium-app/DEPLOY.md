# Deployment Guide

## Recommended Path

Deploy as a static site on **Vercel**.

This app does not require a backend for standard learner usage.
Studio availability is controlled by `VITE_ENABLE_STUDIO`.

## Prerequisites

- GitHub repository up to date on `main`
- Vercel account connected to GitHub
- Local build passes:

```bash
npm install
npm run build
npm run test
```

## Vercel Deployment Steps

1. Go to `https://vercel.com`.
2. Create a new project and import this GitHub repo.
3. Confirm framework preset is **Vite**.
4. Keep defaults:
   - Build command: `npm run build`
   - Output directory: `dist`
5. Set environment variables in Project Settings:
   - `VITE_ENABLE_STUDIO=true` (enable Studio)
   - or `VITE_ENABLE_STUDIO=false` (learner-only launch)
   - Optional analytics:
     - `VITE_PLAUSIBLE_DOMAIN`
     - `VITE_PLAUSIBLE_SRC`
6. Deploy.
7. Validate the live URL with smoke tests below.

## Smoke Tests (Post-Deploy)

Check these routes:
- `/` loads landing page with disclaimer and 2-path navigation
- `/modules` loads module chooser
- one module dashboard loads: `/:themeId/dashboard`
- lesson + quiz completion works
- simulator mission flow works
- refresh preserves progress
- `/studio` behavior matches `VITE_ENABLE_STUDIO`

## Rollback

Vercel:
1. Open project -> **Deployments**
2. Select previous healthy deployment
3. Click **Promote to Production**

## Netlify (Alternative)

If using Netlify:
- Build command: `npm run build`
- Publish directory: `dist`
- Same env vars as Vercel
- SPA fallback already present via `public/_redirects` and `netlify.toml`

## Production Notes

- This is a personal development/portfolio project.
- Do not treat generated content as authoritative without review.
- Keep `main` deployable: run `npm run build` before each push.
