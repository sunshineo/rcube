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
- `1`: flip colors of an edge piece in place
- `2`: right hand 4 moves combo
- `3`: left hand 4 moves combo
- `4`: move an edge piece to the right
- `5`: move an edge piece to the left
- `6`: create cross
- `7`: fix cross color matching
- `8`: fix corners color matching
- `Shift + move`: inverse turn
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
