import assert from "node:assert/strict"
import test from "node:test"

import { enableGithubBuildEdits, isGithubActions } from "./opencode-permissions.mjs"

test("GitHub-only guard activation requires the exact Actions environment value", () => {
  assert.equal(isGithubActions({}), false)
  assert.equal(isGithubActions({ GITHUB_ACTIONS: "false" }), false)
  assert.equal(isGithubActions({ GITHUB_ACTIONS: "1" }), false)
  assert.equal(isGithubActions({ GITHUB_ACTIONS: "TRUE" }), false)
  assert.equal(isGithubActions({ GITHUB_ACTIONS: "true" }), true)
})

test("build edits are denied before guarded configuration", () => {
  const config = { agent: { "github-build": { permission: { edit: "deny", read: "allow" } } } }
  assert.equal(config.agent["github-build"].permission.edit, "deny")
  enableGithubBuildEdits(config)
  assert.deepEqual(config.agent["github-build"].permission.edit, {
    "*": "allow",
    ".git/**": "deny",
    ".github/**": "deny",
    ".opencode/**": "deny",
    "opencode.json": "deny",
    "AGENTS.md": "deny",
    "vault_pass.sh": "deny",
    ".env": "deny",
    ".env.*": "deny",
    "**/.env": "deny",
    "**/.env.*": "deny",
  })
  assert.equal(config.agent["github-build"].permission.read, "allow")
})

test("configuration fails closed if static edit denial is absent", () => {
  assert.throws(() => enableGithubBuildEdits({ agent: { "github-build": { permission: { edit: "allow" } } } }))
  assert.throws(() => enableGithubBuildEdits({}))
})
