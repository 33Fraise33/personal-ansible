import { appendFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"

const COMPONENTS = [
  "OPENAI_OAUTH_ACCESS_TOKEN",
  "OPENAI_OAUTH_REFRESH_TOKEN",
  "OPENAI_OAUTH_EXPIRES",
  "OPENAI_OAUTH_ACCOUNT_ID",
]

export function buildAuthContent(env) {
  for (const name of COMPONENTS) {
    if (typeof env[name] !== "string" || env[name].length === 0) {
      throw new Error(`${name} is required.`)
    }
  }

  if (!/^\d+$/.test(env.OPENAI_OAUTH_EXPIRES)) {
    throw new Error("OPENAI_OAUTH_EXPIRES must be a non-negative safe integer.")
  }
  const expires = Number(env.OPENAI_OAUTH_EXPIRES)
  if (!Number.isSafeInteger(expires)) {
    throw new Error("OPENAI_OAUTH_EXPIRES must be a non-negative safe integer.")
  }

  return JSON.stringify({
    openai: {
      type: "oauth",
      refresh: env.OPENAI_OAUTH_REFRESH_TOKEN,
      access: env.OPENAI_OAUTH_ACCESS_TOKEN,
      expires,
      accountId: env.OPENAI_OAUTH_ACCOUNT_ID,
    },
  })
}

export function main(env = process.env, log = console.log) {
  if (!env.GITHUB_ENV) throw new Error("GITHUB_ENV is required.")
  const content = buildAuthContent(env)
  const delimiter = `opencode_auth_${randomUUID()}`
  log(`::add-mask::${content}`)
  appendFileSync(env.GITHUB_ENV, `OPENCODE_AUTH_CONTENT<<${delimiter}\n${content}\n${delimiter}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
