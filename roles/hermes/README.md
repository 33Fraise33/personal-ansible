# Hermes Agent

Deploys the official stable Docker image as an always-on Matrix gateway. It
uses `https://matrix.frai.se` and `@hermes:frai.se`; Matrix E2EE is required.
Hermes uses the `aiagents` Docker bridge. The dashboard listens on TCP 9119
inside the container, without a published host port; the API server is disabled.
The Docker health
check only verifies the CLI starts: it does not establish gateway readiness,
Matrix connectivity, encryption, or a working model provider.

Set `hermes_matrix_allowed_users` to a nonempty list of trusted full Matrix
user IDs in inventory before deployment. The role refuses an empty list. The
user allowlist applies to DMs as well as rooms; upstream's room allowlist does
not restrict two-person DMs. Do not enable Matrix or gateway allow-all settings.
The role needs Docker and `docker.dir.config` on the target; `hermes_data_path`
can override the data location. The 4 GiB memory limit is shared by Hermes and
commands it runs.

The dashboard uses Authelia OIDC with a public PKCE client (no client secret).
Set `authelia_hermes_allowed_user` to the exact Authelia username before
deploying Authelia; its Hermes policy denies everyone when the variable is
unset. Only this user may authorize, with two-factor authentication.

Before deploying Hermes, the operator must create the `aiagents` network through
the Docker role and apply the firewall role from `playbooks/common.yml`. The
firewall permits HTTPS on TCP 443; port 80 is not externally accessible.
Deploy `playbooks/traefik.yml` on BEOKPDCOVM04. Its host-networked Traefik uses
the Docker socket proxy on its dedicated bridge and can reach local bridge
addresses. The proxy allows connections from the bridge gateway; the host
firewall drops forwarded traffic to the proxy. Its read-only Docker API remains
accessible to local host processes. Traefik's administrative endpoint listens
on port 8080; the host firewall does not allow external access to it. The
existing DCO Traefik forwards Hermes traffic to this
instance over HTTPS.

For host-networked Traefik, the role sets `net.ipv4.ip_unprivileged_port_start`
to `80` on the host. This allows all unprivileged local processes, not just
Traefik, to bind ports 80 and above, including IPv4 and IPv6 port 443.

Access `https://hermes.frai.se` over the VPN. The DCO Traefik router restricts
dashboard access to management networks; the local router allows RFC1918 and
AS211184 sources when `traefik_internal_default` is enabled. The bridge backend uses unencrypted HTTP and
must not be exposed to untrusted bridge peers. The dashboard listens on IPv4;
Traefik supports IPv6 clients.

The initial configuration trusts the `aiagents` bridge's IPv4 and IPv6 gateway
addresses for forwarded headers. Verify the source address Hermes actually sees
when host-networked Traefik connects. Existing installations keep their
configuration: add the configured addresses to `dashboard.trusted_proxies`
before running the updated role, or it
will fail rather than replace interactive settings. Apply DNS, Authelia,
firewall and Traefik configuration before starting the new dashboard and test
the complete OIDC redirect and management-only access from both allowed and denied
networks. The username restriction is essential: dashboard users have full
agent control.

## First use

After an operator deploys `playbooks/hermes.yml` and connects to the host:

```sh
docker exec -it -u hermes hermes hermes model
docker exec -it -u hermes hermes hermes gateway setup
```

Select OpenAI Codex (ChatGPT subscription), complete the interactive login and
choose a model. Then select Matrix and provide the dedicated compatibility
token for `@hermes:frai.se`. The container environment supplies the homeserver,
bot ID and required user allowlist and takes precedence over `.env`; enter the
same values if the wizard asks. Never put tokens on a command line or in Git.
Follow the prompts for headless authentication and restart the container after
setup so the running gateway picks up the settings:

```sh
docker restart hermes
docker exec -u hermes hermes hermes gateway status
docker logs --tail 200 hermes
```

Invite the bot to a private encrypted room and test a new message. Verify the
bot's device in the Matrix client if necessary. The official image contains the
Matrix encryption dependencies. `MATRIX_E2EE_MODE=required` fails closed if
crypto cannot initialize; it does not itself require every room to be encrypted.
Use encrypted rooms for private messages and confirm the client displays its
encryption indicator. The bot's cross-signing recovery key, if configured,
belongs in the private Hermes data store, never in Ansible or Git. See the
[upstream Matrix guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/matrix).

The role seeds manual dangerous-command approvals and denies unattended
approvals only when `config.yaml` does not exist. It intentionally preserves
interactive configuration on subsequent runs. The role does not import an
existing Codex login. Subscription entitlements and rate limits apply.

## Security and operations

The upstream image requires a root entrypoint for initialization and UID/GID
remapping; supervised services drop to the dedicated Hermes user. The role does
not mount the Docker socket, SSH keys or other host paths. Agent commands run
inside the same container as Hermes and can access its writable data and
credentials; approval prompts are not a security sandbox. E2EE protects Matrix
transport, not data sent to the model provider.

Back up the data directory securely, including OAuth and Matrix tokens, Matrix
crypto store, and session history. Restore only while the container is stopped.
Losing the crypto store can require a fresh Matrix device and token; see the
upstream Matrix guide. Use a local filesystem suitable for SQLite WAL. Image
updates are external Docker image replacements, not `hermes update`.

Future work: isolated execution sandbox, tested backups, and monitoring. Do not
expose the dashboard or API beyond the management network without additional
access controls and TLS.
