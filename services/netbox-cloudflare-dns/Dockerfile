FROM python:3.13-alpine
RUN addgroup -S netbox-dns && adduser -S -G netbox-dns netbox-dns
WORKDIR /app
COPY netbox_cloudflare_dns.py /app/
USER netbox-dns
ENTRYPOINT ["python", "/app/netbox_cloudflare_dns.py"]
CMD ["serve"]
