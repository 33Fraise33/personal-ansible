import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

export async function fetchActorPermission({ apiUrl, repository, username, token, fetchImpl = fetch }) {
  if (!apiUrl || !repository || !username || !token) throw new Error("GitHub authorization configuration is incomplete.")
  const response = await fetchImpl(`${apiUrl}/repos/${repository}/collaborators/${username}/permission`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
  if (!response.ok) throw new Error(`GitHub collaborator permission lookup failed with HTTP ${response.status}.`)
  return response.json()
}

export async function authorizeActor(event, options) {
  const username = event.comment?.user?.login
  if (options.mode === "plan" && username !== options.repositoryOwner) {
    throw new Error("Plan mode is limited to the repository owner.")
  }
  const { permission } = await fetchActorPermission({ ...options, username })
  if (!['admin', 'write'].includes(permission)) {
    throw new Error("OpenCode requires repository write or admin permission.")
  }
}

export async function main(env = process.env) {
  if (!env.GITHUB_EVENT_PATH) throw new Error("GITHUB_EVENT_PATH is required.")
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"))
  await authorizeActor(event, {
    apiUrl: env.GITHUB_API_URL,
    mode: env.MODE,
    repository: env.GITHUB_REPOSITORY,
    repositoryOwner: env.GITHUB_REPOSITORY_OWNER,
    token: env.GITHUB_TOKEN,
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
