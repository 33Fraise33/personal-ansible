const BUILD_EDIT_PERMISSION = Object.freeze({
  "*": "allow",
  ".git/**": "deny",
  ".github/**": "deny",
  ".opencode/**": "deny",
  "opencode.json": "deny",
  "AGENTS.md": "deny",
  "vault_pass.sh": "deny",
  ".env": "deny",
  ".env.*": "deny",
  "**/.env": "deny",
  "**/.env.*": "deny",
})

export function isGithubActions(env = process.env) {
  return env.GITHUB_ACTIONS === "true"
}

export function enableGithubBuildEdits(config) {
  const build = config?.agent?.["github-build"]
  if (!build?.permission || build.permission.edit !== "deny") {
    throw new Error("github-build must statically deny edits before guarded enablement")
  }

  build.permission.edit = { ...BUILD_EDIT_PERMISSION }
}
