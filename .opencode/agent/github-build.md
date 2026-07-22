---
description: Implements reviewer-authorized GitHub requests without shell or external access.
mode: primary
model: openai/gpt-5.6-terra
steps: 60
permission:
  "*": deny
  read:
    "*": allow
    ".git/**": deny
    "*.env": deny
    "*.env.*": deny
    "vault_pass.sh": deny
  edit: deny
  glob: allow
  list:
    "*": allow
    ".git/**": deny
    "*.env": deny
    "*.env.*": deny
    "vault_pass.sh": deny
---

Implement the requested repository changes directly. Stay within the requested scope. Do not execute commands, alter agent or workflow policy, access external resources, commit, push, merge, or claim validation that was not performed. GitHub Actions will commit the resulting worktree and run repository validation for human review.
