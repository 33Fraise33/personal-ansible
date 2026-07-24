import assert from "node:assert/strict"
import test from "node:test"

import { MAX_PULL_REQUEST_FILES, MAX_THREAD_ITEMS, classifyTarget, inspectTarget } from "./opencode-target.mjs"

const repository = "owner/repo"
const pull = {
  state: "open",
  title: "Pull request",
  body: "Body",
  updated_at: "2026-07-22T00:00:00Z",
  base: { ref: "main" },
  head: { ref: "feature", sha: "abc123", repo: { full_name: repository } },
}
const issue = {
  state: "open",
  title: "Issue",
  body: "Body",
  updated_at: "2026-07-22T00:00:00Z",
}
const response = ({ pullValue = pull, issueValue = issue, issueComments = [], reviews = [], reviewComments = [], files = [] } = {}) =>
  async (url) => {
    const value = url.includes("/issues/") && url.includes("/comments")
      ? issueComments
      : url.includes("/reviews/") && url.includes("/comments")
        ? reviewComments
        : url.includes("/reviews")
          ? reviews
          : url.includes("/files")
            ? files
            : url.includes("/pulls/")
              ? pullValue
              : issueValue
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => value }
  }
const options = { apiUrl: "https://api.github.test", repository, defaultBranch: "main", token: "token" }

test("classifies issues, PR conversations, and PR review comments", () => {
  assert.deepEqual(classifyTarget({ issue: { number: 1 } }), { type: "issue", number: 1 })
  assert.deepEqual(classifyTarget({ issue: { number: 2, pull_request: {} } }), { type: "pull_request", number: 2 })
  assert.deepEqual(classifyTarget({ pull_request: { number: 3 } }), { type: "pull_request", number: 3 })
})

test("captures current issue metadata", async () => {
  const result = await inspectTarget({ issue: { number: 4 } }, "build", { ...options, fetchImpl: response() })
  assert.equal(result.target_type, "issue")
  assert.equal(result.target_number, "4")
  assert.equal(result.target_updated_at, issue.updated_at)
})

test("captures current pull request metadata", async () => {
  const result = await inspectTarget({ issue: { number: 5, pull_request: {} } }, "build", { ...options, fetchImpl: response() })
  assert.deepEqual(result, {
    target_type: "pull_request",
    target_number: "5",
    target_state: "open",
    target_updated_at: pull.updated_at,
    base_ref: "main",
    head_ref: "feature",
    head_sha: "abc123",
    head_repo: repository,
  })
})

test("build rejects forks, closed PRs, and default-branch heads", async () => {
  const event = { pull_request: { number: 6 } }
  await assert.rejects(
    () => inspectTarget(event, "build", {
      ...options,
      fetchImpl: response({ pullValue: { ...pull, head: { ...pull.head, repo: { full_name: "fork/repo" } } } }),
    }),
    /fork/,
  )
  await assert.rejects(
    () => inspectTarget(event, "build", { ...options, fetchImpl: response({ pullValue: { ...pull, state: "closed" } }) }),
    /open/,
  )
  await assert.rejects(
    () => inspectTarget(event, "build", {
      ...options,
      fetchImpl: response({ pullValue: { ...pull, head: { ...pull.head, ref: "main" } } }),
    }),
    /default branch/,
  )
})

test("plan permits fork pull requests", async () => {
  const result = await inspectTarget({ pull_request: { number: 7 } }, "plan", {
    ...options,
    fetchImpl: response({ pullValue: { ...pull, head: { ...pull.head, repo: { full_name: "fork/repo" } } } }),
  })
  assert.equal(result.head_repo, "fork/repo")
})

test("accepts a thread at the item limit", async () => {
  const comments = Array.from({ length: MAX_THREAD_ITEMS }, () => ({ body: "comment" }))
  await assert.doesNotReject(() => inspectTarget({ issue: { number: 8 } }, "plan", { ...options, fetchImpl: response({ issueComments: comments }) }))
})

test("rejects oversized thread context before model access", async () => {
  const comments = Array.from({ length: MAX_THREAD_ITEMS + 1 }, () => ({ body: "comment" }))
  await assert.rejects(
    () => inspectTarget({ issue: { number: 8 } }, "plan", { ...options, fetchImpl: response({ issueComments: comments }) }),
    /limits issue and pull request threads to 50 items/,
  )
})

test("counts PR reviews and nested review comments in the context limit", async () => {
  const reviews = Array.from({ length: MAX_THREAD_ITEMS + 1 }, (_, id) => ({ id, body: "review" }))
  await assert.rejects(
    () => inspectTarget({ pull_request: { number: 9 } }, "plan", { ...options, fetchImpl: response({ reviews }) }),
    /limits issue and pull request threads to 50 items/,
  )
  await assert.rejects(
    () => inspectTarget({ pull_request: { number: 9 } }, "plan", {
      ...options,
      fetchImpl: response({ reviews: [{ id: 1, body: "review" }], reviewComments: Array.from({ length: MAX_THREAD_ITEMS }, () => ({ body: "comment" })) }),
    }),
    /limits issue and pull request threads to 50 items/,
  )
})

test("bounds changed-file metadata included in OpenCode prompts", async () => {
  const files = Array.from({ length: MAX_PULL_REQUEST_FILES + 1 }, (_, id) => ({
    filename: `roles/${id}`,
    status: "modified",
    additions: 1,
    deletions: 1,
  }))
  await assert.rejects(
    () => inspectTarget({ pull_request: { number: 10 } }, "plan", { ...options, fetchImpl: response({ files }) }),
    /changed files/,
  )
})

test("counts review and file text toward the context limit", async () => {
  await assert.rejects(
    () => inspectTarget({ pull_request: { number: 11 } }, "plan", {
      ...options,
      fetchImpl: response({ reviews: [{ id: 1, body: "a".repeat(60_000) }] }),
    }),
    /context to/,
  )
})
