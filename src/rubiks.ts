import * as THREE from 'three'

export type Axis = 'x' | 'y' | 'z'

type Layer = -1 | 0 | 1 | null
type TurnAmount = -1 | 1 | 2
type MoveBase = 'R' | 'L' | 'U' | 'D' | 'F' | 'B' | 'M' | 'E' | 'S' | 'X' | 'Y' | 'Z'

type Coord = {
  x: number
  y: number
  z: number
}

type MoveDefinition = {
  axis: Axis
  layer: Layer
  turns: -1 | 1
}

export type MoveCommand = {
  axis: Axis
  base: MoveBase
  countsAsMove: boolean
  layer: Layer
  notation: string
  recordHistory: boolean
  turns: number
  userTurns: TurnAmount
  visibleInMoveList: boolean
}

export type CubeSnapshot = {
  activeMove: string | null
  isSolved: boolean
  lastMoves: string[]
  moveCount: number
  pendingMoves: string[]
  queueLength: number
  visibleActiveMove: string | null
}

type StickerInfo = {
  color: string
  normal: Coord
}

type Cubie = {
  home: Coord
  object: THREE.Group
  coord: Coord
  stickers: StickerInfo[]
}

type ActiveTurn = {
  command: MoveCommand
  cubies: Cubie[]
  duration: number
  elapsed: number
  group: THREE.Group
  targetAngle: number
}

const CUBIE_SIZE = 0.94
const CUBIE_SPACING = 1.08
const STICKER_OFFSET = CUBIE_SIZE / 2 + 0.012

const MOVE_DEFINITIONS: Record<MoveBase, MoveDefinition> = {
  R: { axis: 'x', layer: 1, turns: -1 },
  L: { axis: 'x', layer: -1, turns: 1 },
  U: { axis: 'y', layer: 1, turns: 1 },
  D: { axis: 'y', layer: -1, turns: -1 },
  F: { axis: 'z', layer: 1, turns: -1 },
  B: { axis: 'z', layer: -1, turns: 1 },
  M: { axis: 'x', layer: 0, turns: 1 },
  E: { axis: 'y', layer: 0, turns: -1 },
  S: { axis: 'z', layer: 0, turns: -1 },
  X: { axis: 'x', layer: null, turns: -1 },
  Y: { axis: 'y', layer: null, turns: 1 },
  Z: { axis: 'z', layer: null, turns: -1 },
}

const FACE_SPECS = [
  { axis: 'x' as const, sign: 1, color: 'red', hex: 0xd9342b },
  { axis: 'x' as const, sign: -1, color: 'orange', hex: 0xf28a21 },
  { axis: 'y' as const, sign: 1, color: 'white', hex: 0xf5f1df },
  { axis: 'y' as const, sign: -1, color: 'yellow', hex: 0xf2c438 },
  { axis: 'z' as const, sign: 1, color: 'green', hex: 0x1fa05c },
  { axis: 'z' as const, sign: -1, color: 'blue', hex: 0x2459c7 },
]

const SCRAMBLE_BASES: MoveBase[] = ['R', 'L', 'U', 'D', 'F', 'B']
const WHOLE_CUBE_BASES = new Set<MoveBase>(['X', 'Y', 'Z'])
const TEMP_VECTOR = new THREE.Vector3()

export function buildMove(
  baseInput: string,
  options: {
    countsAsMove?: boolean
    inverse?: boolean
    recordHistory?: boolean
    userTurns?: TurnAmount
    visibleInMoveList?: boolean
  } = {},
): MoveCommand | null {
  const base = baseInput.toUpperCase() as MoveBase
  const definition = MOVE_DEFINITIONS[base]

  if (!definition) {
    return null
  }

  const userTurns = options.userTurns ?? (options.inverse ? -1 : 1)
  const turns = definition.turns * userTurns

  return {
    axis: definition.axis,
    base,
    countsAsMove: options.countsAsMove ?? !WHOLE_CUBE_BASES.has(base),
    layer: definition.layer,
    notation: notationFor(base, userTurns),
    recordHistory: options.recordHistory ?? true,
    turns,
    userTurns,
    visibleInMoveList: options.visibleInMoveList ?? true,
  }
}

