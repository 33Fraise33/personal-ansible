# netbox_dns

Deploys the NetBox-to-Cloudflare DNS synchronizer. It publishes A and AAAA
records from device and VM primary addresses in `unitix.it`; private addresses
are intentionally included. Records without the service ownership comment are
never changed or deleted.

Provide vault-encrypted `netbox_dns_netbox_api_token`,
`netbox_dns_netbox_webhook_secret`, and `netbox_dns_cloudflare_api_token`.
The Cloudflare token requires `Zone:Read` and `DNS:Edit`, restricted to the
zone. The runtime NetBox account needs device, VM, and IP address view access.

Set `netbox_dns_configure_events: true` only with the temporary
`netbox_dns_maintainer_api_token`. That token needs webhook and event-rule
view/add/change/delete permissions and is used only by the one-shot container.
It creates subscriptions for device, interface, VM, VM interface, and IP
address create/update/delete events targeting
`http://netbox-dns:8080/webhooks/netbox` on the `services` network.

Create and delegate the `unitix.it` Cloudflare zone before deployment. Run a
manual reconciliation with `--tags netbox_dns_sync`.
