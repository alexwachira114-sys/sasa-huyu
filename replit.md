# Caxynexus-Ai / Freezy Trading Hub

A professional trading bot builder and copy trading dashboard powered by the Deriv ecosystem.

## Overview

- **Bot Builder**: Visual drag-and-drop strategy editor using Blockly
- **Copy Trading**: Dashboard to follow and replicate other traders
- **Live Charts**: Real-time charting via `@deriv/deriv-charts`
- **Auth**: Deriv OIDC/PKCE flow — tokens arrive via URL params, exchanged by the Express server

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, rsbuild (RSPack) |
| State | MobX + MobX React Lite |
| Styling | SCSS/Sass |
| Bot Engine | Blockly + `@deriv/js-interpreter` |
| API | `@deriv/deriv-api` (WebSocket) |
| Backend | Express (Node.js) — port 3001 |
| Storage | Supabase (copy trading tokens) |

## Running the project

Two workflows run in parallel:

| Workflow | Command | Port |
|---|---|---|
| Dev Server | `node --experimental-vm-modules node_modules/@rsbuild/core/bin/rsbuild.js dev` | 5000 |
| API Server | `npm run server` | 3001 |

Start both with the **Project** run button, or individually via the workflow list.

The frontend dev server (port 5000) proxies `/api/*` to the Express server on port 3001.

## Environment variables / Secrets

These are optional — the app runs without them but with reduced functionality:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Copy trading token storage |
| `SUPABASE_KEY` | Copy trading token storage |
| `GD_CLIENT_ID` | Google Drive bot save/load |
| `GD_API_KEY` | Google Drive bot save/load |
| `TRACKJS_TOKEN` | Error tracking |
| `DATADOG_APPLICATION_ID` | Analytics |
| `DATADOG_CLIENT_TOKEN` | Analytics |
| `RUDDERSTACK_KEY` | Analytics |
| `GROWTHBOOK_CLIENT_KEY` | Feature flags |

## Build for production

```bash
npm run build   # outputs to dist/
```

The deployment target is Cloudflare Pages (see `.replit` deploy config). For Replit deployment, `dist/` is served via `http-server`.

## Installing dependencies on Replit

The Replit package firewall blocks certain old tarball versions. To install cleanly:

```bash
npm install --legacy-peer-deps --omit=optional
npm install @rspack/binding-linux-x64-gnu   # Rspack native binding for Linux x64
```

The `package.json` overrides section pins `npm` and `npm-run-path` to newer versions to satisfy the firewall registry. A side effect: `lint-staged@10` pre-commit hooks may fail because `execa@4` (its dep) is incompatible with `npm-run-path@5` (ESM-only). This does not affect the dev server or build.

## Known shims

- `src/components/shims/quill-icons-illustration/` — stubs missing `.webp` assets in `@deriv/quill-icons`
- `src/components/shims/ui-submenu/` — patches a malformed import path in `@deriv-com/ui`
- `src/components/shims/object-fromentries/` — stubs broken `es-abstract` dependency chain

## Setup status

Project imported from GitHub and dependencies installed on 2026-07-09, then re-imported and re-installed on 2026-07-11 (plain `npm install` succeeded this time — no firewall issues hit). Both workflows (Dev Server, API Server) run cleanly and the UI verified working in preview (splash screen renders correctly; a couple of missing `siren.mp3`/`clang.mp3` sound assets 404 in the console but don't block the app). No secrets have been configured yet — all listed env vars are optional and the app runs with reduced functionality without them.

## User preferences

_No preferences recorded yet._
