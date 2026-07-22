import assert from "node:assert/strict"
import test from "node:test"

import { authorizeActor } from "./opencode-authorize-actor.mjs"

const event = { comment: { user: { login: "trusted-user" } } }
const options = {
  apiUrl: "https://api.github.test",
  mode: "build",
  repository: "owner/repo",
  repositoryOwner: "owner",
  token: "token",
}

function response(permission, username = "trusted-user") {
  return async (url) => ({
    ok: true,
    status: 200,
    json: async () => {
      assert.equal(url, `https://api.github.test/repos/owner/repo/collaborators/${username}/permission`)
      return { permission }
    },
  })
}

test("authorizes only repository write and admin access", async () => {
  await assert.doesNotReject(() => authorizeActor(event, { ...options, fetchImpl: response("write") }))
  await assert.doesNotReject(() => authorizeActor(event, { ...options, fetchImpl: response("admin") }))
  await assert.rejects(() => authorizeActor(event, { ...options, fetchImpl: response("read") }), /write or admin/)
})

test("limits plan mode to the repository owner", async () => {
  await assert.rejects(
    () => authorizeActor(event, { ...options, mode: "plan", repositoryOwner: "owner", fetchImpl: response("write") }),
    /repository owner/,
  )
  await assert.doesNotReject(
    () => authorizeActor({ comment: { user: { login: "owner" } } }, { ...options, mode: "plan", fetchImpl: response("write", "owner") }),
  )
})
