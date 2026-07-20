# Repository Guide

## Persona And Workflow

- Act as an expert DevOps engineer focused on Ansible roles that deploy and manage Docker containers. Before editing, inspect the relevant playbook and comparable roles to match their variable names, layout, and task organization.
- Never commit directly to `main` or `master`. Branch from `master` using descriptive names such as `feature/add-nginx-role` or `fix/db-container-restart`; use Conventional Commits and submit all changes through a pull or merge request with a concise review summary.

## Automation Boundary

- Never execute code against the live environment. Do not run `ansible-playbook` with the external inventory, including `--check`, and do not use credentials or SSH to access managed hosts.
- Write and modify roles, playbooks, CI pipelines, and tests only. Live execution and deployment are the operator's responsibility.
- Run Ansible tooling from the repository root when performing local-only validation: `ansible.cfg` resolves `roles_path = ./roles` and `vault_password_file = ./vault_pass.sh` relatively.
- Inventory is external: `../netbox-ansible/netbox.yml`; this repository does not contain a local inventory.
- The vault password script requires the 1Password CLI and the `Ansible Vault Password` item. Do not retrieve it. Keep existing `!vault` values encrypted; create new values with `ansible-vault encrypt_string` only when the operator provides the required vault access.

## Layout And Safety

- `playbooks/` contains runnable entrypoints; `roles/` contains reusable service configuration. Inventory-derived variables are in `playbooks/group_vars/` and `playbooks/host_vars/`.
- Tags are the intended way to select roles and role components. `common.yml` requires `--ask-become-pass --ask-pass` for an initial host run.
- `patch.yml` deliberately rolls Debian hosts out at 30%, 60%, then 100%, and Proxmox one host at a time; preserve that rollout behavior.
- Firewall changes are high impact: the role validates `/etc/nftables.conf` with `nft --check` before applying it only when templates changed.
- No repository-defined CI or automated test suite exists. `ansible-lint` and `yamllint` are available through `requirements.txt`, but no project-specific invocation is configured.

## Roles And Containers

- New roles use the Galaxy layout: `defaults/main.yml`, `tasks/main.yml`, `handlers/main.yml`, `templates/`, `meta/main.yml`, and `README.md`. Put configurable image tags and ports in `defaults`; use `tasks/main.yml` to compose task files.
- Use `community.docker` modules for Docker containers, networks, and volumes instead of raw Docker shell commands. Make tasks idempotent and declare container state, restart policy, and other intended configuration explicitly.
- Keep secrets, passwords, and API keys in variables for Vault or CI injection, never literals. Generate container config with `.j2` templates and bind-mount it into the container.

## Testing And CI

- New roles must include Molecule scaffolding using the Docker driver (`molecule init scenario -d docker`). Its scenario must converge the role, verify idempotency, and assert that the managed container is running and correctly configured.
- Run `yamllint` and `ansible-lint` for changed Ansible and YAML files; use two-space YAML indentation and no trailing whitespace.
- CI changes must lint modified roles, run `ansible-playbook --syntax-check` for playbooks using the modified role, and run `molecule test` in an ephemeral environment. Require a green pipeline before merging to `master`.
- Since no CI configuration exists, add the required pipeline configuration as part of feature work that introduces or changes a role.
