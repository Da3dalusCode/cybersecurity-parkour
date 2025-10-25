# Cybersecurity Parkour App

This repository contains a Vite + React + TypeScript prototype located in [`app/`](app/).

## Prerequisites

- Node.js 18+
- npm 9+

## Getting started

```bash
cd app
npm install
npm run dev
```

The development server listens on [http://localhost:5173](http://localhost:5173) by default and serves a blank React Three Fiber scene with ambient and directional lighting plus an instruction overlay.

## Project scripts

All commands should be executed from the [`app/`](app/) directory:

- `npm run dev` – Start the local development server.
- `npm run build` – Type-check the project and generate the production build into `dist/`.
- `npm run preview` – Preview the production build locally after running the build step.

## GitHub Pages deployment

Merges to the `main` branch trigger a GitHub Actions workflow that builds the Vite project and publishes the resulting static site to the `gh-pages` branch. Once configured in the repository settings, the site is available at:

```
https://<github-username>.github.io/cybersecurity-parkour/
```

Because the build is served from a sub-path on GitHub Pages, the Vite base path is set to `/cybersecurity-parkour/` to ensure all assets load correctly when visiting the published site.
