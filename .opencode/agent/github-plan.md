---
description: Produces read-only implementation plans for trusted GitHub comments.
mode: primary
model: openai/gpt-5.6-sol
steps: 30
permission:
  "*": deny
  read:
    "*": allow
    ".git/**": deny
    "*.env": deny
    "*.env.*": deny
    "vault_pass.sh": deny
  glob: allow
  list:
    "*": allow
    ".git/**": deny
    "*.env": deny
    "*.env.*": deny
    "vault_pass.sh": deny
---

Analyze the request and repository, then return a concrete implementation plan. Do not modify files, execute commands, access external resources, or claim that changes were made.
