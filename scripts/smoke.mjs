import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const PORT = 4175
const URL = `http://127.0.0.1:${PORT}`
const HEADLESS = process.env.HEADLESS !== '0'

const server = spawn(
  'npm',
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let serverOutput = ''

server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString()
})

server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString()
})

try {
  await waitForServer(URL)
  await mkdir('artifacts', { recursive: true })

  const browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const consoleErrors = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  page.on('pageerror', (error) => {
    consoleErrors.push(error.message)
  })

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(window.rcube))
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true })

  await assertSnapshot(page, (snapshot) => snapshot.isSolved, 'initial cube should be solved')

  for (const code of ['KeyR', 'KeyL', 'KeyU', 'KeyD', 'KeyF', 'KeyB', 'KeyM', 'KeyE', 'KeyS']) {
    await page.keyboard.press('Digit0')
    await waitForIdle(page)
    await pressMove(page, code)
    await assertSnapshot(page, (snapshot) => !snapshot.isSolved, `${code} should change puzzle state`)
    await page.keyboard.press(`Shift+${code}`)
    await waitForIdle(page)
    await assertSnapshot(page, (snapshot) => snapshot.isSolved, `${code} followed by inverse should solve`)
  }

  for (const code of ['KeyX', 'KeyY', 'KeyZ']) {
    await page.keyboard.press('Digit0')
    await waitForIdle(page)
    await pressMove(page, code)
    await assertSnapshot(page, (snapshot) => snapshot.isSolved, `${code} should preserve solved puzzle state`)
    await page.keyboard.press(`Shift+${code}`)
    await waitForIdle(page)
    await assertSnapshot(page, (snapshot) => snapshot.isSolved, `${code} inverse should preserve solved state`)
  }

  await page.keyboard.press('Digit2')
  await pressMove(page, 'KeyU')
  await assertSnapshot(page, (snapshot) => !snapshot.isSolved, 'U2 should scramble the cube')
  await page.keyboard.press('Digit2')
  await pressMove(page, 'KeyU')
  await assertSnapshot(page, (snapshot) => snapshot.isSolved, 'two U2 turns should solve')

  await page.keyboard.press('Space')
  await waitForIdle(page)
  await assertSnapshot(page, (snapshot) => !snapshot.isSolved && snapshot.moveCount === 25, 'scramble should queue 25 turns')

  await page.keyboard.press('Digit0')
  await waitForIdle(page)
  await assertSnapshot(page, (snapshot) => snapshot.isSolved && snapshot.moveCount === 0, 'reset should solve and clear history')

  await pressMove(page, 'KeyF')
  await assertSnapshot(page, (snapshot) => !snapshot.isSolved && snapshot.moveCount === 1, 'F should be undoable')
  await page.keyboard.press('Backspace')
  await waitForIdle(page)
  await assertSnapshot(page, (snapshot) => snapshot.isSolved && snapshot.moveCount === 0, 'undo should restore solved state')

  await page.evaluate(() => window.rcube.enqueue("R U R' U' U R U' R'"))
  await waitForIdle(page)
  await assertSnapshot(page, (snapshot) => snapshot.isSolved, 'notation sequence plus inverse should solve')

  await page.keyboard.press('Digit0')
  await waitForIdle(page)
  await page.keyboard.press('KeyA')
  await waitForIdle(page)
  await assertSnapshot(
    page,
    (snapshot) => !snapshot.isSolved && snapshot.moveCount === 4 && snapshot.lastMoves.join(' ') === "F' U F U'",
    'A should run F prime U F U prime',
  )

  await page.keyboard.press('Digit0')
  await waitForIdle(page)
  await page.keyboard.press('Semicolon')
  await waitForIdle(page)
  await assertSnapshot(
    page,
    (snapshot) => !snapshot.isSolved && snapshot.moveCount === 4 && snapshot.lastMoves.join(' ') === "R U' R' U",
    'semicolon should run R U prime R prime U',
  )

  await page.keyboard.press('Digit0')
  await waitForIdle(page)
  await page.keyboard.press('KeyT')
  await waitForIdle(page)
  await assertSnapshot(
    page,
    (snapshot) =>
      !snapshot.isSolved && snapshot.moveCount === 8 && snapshot.lastMoves.join(' ') === "U' R U L' U' R' U L",
    'T should run U prime R U L prime U prime R prime U L',
  )

  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Equal')
  await page.waitForTimeout(300)

  const pixels = await page.evaluate(() => window.rcube.sampleCanvasPixels())

  if (pixels.averageAlpha < 250 || pixels.averageLuma < 16 || pixels.distinctSamples < 4) {
    throw new Error(`canvas pixel check failed: ${JSON.stringify(pixels)}`)
  }

  await page.screenshot({ path: 'artifacts/desktop-after-input.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(250)
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true })

  if (consoleErrors.length > 0) {
    throw new Error(`browser console errors:\n${consoleErrors.join('\n')}`)
  }

  await browser.close()
  console.log('Browser smoke test passed')
} finally {
  server.kill('SIGTERM')
}

async function waitForServer(url) {
  const deadline = Date.now() + 20_000

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`dev server exited early:\n${serverOutput}`)
    }

    try {
      const response = await fetch(url)

      if (response.ok) {
        return
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw new Error(`timed out waiting for dev server:\n${serverOutput}`)
}

async function pressMove(page, code) {
  await page.keyboard.press(code)
  await waitForIdle(page)
}

async function waitForIdle(page) {
  await page.waitForFunction(() => {
    const snapshot = window.rcube.snapshot()
    return snapshot.activeMove === null && snapshot.queueLength === 0
  })
}

async function assertSnapshot(page, predicate, message) {
  const snapshot = await page.evaluate(() => window.rcube.snapshot())

  if (!predicate(snapshot)) {
    throw new Error(`${message}: ${JSON.stringify(snapshot)}`)
  }
}
