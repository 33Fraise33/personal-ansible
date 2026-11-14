# Series of Tubes relay

Deploys the official relay on BEOKPDCOVM04 with the public identity
`(BE) UNITIX - AS211184` and URL `wss://tubes.unitix.be/fed`. The upstream
`relay up` initializes a new server with `noLogs: true`; it has no `--no-logs`
flag. It uses open federation and English by default. The signed identity and
initial settings are not overwritten on subsequent runs. Changing them requires
upstream operator commands and the operator key.

Apply the Docker network and host firewall configuration before the role.
Traefik on the host connects to the bridge backend on port 8080; no port is
published by the relay. Its router disables access logs explicitly. Ensure
`tubes.unitix.be` points to this Traefik without a Cloudflare proxy, and verify
TLS, WebSocket connectivity, and logging on every proxy in the actual path.
The host bridge gateway addresses are the only extra trusted proxies; check the
source address seen by the relay before relying on forwarded client addresses.
Only trusted services should share the bridge.

On BEOKPDCOVM04, Traefik applies `internal-only` by default on `web-secure`
using the RFC1918 and AS211184 sets. A TCP SNI router forwards only
`tubes.unitix.be` to the loopback-only `tubes-public` entrypoint, preserving the
client address with PROXY protocol. The relay HTTP router explicitly uses that
entrypoint; newly discovered HTTP routers default to the restricted entrypoint.
The host defines these through `traefik_extra_entrypoints` and
`traefik_tcp_routers`; keep the loopback address and TCP target in sync.
Do not attach unrelated routers to `tubes-public`, and do not add TCP
passthrough routes that bypass the restriction. Local host processes can
connect to the loopback entrypoint and impersonate PROXY-protocol clients.
Other router-specific restrictions remain in effect; the local Hermes router
uses the internal-only policy instead of its previous management-only policy.
Public port 80, Traefik's administrative port 8080 and the loopback
entrypoint must not be exposed by other host or network configuration.
After applying Traefik and the relay, test external and internal client access,
different TLS SNI and HTTP Host combinations, WebSockets, preserved client IPs,
and the absence of access logs before exposing the service.

The input and forwarding rules silently block new bridge-originated IPv4 traffic
to RFC1918 and IPv6 traffic to `2001:678:1080::/48`, except ICMP and permitted
ICMPv6 traffic accepted by earlier rules; established replies remain permitted.
They do not guarantee isolation between containers on the same bridge
or block host addresses outside those ranges. The relay uses public DNS because the internal
resolvers are blocked. Apply and independently test the firewall before
starting the relay; existing connections remain permitted until they expire.

Back up `/data/docker-config/tubes/operator.key` securely offline immediately
after initial startup, then remove the host copy once verified; upstream
backups omit this key and it is not required for ordinary operation. Preserve
the remaining data directory and use `docker exec tubes-relay /relay backup
/data/backups/backup.tar.gz` for consistent backups. Do not expose the key in
logs. Check `docker logs tubes-relay` and `docker exec tubes-relay /relay status`.
For listing, the operator must independently verify the no-address-logs promise
along the complete request path, run `relay registry-file`, and submit its
signed output upstream. No listing is submitted by this role.

The corresponding router routes, assuming the next hops are reachable:

```
ip route 10.10.48.208/29 10.10.48.37
ipv6 route 2001:678:1080:2211::/64 2001:678:1080:2202::5
```
