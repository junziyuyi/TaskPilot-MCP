#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const typeFilePattern = /\.(?:ts|tsx|vue)$/
const files = process.argv.slice(2).filter((file) => typeFilePattern.test(file))

if (files.length === 0) {
  console.log('没有暂存的 TypeScript/Vue 文件，跳过类型检查。')
  process.exit(0)
}

const changedWorkspaceDirs = new Set()

for (const file of files) {
  const relativePath = path.relative(root, path.resolve(root, file)).replaceAll('\\', '/')
  const match = relativePath.match(/^(apps|packages)\/([^/]+)\//)
  if (match) changedWorkspaceDirs.add(`${match[1]}/${match[2]}`)
}

const workspacePackages = new Map()

for (const group of ['apps', 'packages']) {
  const groupDir = path.join(root, group)
  if (!existsSync(groupDir)) continue

  for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const workspaceDir = `${group}/${entry.name}`
    const packageFile = path.join(root, workspaceDir, 'package.json')
    if (!existsSync(packageFile)) continue

    const packageJson = JSON.parse(readFileSync(packageFile, 'utf8'))
    if (typeof packageJson.name !== 'string') continue

    workspacePackages.set(packageJson.name, { dir: workspaceDir, packageJson })
  }
}

const changedPackageNames = [...changedWorkspaceDirs].flatMap((workspaceDir) => {
  const match = [...workspacePackages.entries()].find(([, workspace]) => workspace.dir === workspaceDir)
  return match ? [match[0]] : []
})

if (changedPackageNames.length === 0) {
  console.log('暂存类型文件不属于 workspace，跳过类型检查。')
  process.exit(0)
}

const affectedPackageNames = new Set(changedPackageNames)
let foundDependent = true

while (foundDependent) {
  foundDependent = false

  for (const [packageName, workspace] of workspacePackages) {
    if (affectedPackageNames.has(packageName)) continue

    const dependencies = {
      ...workspace.packageJson.dependencies,
      ...workspace.packageJson.devDependencies,
      ...workspace.packageJson.peerDependencies,
    }

    if (Object.keys(dependencies).some((dependency) => affectedPackageNames.has(dependency))) {
      affectedPackageNames.add(packageName)
      foundDependent = true
    }
  }
}

console.log(`检查受影响 workspace：${[...affectedPackageNames].join(', ')}`)

for (const packageName of affectedPackageNames) {
  const workspace = workspacePackages.get(packageName)
  if (!workspace?.packageJson.scripts?.typecheck) continue

  const usesVue = Boolean(workspace.packageJson.dependencies?.vue)
  const binaryName = usesVue ? 'vue-tsc' : 'tsc'
  const workspaceExecutable = path.join(root, workspace.dir, 'node_modules', '.bin', binaryName)
  const executable = existsSync(workspaceExecutable)
    ? workspaceExecutable
    : path.join(root, 'node_modules', '.bin', binaryName)
  const result = spawnSync(executable, ['--noEmit', '-p', path.join(root, workspace.dir, 'tsconfig.json')], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('暂存内容类型检查通过。')
