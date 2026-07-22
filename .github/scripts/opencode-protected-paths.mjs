import { lstat, readlink, realpath } from "node:fs/promises"
import path from "node:path"

const PROTECTED_PATHS = [
  ".git",
  ".github",
  ".opencode",
  "AGENTS.md",
  "opencode.json",
  "vault_pass.sh",
]

export function isProtectedPath(value) {
  if (typeof value !== "string" || !value.trim()) return true

  const candidate = value.trim().replaceAll("\\", "/")
  if (candidate.startsWith("~")) return true

  const normalized = path.posix.normalize(candidate).replace(/^\.\//, "")
  if (normalized === ".." || normalized.startsWith("../")) return true
  if (normalized.split("/").some((segment) => segment === ".env" || segment.startsWith(".env."))) return true

  return PROTECTED_PATHS.some(
    (protectedPath) => normalized === protectedPath || normalized.startsWith(`${protectedPath}/`),
  )
}

export function protectedPatchPath(patchText) {
  return patchPaths(patchText).find(isProtectedPath)
}

export function patchPaths(patchText) {
  if (typeof patchText !== "string") return ["invalid patch"]

  const prefixes = ["*** Add File:", "*** Delete File:", "*** Update File:", "*** Move to:"]
  const paths = []
  for (const line of patchText.split("\n")) {
    const prefix = prefixes.find((candidate) => line.startsWith(candidate))
    if (prefix) paths.push(line.slice(prefix.length).trim())
  }
  return paths
}

async function canonicalPath(value, depth = 0) {
  if (depth > 40) throw new Error(`Too many symbolic links in ${value}`)

  try {
    const stat = await lstat(value)
    if (stat.isSymbolicLink()) {
      return canonicalPath(path.resolve(path.dirname(value), await readlink(value)), depth + 1)
    }
    return realpath(value)
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
    const parent = path.dirname(value)
    if (parent === value) return value
    return path.resolve(await canonicalPath(parent, depth + 1), path.basename(value))
  }
}

function isOutside(root, candidate) {
  const relative = path.relative(root, candidate).replaceAll("\\", "/")
  return relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)
}

export async function assertSafeWorkspacePath(worktree, value) {
  if (typeof value !== "string" || !value.trim() || value.trim().startsWith("~")) {
    throw new Error(`OpenCode GitHub policy blocks access to ${value}`)
  }

  const root = await realpath(worktree)
  const unresolved = path.resolve(root, value)
  if (isOutside(root, unresolved)) throw new Error(`OpenCode GitHub policy blocks access to ${value}`)

  const candidate = await canonicalPath(unresolved)
  if (isOutside(root, candidate)) throw new Error(`OpenCode GitHub policy blocks resolved path ${value}`)

  const relative = path.relative(root, candidate).replaceAll("\\", "/")
  if (isProtectedPath(relative)) throw new Error(`OpenCode GitHub policy blocks access to ${value}`)
}
