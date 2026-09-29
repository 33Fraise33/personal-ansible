# Immich

Deploys Immich, its PostgreSQL database, and the machine-learning service on
the shared `services` Docker network. Valkey is supplied separately by the
`valkey` role.

## Intel Arc acceleration

Set `immich_hardware_acceleration: true` for a host with an Intel GPU. The
role requires `/dev/dri/renderD128`, installs `firmware-intel-graphics`, and
passes `/dev/dri` with the host `video` and `render` group IDs to Immich.

For the Intel Arc A310 on `bejbegiavm01`, the Proxmox host must provide enough
PCI address space for the GPU. `pci=realloc=on` is required in the Proxmox
kernel command line. The guest must bind the A310 to `i915` and expose
`/dev/dri/renderD128` before this role runs.

The machine-learning container uses the `-openvino` image variant. The server
container receives the GPU for Quick Sync transcoding. In the Immich Admin UI,
set Hardware Acceleration to **Quick Sync** and enable hardware decoding if
desired; this setting remains owned by the UI.

Verify the host before deployment:

```bash
lspci -nnk -s 01:00.0
ls -la /dev/dri
vainfo --display drm --device /dev/dri/renderD128
intel_gpu_top -L
```

After deployment, verify OpenVINO and QSV while running an ML job and a video
transcode:

```bash
docker exec immich_machine_learning ls -la /dev/dri
docker logs --since 10m immich_machine_learning
docker logs --since 10m immich
sudo intel_gpu_top
```

## Ownership migration

The role creates a dedicated `immich` system user and runs the Immich server
and machine-learning service with its numeric UID:GID. On the first hardened
deployment it stops these containers and recursively transfers ownership of the
model cache and `immich_library_path` to that user. A marker named
`ownership-migrated-UID-GID` in `{{ docker.dir.config }}/immich` prevents
repeated recursive changes while automatically rerunning the migration if the
service UID or GID changes.

Remove the active marker before applying the role after restoring the model
cache or photo library, so their ownership is reconciled again.

The Immich PostgreSQL image must start as root to initialize its data directory.
Its supported entrypoint drops to its internal `postgres` user before starting
the database; the role does not override that mechanism.

Back up the database and photo library before the initial deployment. The
shared Valkey container is not modified by this role.
