import { appendFileSync, readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"

export const MAX_THREAD_COMMENTS = 10
export const MAX_THREAD_CONTEXT_CHARACTERS = 60_000
export const MAX_PULL_REQUEST_FILES = 100
const CONTEXT_FORMAT_OVERHEAD = 10_000

export function classifyTarget(event) {
  if (event.issue) {
    return { type: event.issue.pull_request ? "pull_request" : "issue", number: event.issue.number }
  }
  if (event.pull_request) return { type: "pull_request", number: event.pull_request.number }
  throw new Error("This workflow only accepts issue or pull request comment events.")
}

export async function fetchPullRequest({ apiUrl, repository, number, token, fetchImpl = fetch }) {
  if (!apiUrl || !repository || !token) throw new Error("GitHub API configuration is incomplete.")
  const response = await fetchImpl(`${apiUrl}/repos/${repository}/pulls/${number}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
  if (!response.ok) throw new Error(`GitHub pull request lookup failed with HTTP ${response.status}.`)
  return response.json()
}

export async function fetchIssue({ apiUrl, repository, number, token, fetchImpl = fetch }) {
  if (!apiUrl || !repository || !token) throw new Error("GitHub API configuration is incomplete.")
  const response = await fetchImpl(`${apiUrl}/repos/${repository}/issues/${number}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
  if (!response.ok) throw new Error(`GitHub issue lookup failed with HTTP ${response.status}.`)
  return response.json()
}

async function fetchTargetData({ apiUrl, repository, endpoint, token, fetchImpl = fetch }) {
  const response = await fetchImpl(`${apiUrl}/repos/${repository}/${endpoint}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
  if (!response.ok) throw new Error(`GitHub context lookup failed with HTTP ${response.status}.`)
  return { value: await response.json(), hasNextPage: response.headers?.get?.("link")?.includes('rel="next"') === true }
}

async function assertBoundedThread(target, options) {
  const issueComments = await fetchTargetData({
    ...options,
    endpoint: `issues/${target.number}/comments?per_page=${MAX_THREAD_COMMENTS + 1}`,
  })
  const context = [
    options.subject.title,
    options.subject.body,
    options.subject.user?.login,
    options.subject.created_at,
    options.subject.state,
    ...issueComments.value.flatMap((comment) => [comment.user?.login, comment.created_at, comment.body]),
  ]
  let itemCount = issueComments.value.length
  if (target.type === "pull_request") {
    const reviews = await fetchTargetData({
      ...options,
      endpoint: `pulls/${target.number}/reviews?per_page=${MAX_THREAD_COMMENTS + 1}`,
    })
    itemCount += reviews.value.length
    context.push(...reviews.value.flatMap((review) => [review.user?.login, review.submitted_at, review.state, review.body]))
    const reviewComments = await Promise.all(
      reviews.value.map((review) =>
        fetchTargetData({
          ...options,
          endpoint: `pulls/${target.number}/reviews/${review.id}/comments?per_page=${MAX_THREAD_COMMENTS + 1}`,
        }),
      ),
    )
    itemCount += reviewComments.reduce((total, result) => total + result.value.length, 0)
    context.push(
      ...reviewComments.flatMap((result) =>
        result.value.flatMap((comment) => [comment.user?.login, comment.created_at, comment.path, comment.line, comment.body]),
      ),
    )
    const files = await fetchTargetData({ ...options, endpoint: `pulls/${target.number}/files?per_page=${MAX_PULL_REQUEST_FILES}` })
    if (files.value.length > MAX_PULL_REQUEST_FILES || files.hasNextPage) {
      throw new Error(`OpenCode limits pull requests to ${MAX_PULL_REQUEST_FILES} changed files.`)
    }
    context.push(...files.value.flatMap((file) => [file.filename, file.status, file.additions, file.deletions]))
    if (reviews.hasNextPage || reviewComments.some((result) => result.hasNextPage)) itemCount = MAX_THREAD_COMMENTS + 1
  }
  if (itemCount > MAX_THREAD_COMMENTS || issueComments.hasNextPage) {
    throw new Error(`OpenCode limits issue and pull request threads to ${MAX_THREAD_COMMENTS} comments.`)
  }

  const text = context.filter((value) => typeof value === "string" || typeof value === "number")
  const size = text.reduce((total, value) => total + String(value).length, CONTEXT_FORMAT_OVERHEAD)
  if (size > MAX_THREAD_CONTEXT_CHARACTERS) {
    throw new Error(`OpenCode limits issue and pull request context to ${MAX_THREAD_CONTEXT_CHARACTERS} characters.`)
  }
}

export async function inspectTarget(event, mode, options) {
  const target = classifyTarget(event)
  if (target.type === "issue") {
    const issue = await fetchIssue({ ...options, number: target.number })
    await assertBoundedThread(target, { ...options, subject: issue })
    return {
      target_type: "issue",
      target_number: String(target.number),
      target_state: issue.state,
      target_updated_at: issue.updated_at,
      base_ref: "",
      head_ref: "",
      head_sha: "",
      head_repo: "",
      same_repo: "true",
    }
  }

  const pull = await fetchPullRequest({ ...options, number: target.number })
  await assertBoundedThread(target, { ...options, subject: pull })
  const sameRepo = pull.head?.repo?.full_name === options.repository
  const result = {
    target_type: "pull_request",
    target_number: String(target.number),
    target_state: pull.state,
    target_updated_at: pull.updated_at,
    base_ref: pull.base?.ref,
    head_ref: pull.head?.ref,
    head_sha: pull.head?.sha,
    head_repo: pull.head?.repo?.full_name,
    same_repo: String(sameRepo),
  }
  if (Object.values(result).some((value) => typeof value !== "string")) {
    throw new Error("GitHub returned incomplete pull request metadata.")
  }
  if (mode === "build" && !sameRepo) throw new Error("Build mode rejects fork pull requests.")
  if (mode === "build" && pull.state !== "open") throw new Error("Build mode requires an open pull request.")
  if (mode === "build" && pull.head.ref === options.defaultBranch) {
    throw new Error("Build mode rejects pull requests whose head is the default branch.")
  }
  return result
}

function writeOutputs(outputPath, outputs) {
  for (const [name, value] of Object.entries(outputs)) {
    const delimiter = `opencode_target_${randomUUID()}`
    appendFileSync(outputPath, `${name}<<${delimiter}\n${value}\n${delimiter}\n`)
  }
}

export async function main(env = process.env) {
  if (!env.GITHUB_EVENT_PATH) throw new Error("GITHUB_EVENT_PATH is required.")
  if (!env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.")
  if (!env.MODE || !["plan", "build"].includes(env.MODE)) throw new Error("MODE is invalid.")
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"))
  const outputs = await inspectTarget(event, env.MODE, {
    apiUrl: env.GITHUB_API_URL,
    repository: env.GITHUB_REPOSITORY,
    defaultBranch: event.repository?.default_branch,
    token: env.GITHUB_TOKEN,
  })
  writeOutputs(env.GITHUB_OUTPUT, outputs)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
