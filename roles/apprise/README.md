# Apprise

Deploys `caronc/apprise:2` on the services network behind Traefik. WUD is
restricted to the `2` tag. This allows updates within major version 2; it does
not pin an immutable image digest.

## Configuration and secrets

The role renders `apprise_configurations` from `vars/main.yml` through the single
`templates/config.yml.j2` template into `{{ docker.dir.config }}/apprise`. The
existing five configurations are:

| ID | Destinations | Tags |
| --- | --- | --- |
| `docker` | Matrix `#docker-alerts:frai.se` | Untagged |
| `mikrotik` | Telegram `-782177075`, Matrix `#network-alerts:frai.se` | Telegram: `telegram`; Matrix: untagged |
| `rssalerts` | Matrix `#rss-alerts:frai.se` | Untagged |
| `tgamalerts` | Telegram `-782177075` | `telegram` |
| `unitix-gg` | Discord webhook `1314311385303351397` | `feed-general` |

Existing `/notify/<ID>` endpoints are preserved. Selecting `telegram` on
`mikrotik` targets only Telegram. Secrets are supplied through Apprise v2
environment template variables, not rendered into the notification files.
Telegram uses a non-secret placeholder in the base URL and overrides its complete
`bot_token` through a YAML setting: Apprise v2 rejects a template replacing the
entire token in the URL position during initial parsing.

Each configuration ID has a `services` list. Each service dictionary defines a
`url`, optional `tags` list, optional provider-specific `options`, and an optional
`secrets` mapping. For example:

```yaml
apprise_configurations:
  docker:
    services:
      - url: "matrixs://matrix.frai.se/#docker-alerts:frai.se"
        tags: []
        options:
          user: apprise
          password: "${MATRIX_PASSWORD}"
        secrets:
          matrix_password: "{{ apprise_matrix_password }}"
```

The generic template declares `matrix_password` under Apprise's `template:`,
renders the URL and options, and emits `tag:` only for nonempty tags. YAML
serialization handles quoting and indentation. The secret's value is injected as
`APPRISE_TEMPLATE_MATRIX_PASSWORD` into the container environment, never the YAML.
Secret names must be lowercase letters, digits, and underscores, starting with a
letter. Repeated secret names are deduplicated and must have identical values.
Use a distinct name if two services need different credentials. Secrets can be
encrypted directly within a service dictionary or reference the shared variables
below. A service without secrets does not require a `template:` section.

Populate these empty variables in `vars/main.yml` locally:

- `apprise_matrix_password`: password of the Matrix `apprise` user.
- `apprise_telegram_bot_token`: complete `5562462598:<secret>` token.
- `apprise_discord_webhook_token`: token portion of the Discord webhook URL.

Before committing or deploying, the operator must encrypt the values. Use
individual `!vault` values in the vars file. From the repository root,
encrypt each value with the explicit password-file argument, for example:

```sh
ansible-vault encrypt_string --vault-password-file ./vault_pass.sh --stdin-name apprise_matrix_password
```

Paste the generated variable block into `vars/main.yml` and repeat for the other
two variables. Individual encrypted values keep ordinary playbook syntax checks
secret-free; whole-file encryption would require decryption just to load the role.
The agent does not retrieve Vault credentials. Molecule uses higher-precedence
synthetic facts for the three shared credentials while loading the actual
configuration dictionaries. The role fails before making changes if a referenced
secret is empty or shared names have conflicting values. Secret-bearing tasks
suppress logs.

Ansible exclusively manages notification configuration files. On each deployment,
the role removes top-level `.cfg`, `.yaml`, and `.yml` files other than the exact
`<ID>.yml` filenames declared in `apprise_configurations`, then renders those files.
Removing or renaming an ID removes its old configuration. UI-created IDs are
removed and UI edits are overwritten on the next deployment. The UI remains
available. Configuration changes or removals trigger a restart; unchanged
deployments do not. Runtime directories and hidden application state are preserved.
Container environment comparisons are strict: removing a service secret also
removes its `APPRISE_TEMPLATE_*` variable from the container.

Host-specific defaults are `apprise_config_path`, `apprise_network`, and
`apprise_hostname`. A dedicated system user owns the configuration, attachment,
and store directories. The image supports an explicit numeric UID:GID, so all
container processes run as that user. `/config` stays writable for runtime
storage, browser session state, and UI operations. Attachments use `/config/attach`.

## One-time migration (operator only)

The role replaces the `config_apprise:/config` mount with a host bind mount. It
does not delete, automatically copy, or modify the existing Docker volume.

Before running the updated playbook:

1. Back up `config_apprise`, record the current image digest, and export all
   configuration IDs. Preserve the old image and volume for rollback.
2. Stop the old Apprise container to obtain a consistent copy of its state.
3. Create `{{ docker.dir.config }}/apprise` on the managed host and copy the
   complete contents of the old volume there, including hidden files and
   `store/`. Preserve Matrix session/encryption state, any per-ID authentication
   files, and browser signing state. Copy any persisted attachments into `attach/`.
4. Create the system user/group `apprise` if needed, and recursively assign the
   migrated files to it. The role sets ownership of managed files and directories
   but deliberately does not recursively change existing runtime state.
5. Populate/encrypt credentials, then run the playbook as the operator with
   the explicit Vault password-file argument. The five notification YAML files
   will be replaced with their Ansible-managed equivalents, and undeclared
   top-level notification configuration files will be removed.
6. Inspect container logs and `/status`, then send representative messages to
   all five IDs. Check Telegram formatting and Matrix encrypted delivery if
   applicable. Confirm `mikrotik` with `tag=telegram` targets only Telegram.

To roll back, stop the new container and restore the previous image and volume
mount. Do not combine this migration with enabling new API authentication or
changing tags; those require corresponding caller updates.

## Local validation

Run from the repository root, without external inventory or Vault access:

```sh
yamllint roles/apprise molecule/apprise playbooks/apprise.yml
ansible-lint roles/apprise molecule/apprise
ansible-playbook --syntax-check --inventory 'localhost,' playbooks/apprise.yml
molecule test --scenario-name apprise
```

Molecule uses an ephemeral Docker environment with synthetic secrets, checks
idempotency, pauses after convergence for log inspection, verifies container
configuration and parsed routes, and sends a notification to a local mock
receiver. It also tests configuration removal/renaming, obsolete file cleanup,
runtime data preservation, and removal of secrets from the actual container
environment. It never sends notifications to Matrix, Telegram, or Discord.
