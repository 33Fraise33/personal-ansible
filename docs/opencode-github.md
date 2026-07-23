# OpenCode GitHub Agent

OpenCode responds to explicit commands in GitHub issue comments, pull request conversations, and pull request review comments. GitHub calls merge requests "pull requests".

## Security Model

- Only the repository owner can invoke unapproved plan runs. Build requests require repository write/admin permission and the build-environment approval.
- Commands must start at the first character of a comment and use an allowlisted mode and model. Requests are limited to 8,000 characters; CRLF is normalized, and unsupported control characters are rejected.
- Both plan and build runs exchange GitHub OIDC for the installed OpenCode App token, so visible reactions, comments, branches, commits, and pull requests are authored by `opencode-agent[bot]`. The authorization and post-approval verification steps use scoped `GITHUB_TOKEN` credentials for invisible read-only checks; an accepted build also uses a narrowly scoped notification job to add or update its approval comment.
- Build runs require approval through the `opencode-build` environment. Fork PRs, non-open PRs, and PRs whose head is the default branch are rejected.
- An accepted build request adds an idempotent issue or PR comment linking to the pending workflow. The `opencode-build` deployment approval links back to the authorized source issue or PR, so reviewers can identify the affected request from either location.
- The build agent statically denies edits. A trusted startup plugin enables edits only for ordinary repository files and retains canonical and symlink path checks. If the plugin or config hook fails, editing stays denied.
- The build agent has no shell, network, subagent, external-directory, or merge access. It cannot edit `.github/`, `.opencode/`, `.git/`, `opencode.json`, `AGENTS.md`, `vault_pass.sh`, `.env`, or `.env.*` files.
- Comment workflows start from the trusted default branch before OpenCode processes PR content.
- Authorization bounds the repository-collected issue and pull-request context to ten issue/review/review-thread comments, 100 changed files, and 60,000 characters before OAuth is exposed. Native OpenCode may independently fetch additional GitHub context. GitHub attachment URLs are rejected rather than downloaded. Authorization captures current target state, `updated_at`, PR base branch, head branch, head SHA, and head repository. After environment approval, build mode rechecks the commenter's permission and fetches the target again immediately before OpenCode, rejecting any relevant change.
- Builds may update any same-repository, non-default-branch PR head. A residual race remains: OpenCode v1.18.4 ultimately fetches and pushes by mutable branch name, so a branch can theoretically move after verification and before fetch or push. Execution is not immutable by SHA unless upstream changes this behavior; all such branches need equivalent protection where appropriate, and final human diff review remains mandatory.
- OpenCode sessions are never shared. The workflow downloads OpenCode v1.18.4 and verifies its pinned SHA-256 digest.
- OpenCode can create or update a branch and pull request but has no merge operation in its configured toolset. Protected branch rules provide the final merge boundary.
- A commenter must have effective repository `write` or `admin` permission in addition to the GitHub comment association gate.

Role vars, host vars, group vars, encrypted Vault ciphertext, and repository topology remain readable by explicit accepted decision because they help the agent create consistent roles. The read-only SNMP community in `roles/prometheus/files/generator.yml` is also an accepted risk. OAuth must use the dedicated agentic-coding account. Secrets must remain encrypted or supplied through environments.

## Local OpenCode

The repository `opencode.json` only disables session sharing. Local OpenCode sessions otherwise retain the user's normal providers, models, built-in build agent, tools, formatter, and LSP behavior, allowing broader local changes when the operator chooses.

The `github-plan` and `github-build` agents remain available locally but are not selected by default. The GitHub workflow injects the complete restrictive policy through `OPENCODE_CONFIG_CONTENT`. The auto-discovered guard plugin returns no hooks unless `GITHUB_ACTIONS` is exactly `true`, so it does not constrain local tools or paths.

## Required Repository Settings

Do not use build mode until all settings in this section are active.

Create two GitHub environments:

- `opencode-plan` has no required reviewer and contains only its copy of the four OAuth component secrets.
- `opencode-build` has a required reviewer, disables administrator bypass, and contains a separate copy of the four OAuth component secrets.

