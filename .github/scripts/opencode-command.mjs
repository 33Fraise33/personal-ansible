import { appendFileSync, readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"

export const MAX_PROMPT_LENGTH = 8000
const GITHUB_ATTACHMENT_URL = /https:\/\/github\.com\/user-attachments\//i

const MODELS = Object.freeze({
  sol: "openai/gpt-5.6-sol",
  terra: "openai/gpt-5.6-terra",
  luna: "openai/gpt-5.6-luna",
})

const DEFAULT_MODELS = Object.freeze({
  plan: MODELS.sol,
  build: MODELS.terra,
})

const ALLOWED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"])

export function isAllowedAssociation(association) {
  return ALLOWED_ASSOCIATIONS.has(association)
}

export function parseCommand(value) {
  if (typeof value !== "string") throw new Error("The OpenCode command must be text.")
  const body = value.replaceAll("\r\n", "\n")
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body)) {
    throw new Error("The OpenCode command contains unsupported control characters.")
  }
  const match = body.match(
    /^\/(?:oc|opencode) +(plan|build)(?: +--model +(sol|terra|luna))? +(.+)$/s,
  )

  if (!match) {
    throw new Error(
      "Expected `/oc <plan|build> [--model <sol|terra|luna>] <request>` with the command at the start of the comment.",
    )
  }

  const mode = match[1]
  const modelAlias = match[2]
  const prompt = match[3].trim()
  if (!prompt) throw new Error("The OpenCode request must not be empty.")
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`The OpenCode request must not exceed ${MAX_PROMPT_LENGTH} characters.`)
  }
  if (GITHUB_ATTACHMENT_URL.test(prompt)) {
    throw new Error("OpenCode commands cannot include GitHub attachment URLs.")
  }
  if (/^--model(?:\s|$)/i.test(prompt)) {
    throw new Error("Model must be one of: sol, terra, luna.")
  }

  return {
    mode,
    model: modelAlias ? MODELS[modelAlias] : DEFAULT_MODELS[mode],
    prompt,
  }
}

function writeOutput(outputPath, name, value) {
  const delimiter = `opencode_${randomUUID()}`
  appendFileSync(outputPath, `${name}<<${delimiter}\n${value}\n${delimiter}\n`)
}

export function main(env = process.env) {
  if (!env.GITHUB_EVENT_PATH) throw new Error("GITHUB_EVENT_PATH is required.")
  if (!env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.")
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"))
  const comment = event.comment
  if (!comment) throw new Error("This workflow only accepts GitHub comment events.")
  if (!isAllowedAssociation(comment.author_association)) {
    throw new Error(`User association ${comment.author_association ?? "UNKNOWN"} is not authorized.`)
  }

  const command = parseCommand(comment.body)
  writeOutput(env.GITHUB_OUTPUT, "mode", command.mode)
  writeOutput(env.GITHUB_OUTPUT, "model", command.model)
  writeOutput(env.GITHUB_OUTPUT, "prompt", command.prompt)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
