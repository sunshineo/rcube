# RCube

A keyboard-first 3D Rubik's Cube built with Vite, TypeScript, and Three.js.

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Keyboard

- `R L U D F B`: face turns
- `M E S`: slice turns
- `X Y Z`: whole cube turns
- `A`: run `F' U F U'`
- `;`: run `R U' R' U`
- `T`: run `U' R U L' U' R' U L`
- `Shift + move`: inverse turn
- `2` then a move: half turn
- Arrow keys: orbit the view
- `+` / `-`: zoom
- `Space`: scramble
- `Backspace`: undo
- `0`: reset

## Browser Smoke Test

```bash
npm run test:browser
```

The test launches the Vite dev server, opens Google Chrome through Playwright, drives keyboard moves, checks cube state, and writes screenshots into `artifacts/`.
