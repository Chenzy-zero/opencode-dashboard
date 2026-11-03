// Generates the placeholder app icon: the same monochrome ring as the menu-bar
// template, on a rounded graphite square. Output is `build/icon.icns`, which
// electron-builder turns into `Contents/Resources/icon.icns`.
//
// Run with `npm run app-icon` after changing the geometry. Rendering every
// iconset size here (instead of resampling one master) keeps the ring crisp at
// 16 px, where the app also appears in Finder list views.
import { execFileSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUILD_DIR = join(ROOT, 'build')
const ICONSET_DIR = join(BUILD_DIR, 'icon.iconset')

const OUTER_RADIUS = 0.4 // of the canvas, same ratio as resources/trayTemplate.png
const INNER_RADIUS = 0.256
const CORNER_RADIUS = 0.225
const SUPERSAMPLE = 4

const TOP = [0x1b, 0x27, 0x33]
const BOTTOM = [0x0f, 0x17, 0x20]
const RING = [0xf2, 0xf6, 0xfa]

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0 // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function insideRoundedSquare(px, py, size) {
  const centre = size / 2
  const inset = size / 2 - CORNER_RADIUS * size
  const dx = Math.max(Math.abs(px - centre) - inset, 0)
  const dy = Math.max(Math.abs(py - centre) - inset, 0)
  return dx * dx + dy * dy <= (CORNER_RADIUS * size) ** 2
}

function icon(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const centre = size / 2
  const outer = OUTER_RADIUS * size
  const inner = INNER_RADIUS * size
  const samples = SUPERSAMPLE * SUPERSAMPLE

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0
      let ringed = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const px = x + (sx + 0.5) / SUPERSAMPLE
          const py = y + (sy + 0.5) / SUPERSAMPLE
          if (!insideRoundedSquare(px, py, size)) continue
          covered += 1
          const distance = Math.hypot(px - centre, py - centre)
          if (distance >= inner && distance <= outer) ringed += 1
        }
      }

      const offset = (y * size + x) * 4
      if (covered === 0) continue // fully transparent corner

      // Vertical gradient for the plate; the ring is opaque on top of it.
      const t = y / Math.max(size - 1, 1)
      const plate = TOP.map((channel, index) => channel + (BOTTOM[index] - channel) * t)
      const mix = ringed / covered
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(plate[channel] * (1 - mix) + RING[channel] * mix)
      }
      pixels[offset + 3] = Math.round((covered / samples) * 255)
    }
  }
  return encodePng(size, size, pixels)
}

const ICONSET = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]

await rm(ICONSET_DIR, { recursive: true, force: true })
await mkdir(ICONSET_DIR, { recursive: true })
for (const [name, size] of ICONSET) {
  await writeFile(join(ICONSET_DIR, name), icon(size))
}

execFileSync('iconutil', ['-c', 'icns', ICONSET_DIR, '-o', join(BUILD_DIR, 'icon.icns')], {
  stdio: 'inherit',
})
await rm(ICONSET_DIR, { recursive: true, force: true })
console.log('wrote build/icon.icns')