export function moveFromNotation(token: string, recordHistory = true): MoveCommand | null {
  const trimmed = token.trim()

  if (!trimmed) {
    return null
  }

  const base = trimmed[0]
  const suffix = trimmed.slice(1)
  let userTurns: TurnAmount = 1

  if (suffix === "'") {
    userTurns = -1
  } else if (suffix === '2') {
    userTurns = 2
  } else if (suffix !== '') {
    return null
  }

  return buildMove(base, { recordHistory, userTurns })
}

export function inverseMove(command: MoveCommand, recordHistory = false): MoveCommand {
  const userTurns: TurnAmount = command.userTurns === 2 ? 2 : command.userTurns === 1 ? -1 : 1
  const inverted = buildMove(command.base, {
    countsAsMove: command.countsAsMove,
    recordHistory,
    userTurns,
    visibleInMoveList: command.visibleInMoveList,
  })

  if (!inverted) {
    throw new Error(`Unable to invert move ${command.notation}`)
  }

  return inverted
}

export class RubiksCube {
  readonly root = new THREE.Group()

  private readonly cubies: Cubie[] = []
  private readonly history: MoveCommand[] = []
  private readonly listeners = new Set<() => void>()
  private activeTurn: ActiveTurn | null = null
  private queue: MoveCommand[] = []

