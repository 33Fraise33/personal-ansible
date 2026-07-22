import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildAuthContent, main } from "./opencode-auth.mjs"

const components = {
  OPENAI_OAUTH_ACCESS_TOKEN: "access-value",
  OPENAI_OAUTH_REFRESH_TOKEN: "refresh-value",
  OPENAI_OAUTH_EXPIRES: "123",
  OPENAI_OAUTH_ACCOUNT_ID: "account-value",
}

test("constructs the exact OpenCode OAuth JSON", () => {
  assert.deepEqual(JSON.parse(buildAuthContent(components)), {
    openai: {
      type: "oauth",
      refresh: "refresh-value",
      access: "access-value",
      expires: 123,
      accountId: "account-value",
    },
  })
})

test("requires every component and a non-negative safe integer expiration", () => {
  for (const name of Object.keys(components)) {
    assert.throws(() => buildAuthContent({ ...components, [name]: "" }), new RegExp(name))
  }
  for (const expires of ["-1", "1.2", "nope", "9007199254740992"]) {
    assert.throws(() => buildAuthContent({ ...components, OPENAI_OAUTH_EXPIRES: expires }), /safe integer/)
  }
})

test("masks JSON before writing it with a random delimiter", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opencode-auth-"))
  const envPath = path.join(directory, "env")
  const logs = []
  try {
    main({ ...components, GITHUB_ENV: envPath }, (line) => logs.push(line))
    const content = buildAuthContent(components)
    assert.deepEqual(logs, [`::add-mask::${content}`])
    assert.match(await readFile(envPath, "utf8"), /^OPENCODE_AUTH_CONTENT<<opencode_auth_[^\n]+\n.*\nopencode_auth_/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
