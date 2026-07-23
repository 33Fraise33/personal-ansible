# Dawarich

Deploys Dawarich's PostGIS database, web application, and Sidekiq worker on the existing Docker host.

The image defaults to the `latest` tag; review Dawarich release notes and back up the data before deployment.

The role intentionally reuses the shared `valkey` container through `redis://valkey:6379`. Dawarich uses logical databases 3, 4, and 5 for cache, jobs, and websockets respectively. The web container joins the existing `services` network for Valkey and Traefik; the database and worker remain on a private `dawarich` network.

Supply `dawarich_database_password` and `dawarich_secret_key_base` through Ansible Vault or CI variables. Define `authelia_oidc_clients.dawarich.client_id` and the single plaintext `authelia_oidc_clients.dawarich.client_secret` through Vault; the Dawarich role reuses these client details automatically.

Reverse geocoding defaults to the public Photon service. Set
`dawarich_photon_api_host`, `dawarich_photon_api_port`, and
`dawarich_photon_api_use_https` to use a self-hosted Photon instance.

Before deployment, define these variables in the target host or CI secret injection. Do not commit plaintext values:

```yaml
dawarich_database_password: !vault |
  ...
dawarich_secret_key_base: !vault |
  ...
authelia_oidc_clients:
  dawarich:
    client_id: dawarich
    client_secret: !vault |
      ...
```
