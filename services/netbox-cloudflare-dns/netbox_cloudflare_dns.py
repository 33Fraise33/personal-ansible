"""Safely reconcile NetBox primary IP addresses into Cloudflare DNS."""
import argparse
import hmac
import ipaddress
import json
import logging
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

MARKER = "managed-by=netbox-cloudflare-dns"
LOG = logging.getLogger("netbox_cloudflare_dns")


class API:
    def __init__(self, base, token):
        self.base = base.rstrip("/")
        self.token = token

    def request(self, method, path, payload=None):
        body = json.dumps(payload).encode() if payload is not None else None
        request = Request(self.base + path, data=body, method=method)
        request.add_header("Authorization", "Bearer " + self.token)
        request.add_header("Content-Type", "application/json")
        for attempt in range(4):
            try:
                with urlopen(request, timeout=20) as response:
                    return json.load(response)
            except HTTPError as error:
                if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise
            except URLError:
                if attempt == 3:
                    raise
            time.sleep(2**attempt)
        raise RuntimeError("unreachable")

    def pages(self, path):
        while path:
            current_path = path
            result = self.request("GET", path)
            # NetBox calls use results/next; Cloudflare uses result/result_info.
            yield from result.get("results", result.get("result", []))
            path = result.get("next")
            info = result.get("result_info", {})
            if not path and info.get("page", 1) < info.get("total_pages", 1):
                separator = "&" if "?" in current_path else "?"
                path = current_path + separator + "page=" + str(info["page"] + 1)
            if path and path.startswith(self.base):
                path = path[len(self.base):]


def label(value):
    value = re.sub(r"[^a-z0-9-]+", "-", value.lower())
    value = re.sub(r"-+", "-", value).strip("-")
    if not value or len(value) > 63:
        raise ValueError("invalid DNS label")
    return value


def desired_records(objects, zone, excluded):
    records, names = {}, {}
    for index, obj in enumerate(objects):
        status = (obj.get("status") or {}).get("slug", "")
        if status in excluded:
            continue
        name = label(obj.get("name", ""))
        identity = (obj.get("url") or "", obj.get("id"), index)
        if name in names:
            raise ValueError("normalized DNS name collision: " + name)
        names[name] = identity
        for field, record_type in (("primary_ip4", "A"), ("primary_ip6", "AAAA")):
            primary = obj.get(field)
            if not primary:
                continue
            address = str(primary.get("address", "")).split("/", 1)[0]
            parsed = ipaddress.ip_address(address)
            if (record_type == "A") != (parsed.version == 4):
                raise ValueError("primary address family does not match " + field)
            records[(name + "." + zone, record_type)] = address
    return records


class Synchronizer:
    def __init__(self, config):
        self.config = config
        self.netbox = API(config["netbox_url"], config["netbox_token"])
        self.cloudflare = API("https://api.cloudflare.com/client/v4", config["cloudflare_token"])

    def sync(self):
        objects = list(self.netbox.pages("/api/dcim/devices/?limit=100"))
        objects += list(self.netbox.pages("/api/virtualization/virtual-machines/?limit=100"))
        desired = desired_records(objects, self.config["zone"], self.config["excluded_statuses"])
        zones = self.cloudflare.request("GET", "/zones?" + urlencode({"name": self.config["zone"]}))
        if len(zones.get("result", [])) != 1:
            raise ValueError("Cloudflare zone was not found uniquely")
        zone_id = zones["result"][0]["id"]
        existing = list(self.cloudflare.pages("/zones/%s/dns_records?per_page=100" % zone_id))
        by_key = {(r["name"], r["type"]): r for r in existing if r["type"] in ("A", "AAAA")}
        # Validate every desired key before performing the first mutation.
        for key in desired:
            current = by_key.get(key)
            if current is not None and current.get("comment") != MARKER:
                raise ValueError("manual DNS record conflicts with " + key[0])
        for key, content in desired.items():
            current = by_key.pop(key, None)
            payload = {"type": key[1], "name": key[0], "content": content,
                       "ttl": self.config["ttl"], "proxied": False, "comment": MARKER}
            if current is None:
                self.cloudflare.request("POST", "/zones/%s/dns_records" % zone_id, payload)
            elif any(current.get(k) != v for k, v in payload.items()):
                self.cloudflare.request("PUT", "/zones/%s/dns_records/%s" % (zone_id, current["id"]), payload)
        for record in by_key.values():
            if record.get("comment") == MARKER:
                self.cloudflare.request("DELETE", "/zones/%s/dns_records/%s" % (zone_id, record["id"]))
        LOG.info("reconciliation completed for %d desired records", len(desired))


def load_config():
    return json.loads(Path("/etc/netbox-dns/config.yml").read_text())


def serve(config):
    synchronizer = Synchronizer(config)
    synchronizer.sync()
    healthy = threading.Event()
    healthy.set()
    pending = threading.Event()

    def worker():
        while True:
            if pending.wait(config["interval"]):
                pending.clear()
                time.sleep(2)
            try:
                synchronizer.sync()
            except Exception:  # keep service available for the next retry
                LOG.exception("reconciliation failed")

    threading.Thread(target=worker, daemon=True).start()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200 if healthy.is_set() else 503)
            self.end_headers()

        def do_POST(self):
            if self.path != "/webhooks/netbox" or not hmac.compare_digest(
                    self.headers.get("Authorization", ""), "Bearer " + config["webhook_secret"]):
                self.send_response(401)
            else:
                pending.set()
                self.send_response(202)
            self.end_headers()

        def log_message(self, *_):
            return

    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()


def configure_netbox_events(config):
    """Maintain one webhook and one event rule per relevant object type."""
    token = __import__("os").environ.get("NETBOX_DNS_MAINTAINER_TOKEN")
    if not token:
        raise ValueError("NETBOX_DNS_MAINTAINER_TOKEN is required")
    api = API(config["netbox_url"], token)
    webhook_name = "netbox-cloudflare-dns"
    webhook_data = {
        "name": webhook_name,
        "payload_url": "http://netbox-dns:8080/webhooks/netbox",
        "http_method": "POST",
        "http_content_type": "application/json",
        "additional_headers": "Authorization: Bearer " + config["webhook_secret"],
        "enabled": True,
    }
    hooks = list(api.pages("/api/extras/webhooks/?name=" + webhook_name))
    if hooks:
        hook = api.request("PUT", "/api/extras/webhooks/%s/" % hooks[0]["id"], webhook_data)
    else:
        hook = api.request("POST", "/api/extras/webhooks/", webhook_data)
    for object_type in ("dcim.device", "dcim.interface", "virtualization.virtualmachine",
                        "virtualization.vminterface", "ipam.ipaddress"):
        name = "netbox-cloudflare-dns-" + object_type.replace(".", "-")
        data = {
            "name": name,
            "object_types": [object_type],
            "event_types": ["object_created", "object_updated", "object_deleted"],
            "action_type": "webhook",
            "action_object_type": "extras.webhook",
            "action_object_id": hook["id"],
            "enabled": True,
        }
        rules = list(api.pages("/api/extras/event-rules/?name=" + name))
        if rules:
            api.request("PUT", "/api/extras/event-rules/%s/" % rules[0]["id"], data)
        else:
            api.request("POST", "/api/extras/event-rules/", data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("serve", "sync", "configure-netbox-events"), nargs="?", default="serve")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    config = load_config()
    if args.command == "sync":
        Synchronizer(config).sync()
    elif args.command == "configure-netbox-events":
        configure_netbox_events(config)
    else:
        serve(config)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    main()