The installed OpenCode GitHub App must be installed only for this repository and have no branch/ruleset bypass. Both modes use the App through OIDC so App-created changes trigger normal pull-request validation workflows. The official App's installation token has App-defined permissions that cannot be reduced by per-job GitHub Actions permissions; owner-only plans remain read-only through the pinned OpenCode binary and the `github-plan` tool policy.

Create a ruleset or branch protection rule for `main` with:

- Pull requests required before merging.
- Code owner review enabled. The current zero-approval policy permits the repository owner to merge their own pull requests after required checks pass.
- Stale approvals dismissed when new commits are pushed.
- All conversations resolved before merging.
- `validate` and `actionlint` from GitHub Actions required.
- Force pushes and branch deletion blocked.
- Rule bypass disabled, including for administrators.

Do not enable the repository-wide "Allow GitHub Actions to create and approve pull requests" setting for OpenCode. The installed App creates pull requests instead. Required checks, code-owner settings, and no bypass remain mandatory. Confirm neither workflows nor the App can satisfy required human review when approvals are required.

Issues must be enabled and limited to collaborators. After every environment, secret, Actions, and branch/ruleset control is verified, create the Actions repository variable `OPENCODE_BUILD_ENABLED` with value `true` as the final activation step. Build remains skipped while this variable is absent or has any other value.

## ChatGPT Authentication

OpenCode uses ChatGPT Plus or Pro OAuth, not an OpenAI API key. Add these four environment secrets separately to both `opencode-plan` and `opencode-build`:

- `OPENAI_OAUTH_ACCESS_TOKEN`
- `OPENAI_OAUTH_REFRESH_TOKEN`
- `OPENAI_OAUTH_EXPIRES`
- `OPENAI_OAUTH_ACCOUNT_ID`

Obtain the values from the `openai` entry created by a local OpenCode `/connect` authentication. `OPENAI_OAUTH_EXPIRES` is the non-negative integer expiration value. Never add the complete auth JSON as a structured GitHub secret. The workflow requires every component, constructs the exact JSON only on the runner, masks it before writing `OPENCODE_AUTH_CONTENT` to `GITHUB_ENV`, and never exposes OAuth secrets to the authorization job.

OAuth refreshes performed by ephemeral runners are not persisted to GitHub. If authentication expires or is rotated, authenticate locally again and replace all four values in both environments together. Rotate both environment copies immediately if any component may have been exposed.

## Commands

GitHub defaults use Sol for owner-only planning and Terra for approved contributor builds:

```text
/oc plan describe how to add a new role
/oc build implement the approved role
```

Override the model with one of `sol`, `terra`, or `luna`:

```text
/oc plan --model sol investigate this failure
/opencode build --model luna fix the documentation typo
```

The accepted syntax is:

```text
/oc <plan|build> [--model <sol|terra|luna>] <request>
```

Model names map to `openai/gpt-5.6-sol`, `openai/gpt-5.6-terra`, and `openai/gpt-5.6-luna`; arbitrary providers and model names are rejected in GitHub Actions. Plans are owner-only and may analyze fork PRs. Builds may operate only on issues and same-repository PRs that pass authorization and post-approval verification.

Use `plan` first for non-trivial work. Review the result in the GitHub thread, then issue a separate `build` command. Inspect the complete generated PR diff and wait for required CI before human approval.

When an authorized `/oc build` request is awaiting `opencode-build` approval, OpenCode adds or updates a comment on its source issue or pull request with a link to that workflow run. The deployment approval page also links back to the same authorized issue or pull request.

## Updating OpenCode

OpenCode is deliberately pinned by version and digest. To update it:

1. Review the upstream release and GitHub command implementation, including whether it still fetches PR heads by branch name.
2. Update all three download URLs and SHA-256 values: the plan and build entries in `.github/workflows/opencode.yml`, plus the policy smoke-test entry in `.github/workflows/workflow-lint.yml`.
3. Run `node --test .github/scripts/*.test.mjs`, the GitHub-policy smoke test, and workflow validation, then test plan and build commands on a non-production issue.
4. Review workflow logs for accidental secret disclosure before regular use.