  constructor() {
    this.root.name = 'RubiksCube'
    this.createCubies()
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  enqueue(command: MoveCommand): void {
    this.queue.push(command)
    this.emitChange()
  }

  enqueueNotation(sequence: string, recordHistory = true): void {
    const moves = sequence
      .split(/\s+/)
      .map((token) => moveFromNotation(token, recordHistory))
      .filter((move): move is MoveCommand => move !== null)

    this.queue.push(...moves)
    this.emitChange()
  }

  scramble(length = 25): void {
    this.reset()

    let lastAxis: Axis | null = null
    const moves: MoveCommand[] = []

    for (let index = 0; index < length; index += 1) {
      const available = SCRAMBLE_BASES.filter((base) => MOVE_DEFINITIONS[base].axis !== lastAxis)
      const base = available[Math.floor(Math.random() * available.length)]
      const amountRoll = Math.random()
      const userTurns: TurnAmount = amountRoll < 0.36 ? 1 : amountRoll < 0.72 ? -1 : 2
      const move = buildMove(base, {
        countsAsMove: false,
        recordHistory: false,
        userTurns,
        visibleInMoveList: false,
      })

      if (move) {
        moves.push(move)
        lastAxis = move.axis
      }
    }

    this.queue.push(...moves)
    this.emitChange()
  }

  reset(): void {
    this.cancelActiveTurn()
    this.queue = []
    this.history.length = 0

    for (const cubie of this.cubies) {
      this.root.attach(cubie.object)
      cubie.coord = cloneCoord(cubie.home)
      cubie.object.position.set(
        cubie.coord.x * CUBIE_SPACING,
        cubie.coord.y * CUBIE_SPACING,
        cubie.coord.z * CUBIE_SPACING,
      )
      cubie.object.quaternion.identity()
      cubie.object.updateMatrixWorld(true)
    }

    this.emitChange()
  }

  undo(): void {
    if (this.queue.length > 0) {
      this.queue.pop()
      this.emitChange()
      return
    }

    if (this.activeTurn) {
      return
    }

    const previous = this.history.pop()

    if (previous) {
      this.queue.push(inverseMove(previous, false))
      this.emitChange()
    }
  }

  update(deltaSeconds: number): void {
    if (!this.activeTurn) {
      this.startNextTurn()
    }

    const active = this.activeTurn

    if (!active) {
      return
    }

    active.elapsed += deltaSeconds
    const progress = Math.min(active.elapsed / active.duration, 1)
    const eased = easeInOutCubic(progress)
    active.group.rotation[active.command.axis] = active.targetAngle * eased

    if (progress >= 1) {
      this.finishActiveTurn()
      this.startNextTurn()
    }
  }

  snapshot(): CubeSnapshot {
    const activeMove = this.activeTurn?.command.notation ?? null
    const visibleActiveMove = this.activeTurn?.command.visibleInMoveList ? activeMove : null
    const pendingMoves = [
      ...(visibleActiveMove ? [visibleActiveMove] : []),
      ...this.queue
        .filter((move) => move.visibleInMoveList)
        .slice(0, 8)
        .map((move) => move.notation),
    ]

    return {
      activeMove,
      isSolved: this.isSolved(),
      lastMoves: this.history.slice(-14).map((move) => move.notation),
      moveCount: this.history.filter((move) => move.countsAsMove).length,
      pendingMoves,
      queueLength: this.queue.length,
      visibleActiveMove,
    }
  }

  isSolved(): boolean {
    const faces = new Map<string, string[]>()

    for (const cubie of this.cubies) {
      for (const sticker of cubie.stickers) {
        const outward = rotatedUnitVector(sticker.normal, cubie.object.quaternion)

        if (!outward) {
          return false
        }

        const coordValue = cubie.coord[outward.axis]

        if (coordValue !== outward.sign) {
          return false
        }

        const key = `${outward.axis}:${outward.sign}`
        const colors = faces.get(key) ?? []
        colors.push(sticker.color)
        faces.set(key, colors)
      }
    }

    if (faces.size !== 6) {
      return false
    }

    for (const colors of faces.values()) {
      if (colors.length !== 9 || new Set(colors).size !== 1) {
        return false
      }
    }

    return true
  }

  private createCubies(): void {
    const bodyGeometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE)
    const stickerGeometry = createRoundedStickerGeometry(0.74, 0.11)
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.05,
      roughness: 0.58,
    })
    const stickerMaterials = new Map(
      FACE_SPECS.map((face) => [
        face.color,
        new THREE.MeshStandardMaterial({
          color: face.hex,
          metalness: 0,
          roughness: 0.46,
        }),
      ]),
    )

    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (let z = -1; z <= 1; z += 1) {
          const coord = { x, y, z }
          const cubieGroup = new THREE.Group()
          const stickers: StickerInfo[] = []

          cubieGroup.name = `cubie-${x}-${y}-${z}`
          cubieGroup.position.set(x * CUBIE_SPACING, y * CUBIE_SPACING, z * CUBIE_SPACING)

          const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
          body.castShadow = true
          body.receiveShadow = true
          cubieGroup.add(body)

          for (const face of FACE_SPECS) {
            if (coord[face.axis] !== face.sign) {
              continue
            }

            const material = stickerMaterials.get(face.color)

            if (!material) {
              continue
            }

            const normal = normalFor(face.axis, face.sign)
            const sticker = new THREE.Mesh(stickerGeometry, material)
            sticker.name = `${face.color}-sticker`
            sticker.position.set(
              normal.x * STICKER_OFFSET,
              normal.y * STICKER_OFFSET,
              normal.z * STICKER_OFFSET,
            )
            orientSticker(sticker, face.axis, face.sign)
            sticker.receiveShadow = true
            cubieGroup.add(sticker)
            stickers.push({ color: face.color, normal })
          }

          this.root.add(cubieGroup)
          this.cubies.push({
            coord: cloneCoord(coord),
            home: cloneCoord(coord),
            object: cubieGroup,
            stickers,
          })
        }
      }
    }
  }

  private startNextTurn(): void {
    if (this.activeTurn || this.queue.length === 0) {
      return
    }

    const command = this.queue.shift()

    if (!command) {
      return
    }

    const group = new THREE.Group()
    const selectedCubies = this.cubies.filter(
      (cubie) => command.layer === null || cubie.coord[command.axis] === command.layer,
    )

    group.name = `turn-${command.notation}`
    this.root.add(group)
    this.root.updateMatrixWorld(true)

    for (const cubie of selectedCubies) {
      group.attach(cubie.object)
    }

    this.activeTurn = {
      command,
      cubies: selectedCubies,
      duration: Math.abs(command.turns) === 2 ? 0.24 : 0.18,
      elapsed: 0,
      group,
      targetAngle: command.turns * (Math.PI / 2),
    }

    this.emitChange()
  }

  private finishActiveTurn(): void {
    const active = this.activeTurn

    if (!active) {
      return
    }

    active.group.rotation[active.command.axis] = active.targetAngle
    active.group.updateMatrixWorld(true)

    for (const cubie of active.cubies) {
      this.root.attach(cubie.object)
      cubie.coord = rotateCoord(cubie.coord, active.command.axis, active.command.turns)
      cubie.object.position.set(
        cubie.coord.x * CUBIE_SPACING,
        cubie.coord.y * CUBIE_SPACING,
        cubie.coord.z * CUBIE_SPACING,
      )
      snapQuaternion(cubie.object.quaternion)
      cubie.object.updateMatrixWorld(true)
    }

    this.root.remove(active.group)

    if (active.command.recordHistory) {
      this.history.push(active.command)
    }

    this.activeTurn = null
    this.emitChange()
  }

  private cancelActiveTurn(): void {
    if (!this.activeTurn) {
      return
    }

    for (const cubie of this.activeTurn.cubies) {
      this.root.attach(cubie.object)
    }

    this.root.remove(this.activeTurn.group)
    this.activeTurn = null
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

function notationFor(base: MoveBase, userTurns: TurnAmount): string {
  const visibleBase = base === 'X' || base === 'Y' || base === 'Z' ? base.toLowerCase() : base

  if (userTurns === 2) {
    return `${visibleBase}2`
  }

  return userTurns === -1 ? `${visibleBase}'` : visibleBase
}

function cloneCoord(coord: Coord): Coord {
  return { x: coord.x, y: coord.y, z: coord.z }
}

function normalFor(axis: Axis, sign: number): Coord {
  return {
    x: axis === 'x' ? sign : 0,
    y: axis === 'y' ? sign : 0,
    z: axis === 'z' ? sign : 0,
  }
}

function rotateCoord(coord: Coord, axis: Axis, rawTurns: number): Coord {
  let result = cloneCoord(coord)
  const turns = ((rawTurns % 4) + 4) % 4

  for (let index = 0; index < turns; index += 1) {
    const { x, y, z } = result

    if (axis === 'x') {
      result = { x, y: -z, z: y }
    } else if (axis === 'y') {
      result = { x: z, y, z: -x }
    } else {
      result = { x: -y, y: x, z }
    }
  }

  return result
}

function snapQuaternion(quaternion: THREE.Quaternion): void {
  const source = new THREE.Matrix4().makeRotationFromQuaternion(quaternion)
  const elements = source.elements
  const snapped = new THREE.Matrix4()

  snapped.set(
    snapComponent(elements[0]),
    snapComponent(elements[4]),
    snapComponent(elements[8]),
    0,
    snapComponent(elements[1]),
    snapComponent(elements[5]),
    snapComponent(elements[9]),
    0,
    snapComponent(elements[2]),
    snapComponent(elements[6]),
    snapComponent(elements[10]),
    0,
    0,
    0,
    0,
    1,
  )
  quaternion.setFromRotationMatrix(snapped)
}

function snapComponent(value: number): -1 | 0 | 1 {
  if (Math.abs(value) < 0.5) {
    return 0
  }

  return value < 0 ? -1 : 1
}

function rotatedUnitVector(
  normal: Coord,
  quaternion: THREE.Quaternion,
): { axis: Axis; sign: -1 | 1 } | null {
  TEMP_VECTOR.set(normal.x, normal.y, normal.z).applyQuaternion(quaternion)

  const absX = Math.abs(TEMP_VECTOR.x)
  const absY = Math.abs(TEMP_VECTOR.y)
  const absZ = Math.abs(TEMP_VECTOR.z)

  if (absX >= absY && absX >= absZ && absX > 0.7) {
    return { axis: 'x', sign: TEMP_VECTOR.x < 0 ? -1 : 1 }
  }

  if (absY >= absX && absY >= absZ && absY > 0.7) {
    return { axis: 'y', sign: TEMP_VECTOR.y < 0 ? -1 : 1 }
  }

  if (absZ > 0.7) {
    return { axis: 'z', sign: TEMP_VECTOR.z < 0 ? -1 : 1 }
  }

  return null
}

function orientSticker(sticker: THREE.Object3D, axis: Axis, sign: number): void {
  if (axis === 'x') {
    sticker.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2
  } else if (axis === 'y') {
    sticker.rotation.x = sign > 0 ? -Math.PI / 2 : Math.PI / 2
  } else if (sign < 0) {
    sticker.rotation.y = Math.PI
  }
}

function createRoundedStickerGeometry(size: number, radius: number): THREE.ShapeGeometry {
  const half = size / 2
  const shape = new THREE.Shape()

  shape.moveTo(-half + radius, -half)
  shape.lineTo(half - radius, -half)
  shape.quadraticCurveTo(half, -half, half, -half + radius)
  shape.lineTo(half, half - radius)
  shape.quadraticCurveTo(half, half, half - radius, half)
  shape.lineTo(-half + radius, half)
  shape.quadraticCurveTo(-half, half, -half, half - radius)
  shape.lineTo(-half, -half + radius)
  shape.quadraticCurveTo(-half, -half, -half + radius, -half)

  return new THREE.ShapeGeometry(shape, 8)
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2
}
