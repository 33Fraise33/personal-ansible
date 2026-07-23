# Photon

Deploys [Photon](https://photon.komoot.io/) as a reverse-geocoding service for
Dawarich.

`photon_database_path` controls the host directory mounted at
`/photon/photon_data`. Photon downloads and stores a large OpenStreetMap
database there on its first start. Place this directory on storage that is not
backed up, such as the media disk. Photon can require substantial additional
disk space while applying updates.

The container uses Photon’s recommended continuous update configuration:
`PHOTON_UPDATE_STRATEGY=CONTINUOUS` and a `PHOTON_UPDATE_INTERVAL` of 3600
seconds. Its API is published on `photon_port` (2322 by default); restrict
network access with the host firewall.
