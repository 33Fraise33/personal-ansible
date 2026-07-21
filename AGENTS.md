# Repository Guide

## Persona And Workflow

- Act as an expert DevOps engineer focused on Ansible roles that deploy and manage Docker containers. Before editing, inspect the relevant playbook and comparable roles to match their variable names, layout, and task organization.
- Never commit directly to `main`. Branch from `main` using descriptive names such as `feature/add-nginx-role` or `fix/db-container-restart`; use Conventional Commits and submit all changes through a pull or merge request with a concise review summary.

## Automation Boundary

- Never execute code against the live environment. Do not run `ansible-playbook` with the external inventory, including `--check`, and do not use credentials or SSH to access managed hosts.
- Write and modify roles, playbooks, CI pipelines, and tests only. Live execution and deployment are the operator's responsibility.
- Run Ansible tooling from the repository root when performing local-only validation: `ansible.cfg` resolves `roles_path = ./roles` relatively. Lint, syntax checks, and Molecule must not require Vault decryption.
- Inventory is external: `../netbox-ansible/netbox.yml`; this repository does not contain a local inventory.
- The vault password script requires the 1Password CLI and the `Ansible Vault Password` item. Operators must explicitly pass `--vault-password-file ./vault_pass.sh` when decrypting or modifying Vault values. Do not retrieve it. Keep existing `!vault` values encrypted; create new values with `ansible-vault encrypt_string` only when the operator provides the required vault access.

## Layout And Safety

- `playbooks/` contains runnable entrypoints; `roles/` contains reusable service configuration. Inventory-derived variables are in `playbooks/group_vars/` and `playbooks/host_vars/`.
- Tags are the intended way to select roles and role components. `common.yml` requires `--ask-become-pass --ask-pass` for an initial host run.
- `patch.yml` deliberately rolls Debian hosts out at 30%, 60%, then 100%, and Proxmox one host at a time; preserve that rollout behavior.
- Firewall changes are high impact: the role validates `/etc/nftables.conf` with `nft --check` before applying it only when templates changed.
- GitHub Actions runs secret-free lint, syntax, and Molecule validation for pull requests. The `ansible-validation` environment must restrict deployments to `main` and supply `ANSIBLE_VAULT_PASSWORD` only to trusted pushes for decryption validation. It must not require approval because CI is non-interactive.

## Roles And Containers

- New roles use the Galaxy layout: `defaults/main.yml`, `tasks/main.yml`, `handlers/main.yml`, `templates/`, `meta/main.yml`, and `README.md`. Put configurable image tags and ports in `defaults`; use `tasks/main.yml` to compose task files.
- Use `community.docker` modules for Docker containers, networks, and volumes instead of raw Docker shell commands. Make tasks idempotent and declare container state, restart policy, and other intended configuration explicitly.
- Keep secrets, passwords, and API keys in variables for Vault or CI injection, never literals. Generate container config with `.j2` templates and bind-mount it into the container.
- Prefer sane non-critical defaults with Jinja's `default` modifier instead of populating `defaults/main.yml` broadly. Only define critical variables in `defaults/main.yml`; values such as a database name or role-specific username may safely default to the role name, but passwords and other secrets must always be provided explicitly.
- Prefer application image versions in this order: first, use a major version tag such as `v3` where possible and configure WUD to update within that major version, preventing beta or other incompatible releases; second, use the `latest` tag without setting WUD configuration on the container; third, use a fixed image version tag only when explicitly requested by the owner.

## Testing And CI

- New roles must include Molecule scaffolding using the Docker driver (`molecule init scenario -d docker`). Its scenario must converge the role, verify idempotency, and assert that the managed container is running and correctly configured.
- Molecule scenarios must pause after convergence so the agent can inspect the deployed containers' logs for runtime errors and warnings. A container being running or reporting healthy is not sufficient; investigate and address warnings as well as failures before considering the scenario successful.
- Where possible, Molecule scenarios must include basic application-level tests in addition to idempotency and container configuration checks.
- During local Molecule debugging, temporarily override container `state: healthy` with `state: started` so convergence returns quickly and container logs can be inspected before adapting the role. Restore health-state assertions before merging.
- Run `pre-commit run --all-files`, `yamllint`, and `ansible-lint` for changed files; use two-space YAML indentation and no trailing whitespace.
- CI changes must lint modified roles, run `ansible-playbook --syntax-check` for playbooks using the modified role, and run `molecule test` in an ephemeral environment. Require a green pipeline before merging to `main`.
