import { pathToFileURL } from "node:url"

import { fetchIssue, fetchPullRequest } from "./opencode-target.mjs"

export async function verifyTarget(env, fetchImpl = fetch) {
  if (env.TARGET_TYPE === "issue") {
    const issue = await fetchIssue({
      apiUrl: env.GITHUB_API_URL,
      repository: env.GITHUB_REPOSITORY,
      number: env.TARGET_NUMBER,
      token: env.GITHUB_TOKEN,
      fetchImpl,
    })
    if (issue.state !== env.AUTHORIZED_TARGET_STATE) throw new Error("Issue state changed after authorization.")
    if (issue.updated_at !== env.AUTHORIZED_UPDATED_AT) throw new Error("Issue context changed after authorization.")
    return
  }
  if (env.TARGET_TYPE !== "pull_request") throw new Error("Authorized target type is invalid.")

  const pull = await fetchPullRequest({
    apiUrl: env.GITHUB_API_URL,
    repository: env.GITHUB_REPOSITORY,
    number: env.TARGET_NUMBER,
    token: env.GITHUB_TOKEN,
    fetchImpl,
  })
  const checks = [
    [pull.state === "open", "Pull request is no longer open."],
    [pull.updated_at === env.AUTHORIZED_UPDATED_AT, "Pull request context changed after authorization."],
    [pull.head?.repo?.full_name === env.GITHUB_REPOSITORY, "Pull request is no longer from this repository."],
    [pull.head?.ref !== env.DEFAULT_BRANCH, "Pull request head is the default branch."],
    [pull.head?.sha === env.AUTHORIZED_HEAD_SHA, "Pull request head SHA changed after authorization."],
    [pull.base?.ref === env.AUTHORIZED_BASE_REF, "Pull request base branch changed after authorization."],
    [pull.head?.ref === env.AUTHORIZED_HEAD_REF, "Pull request head branch changed after authorization."],
    [pull.head?.repo?.full_name === env.AUTHORIZED_HEAD_REPO, "Pull request head repository changed after authorization."],
  ]
  for (const [valid, message] of checks) {
    if (!valid) throw new Error(message)
  }
}

export async function main(env = process.env) {
  await verifyTarget(env)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
