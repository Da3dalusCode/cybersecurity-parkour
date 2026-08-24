# Ghostline: Cybersecurity Parkour

Ghostline is a self-contained neon parkour game built with React Three Fiber and Rapier. Sprint through a compromised security operations center, chain movement techniques, collect encrypted data packets, sync four route gates, and reach exfil for a final score and rank.

## Play locally

Requirements: Node.js 18+ and npm 9+.

```bash
cd app
npm install
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173/cybersecurity-parkour/`). Click **Jack In** or press **Enter** to start. Pointer lock provides mouse-look; keyboard-only play remains available when the browser does not support it.

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrow keys | Move |
| Mouse | Look |
| `Shift` | Sprint |
| `Space` | Jump; release early for a shorter jump |
| `Ctrl` or `C` | Slide while moving |
| `E` | Packet dash |
| `Esc` | Release the cursor / pause |

Low obstacles are vaulted automatically when approached with momentum. Cyan and magenta floor plates provide directional boosts.

## Highlights

- Authored five-stage route with vault blocks, ramps, staggered platforms, a raised firewall gauntlet, descent sequence, and exfil portal.
- Acceleration-based ground movement, air control, slope projection, coyote time, jump buffering, variable jump height, sliding, dashing, auto-vaulting, boost impulses, and fall respawns.
- Third-person procedural cyber-runner with state-driven limb animation, chase-camera collision, speed FOV, head bob, landing kick, and impact shake.
- Procedural neon SOC environment with instanced servers and cubicles, circuit traces, animated security sweeps, checkpoint gates, data shards, and a constrained lighting/shadow rig.
- Timed run state, sequential checkpoints, collectible scoring, combo multipliers, movement telemetry, finish ranks, responsive HUD, reduced-motion support, and opt-in voice comms.
- No downloaded models, textures, fonts, or media assets are required at runtime.

## Scripts

Run these from `app/`:

- `npm run dev` — start the Vite development server.
- `npm run build` — type-check and create the production build in `app/dist/`.
- `npm run preview` — serve the production build locally.

## Deployment

Pushes to `main` trigger the GitHub Pages workflow. Vite uses the `/cybersecurity-parkour/` base path, so the production URL is:

```text
https://da3daluscode.github.io/cybersecurity-parkour/
```
