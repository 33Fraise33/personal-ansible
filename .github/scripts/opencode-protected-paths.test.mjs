import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  assertSafeWorkspacePath,
  isProtectedPath,
  protectedPatchPath,
} from "./opencode-protected-paths.mjs"

test("recognizes protected files and normalized paths", () => {
  assert.equal(isProtectedPath(".github/workflows/opencode.yml"), true)
  assert.equal(isProtectedPath("roles/example/../../.opencode/plugin/guard.ts"), true)
  assert.equal(isProtectedPath("./opencode.json"), true)
  assert.equal(isProtectedPath("roles/example/.env.production"), true)
  assert.equal(isProtectedPath("roles/example/tasks/main.yml"), false)
})

test("rejects protected apply_patch destinations", () => {
  const patch = `*** Begin Patch
*** Update File: roles/example/tasks/main.yml
*** Move to: .git/config
@@
-old
+new
*** End Patch`
  assert.equal(protectedPatchPath(patch), ".git/config")
  assert.equal(
    protectedPatchPath("*** Begin Patch\n*** Add File: roles/example/README.md\n+safe\n*** End Patch"),
    undefined,
  )
})

test("accepts safe relative and absolute workspace paths", async () => {
  const worktree = await mkdtemp(path.join(os.tmpdir(), "opencode-guard-"))
  try {
    await mkdir(path.join(worktree, "roles", "example"), { recursive: true })
    await assert.doesNotReject(() => assertSafeWorkspacePath(worktree, "roles/example/tasks/main.yml"))
    await assert.doesNotReject(() => assertSafeWorkspacePath(worktree, path.join(worktree, "roles/example/tasks/main.yml")))
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})

test("rejects direct, traversal, protected absolute, and external absolute paths", async () => {
  const worktree = await mkdtemp(path.join(os.tmpdir(), "opencode-guard-"))
  try {
    await mkdir(path.join(worktree, ".github"))
    await assert.rejects(() => assertSafeWorkspacePath(worktree, ".github/workflows/main.yml"))
    await assert.rejects(() => assertSafeWorkspacePath(worktree, "../outside"))
    await assert.rejects(() => assertSafeWorkspacePath(worktree, path.join(worktree, ".github/workflows/main.yml")))
    await assert.rejects(() => assertSafeWorkspacePath(worktree, path.dirname(worktree)))
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})

test("rejects symlinks resolving to protected and external paths", async () => {
  const worktree = await mkdtemp(path.join(os.tmpdir(), "opencode-guard-"))
  try {
    await mkdir(path.join(worktree, ".git"))
    await mkdir(path.join(worktree, "roles", "example"), { recursive: true })
    await writeFile(path.join(worktree, ".git", "config"), "secret")
    await symlink("../../.git/config", path.join(worktree, "roles", "example", "config"))
    await symlink("../../.github/new.yml", path.join(worktree, "roles", "example", "broken"))
    await symlink("/etc/passwd", path.join(worktree, "roles", "example", "external"))
    await assert.rejects(() => assertSafeWorkspacePath(worktree, "roles/example/config"))
    await assert.rejects(() => assertSafeWorkspacePath(worktree, "roles/example/broken"))
    await assert.rejects(() => assertSafeWorkspacePath(worktree, "roles/example/external"))
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})
