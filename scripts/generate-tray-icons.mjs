// Generates the monochrome menu-bar template icon (a ring) at 1x and 2x.
//
// macOS uses the filename suffix "Template" to decide that the artwork should
// be inverted for dark/light menu bars, so the output names matter. Run with
// `npm run icons` after changing the geometry.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')

const OUTER_RADIUS = 6.4
const INNER_RADIUS = 4.1
const SUPERSAMPLE = 6

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

function ring(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const centre = size / 2
  const scale = size / 16
  const outer = OUTER_RADIUS * scale
  const inner = INNER_RADIUS * scale

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const px = x + (sx + 0.5) / SUPERSAMPLE
          const py = y + (sy + 0.5) / SUPERSAMPLE
          const distance = Math.hypot(px - centre, py - centre)
          if (distance >= inner && distance <= outer) covered += 1
        }
      }
      const alpha = Math.round((covered / (SUPERSAMPLE * SUPERSAMPLE)) * 255)
      const offset = (y * size + x) * 4
      // Template images must be black + alpha only.
      pixels[offset] = 0
      pixels[offset + 1] = 0
      pixels[offset + 2] = 0
      pixels[offset + 3] = alpha
    }
  }
  return encodePng(size, size, pixels)
}

await mkdir(OUT_DIR, { recursive: true })
await writeFile(join(OUT_DIR, 'trayTemplate.png'), ring(16))
await writeFile(join(OUT_DIR, 'trayTemplate@2x.png'), ring(32))
console.log('wrote resources/trayTemplate.png and resources/trayTemplate@2x.png')
