# RCube Project Notes

This project is a Vite + TypeScript + Three.js web app that renders a polished, keyboard-first 3D 3x3 Rubik's Cube.

## What Was Built

- A full-screen Three.js scene with a 3x3 cube, lighting, shadows, floor/grid context, and responsive camera framing.
- Exact cubie state tracking in `src/rubiks.ts`, using discrete cubie coordinates plus animated layer groups so long move sequences remain stable.
- Keyboard controls for all standard face, slice, and whole-cube operations.
- A small HUD showing solved/mixed state, move count, current queue, and recent moves.
- Pointer drag orbit and wheel/keyboard zoom.
- A modal keyboard reference using Lucide icons.
- A Playwright browser smoke test that launches Google Chrome, drives keyboard input, checks cube state, samples WebGL pixels, and captures screenshots.

## Important Files

- `src/rubiks.ts`: cube model, move notation, animation queue, solved-state detection, scramble/reset/undo.
- `src/main.ts`: Three.js scene setup, UI wiring, keyboard input, responsive camera, test hooks on `window.rcube`.
- `src/style.css`: full-screen app styling and responsive HUD/tool controls.
- `scripts/smoke.mjs`: Chrome/Playwright verification script.
- `README.md`: user-facing run instructions and controls.
- `vite.config.ts`: Vite build config with chunk warning limit adjusted for Three.js bundle size.

## Controls

- `R L U D F B`: face turns.
- `M E S`: middle-slice turns.
  - `M`: middle slice between `L` and `R`, direction follows `L`.
  - `E`: equator slice between `U` and `D`, direction follows `D`.
  - `S`: standing slice between `F` and `B`, direction follows `F`.
- `X Y Z`: whole-cube rotations.
- `A`: runs `F' U F U'`.
- `;`: runs `R U' R' U`.
- `T`: runs `U' R U L' U' R' U L`.
- `Shift + move`: inverse turn.
- `2` then a move: half turn.
- Arrow keys: orbit view.
- `+` / `-`: zoom.
- `Space`: scramble.
- `Backspace`: undo.
- `0`: reset.

## Development Commands

```bash
npm install
npm run dev
npm run build
npm run test:browser
```

The dev server can be run at the default Vite URL, or explicitly:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

## Browser Verification

`npm run test:browser` starts a temporary Vite dev server on port `4175`, opens Google Chrome via Playwright, and verifies:

- Initial solved state.
- Face moves and their inverses.
- Slice moves and their inverses.
- Whole-cube rotations.
- Half turns.
- Scramble behavior.
- Undo behavior.
- Reset behavior.
- Notation queueing.
- Canvas is nonblank and visually varied.
- Desktop and mobile screenshots are generated in `artifacts/`.

`artifacts/` is ignored by git because these screenshots are generated test output.

## Notes for Future Agents

- Prefer preserving the discrete cubie-coordinate model in `src/rubiks.ts`; avoid accumulating floating-point rotations as source of truth.
- When adding controls, update both the help dialog in `src/main.ts` and the README/CLAUDE notes.
- Keep browser verification in Chrome/Playwright for any visual or interaction change.
- The app exposes `window.rcube` only as a test/debug hook for Playwright and manual console checks.
