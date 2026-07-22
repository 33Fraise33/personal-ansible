import type { Plugin } from "@opencode-ai/plugin"

export default (async ({ worktree }) => {
  if (process.env.GITHUB_ACTIONS !== "true") return {}

  const [{ enableGithubBuildEdits }, { assertSafeWorkspacePath, patchPaths }] = await Promise.all([
    import("../../.github/scripts/opencode-permissions.mjs"),
    import("../../.github/scripts/opencode-protected-paths.mjs"),
  ])

  return {
    config: (config) => {
      enableGithubBuildEdits(config)
    },
    "tool.execute.before": async (input, output) => {
      const paths: string[] = []
      if (input.tool === "apply_patch") paths.push(...patchPaths(output.args?.patchText))
      for (const key of ["filePath", "path"]) {
        if (typeof output.args?.[key] === "string") paths.push(output.args[key])
      }

      for (const candidate of paths) {
        await assertSafeWorkspacePath(worktree, candidate)
      }
    },
  }
}) satisfies Plugin
