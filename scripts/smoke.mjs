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
    await assertSnapshot(
      page,
      (snapshot) => snapshot.isSolved && snapshot.moveCount === 0,
      `${code} should preserve solved puzzle state without counting as a move`,
    )
    await page.keyboard.press(`Shift+${code}`)
    await waitForIdle(page)
    await assertSnapshot(
      page,
      (snapshot) => snapshot.isSolved && snapshot.moveCount === 0,
      `${code} inverse should preserve solved state without counting as a move`,
    )
  }

  await page.keyboard.press('Space')
  await assertSnapshot(
    page,
    (snapshot) => snapshot.moveCount === 0 && snapshot.pendingMoves.length === 0,
    'scramble should start with hidden moves and a zero move count',
  )
  await assertText(page, '#move-strip', 'Ready', 'scramble should not show move notation in the move strip')
  await waitForIdle(page)
  await assertSnapshot(
    page,
    (snapshot) =>
      !snapshot.isSolved &&
      snapshot.moveCount === 0 &&
      snapshot.lastMoves.length === 0 &&
      snapshot.pendingMoves.length === 0,
    'scramble should leave the cube mixed with no counted or visible scramble moves',
  )

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

  const shortcutAssertions = [
    { code: 'Digit1', expected: "F U R U'", count: 4, message: '1 should run the former 3 shortcut' },
    { code: 'Digit2', expected: "R U' R' U", count: 4, message: '2 should run the former semicolon shortcut' },
    { code: 'Digit3', expected: "F' U F U'", count: 4, message: '3 should run the former A shortcut' },
    {
      code: 'Digit4',
      expected: "U' R U' R' U F' U F U'",
      count: 9,
      message: '4 should run the former 4 shortcut',
    },
    {
      code: 'Digit5',
      expected: "U F' U F U' R U' R' U",
      count: 9,
      message: '5 should run the former 5 shortcut',
    },
    { code: 'Digit6', expected: "F R U' R' U F'", count: 6, message: '6 should run the former 8 shortcut' },
    {
      code: 'Digit7',
      expected: "R U' R' U' R U U R'",
      count: 8,
      message: '7 should run the former 6 shortcut',
    },
    {
      code: 'Digit8',
      expected: "U' R U L' U' R' U L",
      count: 8,
      message: '8 should run the former 7 shortcut',
    },
  ]

  for (const shortcut of shortcutAssertions) {
    await page.keyboard.press('Digit0')
    await waitForIdle(page)
    await page.keyboard.press(shortcut.code)
    await waitForIdle(page)
    await assertSnapshot(
      page,
      (snapshot) =>
        !snapshot.isSolved &&
        snapshot.moveCount === shortcut.count &&
        snapshot.lastMoves.join(' ') === shortcut.expected,
      shortcut.message,
    )
  }

  await page.keyboard.press('Digit0')
  await waitForIdle(page)
  for (const oldShortcut of ['KeyA', 'Semicolon', 'KeyG', 'KeyT']) {
    await page.keyboard.press(oldShortcut)
  }
  await assertSnapshot(
    page,
    (snapshot) => snapshot.isSolved && snapshot.moveCount === 0,
    'old letter and punctuation shortcuts should no longer run algorithms',
  )

  await page.keyboard.press('KeyH')
  await page.waitForFunction(() => document.querySelector('#help-dialog')?.open)
  await assertText(page, '.combo-grid span:nth-child(2)', 'Flip colors of an edge piece in place', 'combo 1 should be described')
  await assertText(page, '.combo-grid span:nth-child(4)', 'Right hand 4 moves combo', 'combo 2 should be described')
  await assertText(page, '.combo-grid span:nth-child(6)', 'Left hand 4 moves combo', 'combo 3 should be described')
  await assertText(page, '.combo-grid span:nth-child(8)', 'Move an edge piece to the right', 'combo 4 should be described')
  await assertText(page, '.combo-grid span:nth-child(10)', 'Move an edge piece to the left', 'combo 5 should be described')
  await assertText(page, '.combo-grid span:nth-child(12)', 'Create cross', 'combo 6 should be described')
  await assertText(page, '.combo-grid span:nth-child(14)', 'Fix cross color matching', 'combo 7 should be described')
  await assertText(page, '.combo-grid span:nth-child(16)', 'Fix corners color matching', 'combo 8 should be described')
  await assertText(page, '#individual-heading', 'Individual keys', 'individual keys heading should be visible')
  await assertText(page, '#combo-heading', 'Combo keys', 'combo heading should be visible')
  await assertText(
    page,
    '.combo-section .keyboard-section-copy p',
    'Watch https://youtu.be/7Ron6MN45LY for details of these combo keys',
    'combo source sentence should be visible',
  )
  await assertText(page, '.combo-source-link', 'https://youtu.be/7Ron6MN45LY', 'combo source link should be visible')
  await assertAttribute(
    page,
    '.combo-source-link',
    'href',
    'https://youtu.be/7Ron6MN45LY',
    'combo source link should target the tutorial',
  )
  await page.screenshot({ path: 'artifacts/help-dialog.png', fullPage: true })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('#help-dialog')?.open)

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

async function assertText(page, selector, expected, message) {
  const text = await page.textContent(selector)

  if (text !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(text)}`)
  }
}

async function assertAttribute(page, selector, attribute, expected, message) {
  const value = await page.getAttribute(selector, attribute)

  if (value !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`)
  }
}
