# Photon

Deploys [Photon](https://photon.komoot.io/) as a reverse-geocoding service for
Dawarich.

Photon joins the media host's existing Traefik Docker network, configured by
`photon_network` (the media network on VM02). It has no host-port publication
and does not depend on the services VLAN. Traefik exposes the API as HTTPS at
`photon_hostname` (`photon.frai.se`) and forwards requests to port 2322.

`photon_database_path` controls the host directory mounted at `/photon/data`.
Photon downloads and stores a large OpenStreetMap
database there on its first start. Place this directory on storage that is not
backed up, such as the media disk. Photon can require substantial additional
disk space while applying updates.

The role creates a dedicated `photon` system user and owns the host data
directory with it. The image requires a root entrypoint to align its internal
account with `PUID` and `PGID`; it then starts Photon as that non-root account.

The container checks for sequential index updates every 30 days. Its initial
index download and extraction can take hours, so Ansible returns once the
container is running while Docker reports `starting` until the `/status` health
check succeeds. The pre-existing Traefik network must be available before
deploying this role.
