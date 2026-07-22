import assert from "node:assert/strict"
import test from "node:test"

import { verifyTarget } from "./opencode-verify-target.mjs"

const env = {
  TARGET_TYPE: "pull_request",
  TARGET_NUMBER: "12",
  GITHUB_API_URL: "https://api.github.test",
  GITHUB_REPOSITORY: "owner/repo",
  GITHUB_TOKEN: "token",
  AUTHORIZED_HEAD_SHA: "abc123",
  AUTHORIZED_BASE_REF: "main",
  AUTHORIZED_HEAD_REF: "feature",
  AUTHORIZED_HEAD_REPO: "owner/repo",
  AUTHORIZED_TARGET_STATE: "open",
  AUTHORIZED_UPDATED_AT: "2026-07-22T00:00:00Z",
  DEFAULT_BRANCH: "main",
}
const pull = {
  state: "open",
  updated_at: "2026-07-22T00:00:00Z",
  base: { ref: "main" },
  head: { ref: "feature", sha: "abc123", repo: { full_name: "owner/repo" } },
}
const fetchPull = (value) => async () => ({ ok: true, status: 200, json: async () => value })

test("issues require unchanged state and context", async () => {
  const issueEnv = {
    TARGET_TYPE: "issue",
    TARGET_NUMBER: "12",
    GITHUB_API_URL: "https://api.github.test",
    GITHUB_REPOSITORY: "owner/repo",
    GITHUB_TOKEN: "token",
    AUTHORIZED_TARGET_STATE: "open",
    AUTHORIZED_UPDATED_AT: "2026-07-22T00:00:00Z",
  }
  const issue = { state: "open", updated_at: "2026-07-22T00:00:00Z" }
  await assert.doesNotReject(() => verifyTarget(issueEnv, fetchPull(issue)))
  await assert.rejects(() => verifyTarget(issueEnv, fetchPull({ ...issue, updated_at: "changed" })), /context changed/)
})

test("accepts unchanged authorized PR metadata", async () => {
  await assert.doesNotReject(() => verifyTarget(env, fetchPull(pull)))
})

test("rejects changed or unsafe post-approval PR metadata", async () => {
  const cases = [
    [{ ...pull, state: "closed" }, /no longer open/],
    [{ ...pull, updated_at: "changed" }, /context changed/],
    [{ ...pull, head: { ...pull.head, sha: "changed" } }, /SHA changed/],
    [{ ...pull, base: { ref: "other" } }, /base branch changed/],
    [{ ...pull, head: { ...pull.head, ref: "other" } }, /head branch changed/],
    [{ ...pull, head: { ...pull.head, repo: { full_name: "fork/repo" } } }, /no longer from this repository/],
    [{ ...pull, head: { ...pull.head, ref: "main" } }, /default branch/],
  ]
  for (const [value, message] of cases) {
    await assert.rejects(() => verifyTarget(env, fetchPull(value)), message)
  }
})
