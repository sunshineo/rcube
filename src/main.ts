import './style.css'
import createIconElement from 'lucide/dist/esm/createElement.mjs'
import KeyboardIcon from 'lucide/dist/esm/icons/keyboard.mjs'
import RotateCcwIcon from 'lucide/dist/esm/icons/rotate-ccw.mjs'
import ShuffleIcon from 'lucide/dist/esm/icons/shuffle.mjs'
import Undo2Icon from 'lucide/dist/esm/icons/undo-2.mjs'
import CloseIcon from 'lucide/dist/esm/icons/x.mjs'
import * as THREE from 'three'
import { buildMove, RubiksCube, type CubeSnapshot, type MoveCommand } from './rubiks'

declare global {
  interface Window {
    rcube: {
      enqueue: (notation: string) => void
      reset: () => void
      sampleCanvasPixels: () => PixelSample
      scramble: () => void
      snapshot: () => CubeSnapshot
    }
  }
}

type PixelSample = {
  averageAlpha: number
  averageLuma: number
  distinctSamples: number
  samples: number[][]
}

const MOVE_CODE_MAP: Record<string, string> = {
  KeyB: 'B',
  KeyD: 'D',
  KeyE: 'E',
  KeyF: 'F',
  KeyL: 'L',
  KeyM: 'M',
  KeyR: 'R',
  KeyS: 'S',
  KeyU: 'U',
  KeyX: 'X',
  KeyY: 'Y',
  KeyZ: 'Z',
}

