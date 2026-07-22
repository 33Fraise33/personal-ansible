import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { main, MAX_PROMPT_LENGTH, isAllowedAssociation, parseCommand } from "./opencode-command.mjs"

test("uses separate defaults and preserves command aliases", () => {
  assert.deepEqual(parseCommand("/oc plan inspect the role"), {
    mode: "plan",
    model: "openai/gpt-5.6-sol",
    prompt: "inspect the role",
  })
  assert.deepEqual(parseCommand("/opencode build implement the role"), {
    mode: "build",
    model: "openai/gpt-5.6-terra",
    prompt: "implement the role",
  })
})

test("accepts only allowlisted model aliases", () => {
  assert.equal(parseCommand("/oc build --model luna make the change").model, "openai/gpt-5.6-luna")
  assert.throws(() => parseCommand("/oc build --model openai/gpt-5.6 make the change"))
})

test("requires an exact command at the beginning", () => {
  assert.throws(() => parseCommand("please /oc plan inspect this"))
  assert.throws(() => parseCommand("/oc build"))
  assert.throws(() => parseCommand(" /oc plan inspect this"))
})

test("normalizes CRLF and preserves multiline prompts", () => {
  assert.equal(parseCommand("/oc plan inspect this\r\nand include tests").prompt, "inspect this\nand include tests")
})

test("enforces the prompt length limit", () => {
  assert.equal(parseCommand(`/oc plan ${"a".repeat(MAX_PROMPT_LENGTH)}`).prompt.length, MAX_PROMPT_LENGTH)
  assert.throws(() => parseCommand(`/oc plan ${"a".repeat(MAX_PROMPT_LENGTH + 1)}`))
})

test("rejects unsupported control characters but permits tab and newline", () => {
  assert.equal(parseCommand("/oc plan line\n\tmore").prompt, "line\n\tmore")
  assert.throws(() => parseCommand("/oc plan nul\0value"))
  assert.throws(() => parseCommand("/oc plan escape\x1bvalue"))
  assert.throws(() => parseCommand("/oc plan delete\x7fvalue"))
})

test("rejects GitHub attachment URLs before OpenCode can download them", () => {
  assert.throws(
    () => parseCommand("/oc plan inspect https://github.com/user-attachments/assets/unbounded"),
    /attachment URLs/,
  )
})

test("allows only trusted repository associations", () => {
  assert.equal(isAllowedAssociation("OWNER"), true)
  assert.equal(isAllowedAssociation("MEMBER"), true)
  assert.equal(isAllowedAssociation("COLLABORATOR"), true)
  assert.equal(isAllowedAssociation("CONTRIBUTOR"), false)
})

test("main writes multiline outputs and validates its environment", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opencode-command-"))
  const eventPath = path.join(directory, "event.json")
  const outputPath = path.join(directory, "output")
  try {
    await writeFile(eventPath, JSON.stringify({ comment: { author_association: "OWNER", body: "/oc plan first\nsecond" } }))
    main({ GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath })
    const output = await readFile(outputPath, "utf8")
    assert.match(output, /prompt<<opencode_[^\n]+\nfirst\nsecond\nopencode_/)
    assert.throws(() => main({ GITHUB_OUTPUT: outputPath }), /GITHUB_EVENT_PATH/)
    assert.throws(() => main({ GITHUB_EVENT_PATH: eventPath }), /GITHUB_OUTPUT/)
    await writeFile(eventPath, "{")
    assert.throws(() => main({ GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath }), SyntaxError)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
