# MMDI ONE — Product Design System

**Live demo: [ekms.vercel.app](https://ekms.vercel.app)**

Repo: [github.com/mahin-aeroai/EKMS](https://github.com/mahin-aeroai/EKMS)

The living component library behind MMDI ONE: 42 components implementing the MMDI ONE
Product Design System (tokens, layout, navigation, the universal Workspace pattern, and
the AI Interaction Model), built as a working style-guide app.

Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Switch themes (Light / Dark / Enterprise) from the top nav —
every screen re-renders live since nothing is hardcoded to a theme.

## What's here

- `src/app/globals.css` — the full design token set (color, typography, spacing, radius,
  elevation, motion) as CSS custom properties, mapped into Tailwind v4's `@theme inline`
  block so tokens generate real utility classes (`bg-primary`, `text-ink`, `shadow-2`, etc).
- `src/components/theme/` — the Light / Dark / Enterprise theme system (`ThemeProvider`,
  `ThemeSwitcher`), persisted to `localStorage`.
- `src/components/ui/` — all 42 components, one JSDoc block per component citing which
  Design System deliverable/section it implements.
- `src/components/AppShell.tsx` — the app shell (Top Nav, Sidebar, Command Palette,
  AI Assistant drawer) wrapping every route.
- `src/app/foundations` and `src/app/components/*` — the showcase pages demonstrating
  every component live, grouped the same way as the Design System document
  (Inputs & Actions, Cards, Data & Structure, Navigation, Collaboration, Feedback &
  Overlays, AI-Native, Document & Media Viewers, Layout Primitives).

## Verified

`npm run build` and `npm run lint` both pass clean (all 12 routes prerender as static
content, 0 lint errors).

## Deployment

Hosted on Vercel, auto-deploying from the `main` branch on every push. Production
deployment: `ekms.vercel.app`.

To deploy your own copy: import the repo at vercel.com → "Add New" → "Project" →
select the repo. No configuration needed — Next.js is auto-detected.

## Contributing

```bash
git clone https://github.com/mahin-aeroai/EKMS.git
cd EKMS
npm install
npm run dev
```

Push to `main` to trigger a redeploy, or open a PR for review first.