const ALGORITHM_CODE_MAP: Record<string, string> = {
  KeyA: "F' U F U'",
  KeyT: "U' R U L' U' R' U L",
  Semicolon: "R U' R' U",
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="app-shell">
    <canvas id="scene" aria-label="Interactive 3D Rubik's cube"></canvas>

    <header class="top-bar">
      <div class="brand" aria-label="RCube">
        <span class="brand-mark">RC</span>
        <span class="brand-name">RCube</span>
      </div>
      <div class="status-bar" aria-live="polite">
        <span id="state-pill" class="state-pill">Solved</span>
        <span id="move-count">0 turns</span>
      </div>
    </header>

    <nav class="tool-dock" aria-label="Cube actions">
      <button id="scramble-button" class="icon-button" type="button" aria-label="Scramble" title="Scramble">
        <span data-icon="shuffle"></span>
      </button>
      <button id="undo-button" class="icon-button" type="button" aria-label="Undo move" title="Undo move">
        <span data-icon="undo-2"></span>
      </button>
      <button id="reset-button" class="icon-button" type="button" aria-label="Reset" title="Reset">
        <span data-icon="rotate-ccw"></span>
      </button>
      <button id="help-button" class="icon-button" type="button" aria-label="Keyboard reference" title="Keyboard reference">
        <span data-icon="keyboard"></span>
      </button>
    </nav>

    <section class="move-panel" aria-live="polite">
      <div class="move-panel-label">Moves</div>
      <div id="move-strip" class="move-strip">Ready</div>
    </section>

    <dialog id="help-dialog" class="help-dialog">
      <form method="dialog">
        <div class="dialog-title-row">
          <h1>Keyboard</h1>
          <button class="icon-button compact" type="submit" aria-label="Close">
            <span data-icon="x"></span>
          </button>
        </div>
        <div class="key-grid">
          <span>R L U D F B</span><span>Face turns</span>
          <span>M E S</span><span>Slice turns</span>
          <span>X Y Z</span><span>Whole cube turns</span>
          <span>A</span><span>F' U F U'</span>
          <span>;</span><span>R U' R' U</span>
          <span>T</span><span>U' R U L' U' R' U L</span>
          <span>Shift + move</span><span>Inverse turn</span>
          <span>2 then move</span><span>Half turn</span>
          <span>Arrow keys</span><span>Orbit view</span>
          <span>+ / -</span><span>Zoom</span>
          <span>Space</span><span>Scramble</span>
          <span>Backspace</span><span>Undo</span>
          <span>0</span><span>Reset</span>
        </div>
      </form>
    </dialog>
  </main>
`

mountIcons()

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const statePill = document.querySelector<HTMLSpanElement>('#state-pill')!
const moveCount = document.querySelector<HTMLSpanElement>('#move-count')!
const moveStrip = document.querySelector<HTMLDivElement>('#move-strip')!
const helpDialog = document.querySelector<HTMLDialogElement>('#help-dialog')!

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  canvas,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
})
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
const clock = new THREE.Clock()
const cube = new RubiksCube()
const initialRadius = defaultCameraRadius()

const cameraState = {
  phi: 1.03,
  radius: initialRadius,
  targetPhi: 1.03,
  targetRadius: initialRadius,
  targetTheta: 0.72,
  theta: 0.72,
}

const keysDown = new Set<string>()
let doubleTurnArmed = false
let dragging = false
let hasResized = false
let userAdjustedZoom = false
let dragStartX = 0
let dragStartY = 0
let dragStartPhi = cameraState.targetPhi
let dragStartTheta = cameraState.targetTheta

scene.add(cube.root)
scene.add(new THREE.AmbientLight(0xffffff, 0.42))

const keyLight = new THREE.DirectionalLight(0xffffff, 2.9)
keyLight.position.set(4.8, 6.2, 5.8)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(2048, 2048)
keyLight.shadow.camera.near = 0.5
keyLight.shadow.camera.far = 16
scene.add(keyLight)

const fillLight = new THREE.DirectionalLight(0xffe2b8, 0.82)
fillLight.position.set(-5.5, 3.4, -4.2)
scene.add(fillLight)

const rimLight = new THREE.DirectionalLight(0xb8d7ff, 1.1)
rimLight.position.set(-2.8, 5.2, 5.4)
scene.add(rimLight)

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(5.2, 96),
  new THREE.MeshStandardMaterial({
    color: 0x24211f,
    metalness: 0,
    roughness: 0.74,
  }),
)
floor.name = 'shadow-floor'
floor.position.y = -2.12
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

const grid = new THREE.GridHelper(8, 16, 0x625b53, 0x3a3530)
grid.position.y = -2.1
grid.material.opacity = 0.24
grid.material.transparent = true
scene.add(grid)

cube.onChange(renderHud)

document.querySelector<HTMLButtonElement>('#scramble-button')!.addEventListener('click', () => cube.scramble())
document.querySelector<HTMLButtonElement>('#undo-button')!.addEventListener('click', () => cube.undo())
document.querySelector<HTMLButtonElement>('#reset-button')!.addEventListener('click', () => {
  doubleTurnArmed = false
  cube.reset()
})
document.querySelector<HTMLButtonElement>('#help-button')!.addEventListener('click', () => {
  helpDialog.showModal()
})

window.addEventListener('keydown', handleKeyDown)
window.addEventListener('keyup', (event) => keysDown.delete(event.code))
window.addEventListener('resize', resize)

canvas.addEventListener('pointerdown', (event) => {
  dragging = true
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragStartPhi = cameraState.targetPhi
  dragStartTheta = cameraState.targetTheta
  canvas.setPointerCapture(event.pointerId)
})

canvas.addEventListener('pointermove', (event) => {
  if (!dragging) {
    return
  }

  const deltaX = event.clientX - dragStartX
  const deltaY = event.clientY - dragStartY
  cameraState.targetTheta = dragStartTheta - deltaX * 0.008
  cameraState.targetPhi = clamp(dragStartPhi + deltaY * 0.006, 0.42, 2.15)
})

canvas.addEventListener('pointerup', (event) => {
  dragging = false
  canvas.releasePointerCapture(event.pointerId)
})

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    userAdjustedZoom = true
    cameraState.targetRadius = clamp(cameraState.targetRadius + event.deltaY * 0.006, 5.4, 18)
  },
  { passive: false },
)

window.rcube = {
  enqueue: (notation: string) => cube.enqueueNotation(notation),
  reset: () => {
    doubleTurnArmed = false
    cube.reset()
  },
  sampleCanvasPixels,
  scramble: () => cube.scramble(),
  snapshot: () => cube.snapshot(),
}

resize()
renderHud()
animate()

function handleKeyDown(event: KeyboardEvent): void {
  if (helpDialog.open && event.code !== 'Escape') {
    return
  }

  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || event.code === 'ArrowUp' || event.code === 'ArrowDown') {
    event.preventDefault()
    keysDown.add(event.code)
    return
  }

  if (event.code === 'Equal' || event.code === 'NumpadAdd') {
    event.preventDefault()
    userAdjustedZoom = true
    cameraState.targetRadius = clamp(cameraState.targetRadius - 0.65, 5.4, 18)
    return
  }

  if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
    event.preventDefault()
    userAdjustedZoom = true
    cameraState.targetRadius = clamp(cameraState.targetRadius + 0.65, 5.4, 18)
    return
  }

  if (event.code === 'Digit2' || event.code === 'Numpad2') {
    event.preventDefault()
    doubleTurnArmed = true
    renderHud()
    return
  }

  if (event.code === 'Space') {
    event.preventDefault()
    doubleTurnArmed = false
    cube.scramble()
    return
  }

  if (event.code === 'Backspace') {
    event.preventDefault()
    doubleTurnArmed = false
    cube.undo()
    return
  }

  if (event.code === 'Digit0' || event.code === 'Numpad0') {
    event.preventDefault()
    doubleTurnArmed = false
    cube.reset()
    return
  }

  if (event.code === 'KeyH' || (event.code === 'Slash' && event.shiftKey)) {
    event.preventDefault()
    helpDialog.showModal()
    return
  }

  if (event.repeat) {
    return
  }

  const algorithm = ALGORITHM_CODE_MAP[event.code]

  if (algorithm && !event.shiftKey && !event.metaKey && !event.altKey && !event.ctrlKey) {
    event.preventDefault()
    doubleTurnArmed = false
    cube.enqueueNotation(algorithm)
    return
  }

  const base = MOVE_CODE_MAP[event.code]

  if (!base) {
    return
  }

  event.preventDefault()

  const move = buildMove(base, {
    double: doubleTurnArmed,
    inverse: event.shiftKey,
    recordHistory: true,
  })

  doubleTurnArmed = false

  if (move) {
    enqueueMove(move)
  }
}

function enqueueMove(move: MoveCommand): void {
  cube.enqueue(move)
  renderHud()
}

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05)
  applyCameraKeys(delta)
  cube.update(delta)
  updateCamera()
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

function applyCameraKeys(delta: number): void {
  const orbitSpeed = delta * 2.35

  if (keysDown.has('ArrowLeft')) {
    cameraState.targetTheta += orbitSpeed
  }

  if (keysDown.has('ArrowRight')) {
    cameraState.targetTheta -= orbitSpeed
  }

  if (keysDown.has('ArrowUp')) {
    cameraState.targetPhi = clamp(cameraState.targetPhi - orbitSpeed * 0.72, 0.42, 2.15)
  }

  if (keysDown.has('ArrowDown')) {
    cameraState.targetPhi = clamp(cameraState.targetPhi + orbitSpeed * 0.72, 0.42, 2.15)
  }
}

function updateCamera(): void {
  cameraState.theta += (cameraState.targetTheta - cameraState.theta) * 0.12
  cameraState.phi += (cameraState.targetPhi - cameraState.phi) * 0.12
  cameraState.radius += (cameraState.targetRadius - cameraState.radius) * 0.12

  const sinPhi = Math.sin(cameraState.phi)
  camera.position.set(
    cameraState.radius * sinPhi * Math.sin(cameraState.theta),
    cameraState.radius * Math.cos(cameraState.phi),
    cameraState.radius * sinPhi * Math.cos(cameraState.theta),
  )
  camera.lookAt(0, 0, 0)
}

function resize(): void {
  const width = window.innerWidth
  const height = window.innerHeight
  const pixelRatio = Math.min(window.devicePixelRatio, 2)
  const fitRadius = defaultCameraRadius()

  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()

  if (!userAdjustedZoom || cameraState.targetRadius < fitRadius) {
    cameraState.targetRadius = fitRadius

    if (!hasResized) {
      cameraState.radius = fitRadius
    }
  }

  hasResized = true
}

function renderHud(): void {
  const snapshot = cube.snapshot()
  const status = snapshot.activeMove
    ? `Turning ${snapshot.activeMove}`
    : snapshot.queueLength > 0
      ? `${snapshot.queueLength} queued`
      : snapshot.isSolved
        ? 'Solved'
        : 'Mixed'

  statePill.textContent = status
  statePill.dataset.state = snapshot.isSolved ? 'solved' : 'mixed'
  moveCount.textContent = `${snapshot.moveCount} ${snapshot.moveCount === 1 ? 'turn' : 'turns'}`

  if (doubleTurnArmed) {
    moveStrip.textContent = '2x armed'
    moveStrip.dataset.mode = 'armed'
    return
  }

  moveStrip.dataset.mode = 'normal'
  moveStrip.textContent =
    snapshot.pendingMoves.length > 0
      ? snapshot.pendingMoves.join(' ')
      : snapshot.lastMoves.length > 0
        ? snapshot.lastMoves.join(' ')
        : 'Ready'
}

function sampleCanvasPixels(): PixelSample {
  renderer.render(scene, camera)

  const context = renderer.getContext()
  const width = canvas.width
  const height = canvas.height
  const points = [
    [0.3, 0.3],
    [0.5, 0.3],
    [0.7, 0.3],
    [0.35, 0.5],
    [0.5, 0.5],
    [0.65, 0.5],
    [0.3, 0.72],
    [0.5, 0.72],
    [0.7, 0.72],
  ]
  const pixel = new Uint8Array(4)
  const samples: number[][] = []

  for (const point of points) {
    context.readPixels(
      Math.floor(width * point[0]),
      Math.floor(height * (1 - point[1])),
      1,
      1,
      context.RGBA,
      context.UNSIGNED_BYTE,
      pixel,
    )
    samples.push(Array.from(pixel))
  }

  const lumas = samples.map(([red, green, blue]) => red * 0.2126 + green * 0.7152 + blue * 0.0722)
  const alphas = samples.map((sample) => sample[3])

  return {
    averageAlpha: average(alphas),
    averageLuma: average(lumas),
    distinctSamples: new Set(samples.map((sample) => sample.join(','))).size,
    samples,
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function mountIcons(): void {
  const icons = {
    keyboard: KeyboardIcon,
    'rotate-ccw': RotateCcwIcon,
    shuffle: ShuffleIcon,
    'undo-2': Undo2Icon,
    x: CloseIcon,
  }

  document.querySelectorAll<HTMLElement>('[data-icon]').forEach((host) => {
    const iconName = host.dataset.icon
    const icon = iconName ? icons[iconName as keyof typeof icons] : null

    if (!icon) {
      return
    }

    host.replaceChildren(createIconElement(icon, { 'aria-hidden': 'true' }))
  })
}

function defaultCameraRadius(): number {
  const width = window.innerWidth
  const aspect = window.innerWidth / window.innerHeight

  if (width <= 430) {
    return 14.2
  }

  if (width <= 680) {
    return 12.8
  }

  if (aspect < 1) {
    return 11.4
  }

  if (aspect < 1.35) {
    return 10.2
  }

  return 9.6
}
