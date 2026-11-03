#!/usr/bin/env node

/**
 * One-command install into /Applications, so the unsigned local build shows up
 * in Launchpad without a Finder drag. Builds first only when the .app is
 * missing; replacing an existing copy is explicit and loud.
 */
import { execFileSync } from 'node:child_process'
import { accessSync, constants, cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const appName = 'OpenCode Dashboard'
const source = join(root, 'release', 'mac', `${appName}.app`)
const target = join('/Applications', `${appName}.app`)

function fail(message) {
  console.error(`install:app: ${message}`)
  process.exit(1)
}

try {
  accessSync('/Applications', constants.W_OK)
} catch {
  fail('/Applications 不可写（需要管理员权限或由管理员安装），未复制任何文件。')
}

if (!existsSync(source)) {
  console.log(`未找到 ${source}，先运行 npm run package …`)
  try {
    execFileSync('npm', ['run', 'package'], { cwd: root, stdio: 'inherit' })
  } catch {
    fail('npm run package 失败，未安装。')
  }
}

if (!existsSync(source)) {
  fail(`打包完成但没有找到 ${source}。`)
}

try {
  if (existsSync(target)) {
    console.log(`替换现有 ${target}`)
    rmSync(target, { recursive: true, force: true })
  }
  cpSync(source, target, { recursive: true })
} catch (error) {
  fail(
    `复制到 /Applications 失败：${error instanceof Error ? error.message : String(error)}` +
      '（如果应用正在运行，请先退出再试。）',
  )
}

console.log(`已安装：${target}`)
console.log('打开 Launchpad，搜索「OpenCode Dashboard」即可启动。')
