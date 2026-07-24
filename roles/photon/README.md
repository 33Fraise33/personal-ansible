# Photon

Deploys [Photon](https://photon.komoot.io/) as a reverse-geocoding service for
Dawarich.

Photon joins the media host's existing Traefik Docker network, configured by
`photon_network` (the media network on VM02). It has no host-port publication
and does not depend on the services VLAN. Traefik exposes the API as HTTPS at
`photon_hostname` (`photon.frai.se`) and forwards requests to port 2322.

`photon_database_path` controls the host directory mounted at
`/photon/photon_data`. Photon downloads and stores a large OpenStreetMap
database there on its first start. Place this directory on storage that is not
backed up, such as the media disk. Photon can require substantial additional
disk space while applying updates.

The container uses Photon’s recommended continuous update configuration:
`PHOTON_UPDATE_STRATEGY=CONTINUOUS` and a `PHOTON_UPDATE_INTERVAL` of 3600
seconds. The pre-existing Traefik network must be available before deploying
this role.
