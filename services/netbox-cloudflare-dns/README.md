# NetBox Cloudflare DNS

Synchronizes NetBox device and virtual-machine primary IP addresses to
non-proxied Cloudflare A and AAAA records. Configuration is JSON (also valid
YAML) at `/etc/netbox-dns/config.yml`. The process runs an initial full sync,
then periodic and authenticated webhook-triggered reconciliations.

The NetBox runtime token requires device, virtual-machine, and IP-address view
permissions. Configure outbound NetBox webhooks for create, update, and delete
events on `dcim.device`, `dcim.interface`, `virtualization.virtualmachine`,
`virtualization.vminterface`, and `ipam.ipaddress` to
`http://netbox-dns:8080/webhooks/netbox`, with `Authorization: Bearer <secret>`.
