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

## Known shims

- `src/components/shims/quill-icons-illustration/` — stubs missing `.webp` assets in `@deriv/quill-icons`
- `src/components/shims/ui-submenu/` — patches a malformed import path in `@deriv-com/ui`
- `src/components/shims/object-fromentries/` — stubs broken `es-abstract` dependency chain

## User preferences

_No preferences recorded yet._
