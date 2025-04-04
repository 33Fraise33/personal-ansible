# Personal Ansible Playbooks

These are my personal playbooks to host all kinds of items under frai.se and or https://unitix.be (which is my freelance company).

Feel free to take a look around. If you have any questions please let me know.

## Structure

### Overview

Everything is running on 2 physical servers which are running Proxmox. 1 is in a datacenter in Oostkamp (mainly outbound network speed requirement), the other one is running at home. (mainly home automation and a secondary dns server). On Proxmox I run some virtual machines based on Debian (personal preference). 

Most of my workloads are containerized (multiple reasons for this, main one is being able to cleanup and start over without any hanging dependencies/files). Inbound connections are handled by cloudflared tunnels. Internal connections are handled by split DNS (unbound recursive dns + adguard) while the tls termination is done by Traefik with letsencrypt. 

This way local traffic does not use external bandwidth (going out and back in). I have been running and expanding this stack over the past years, running in 2 locations, one in Oostkamp on a single pro

### Networking
As a network engineer I prefer to segregate my network a bit more than normally the case. Each location has a management network, some vlans (per container use case - media, services, monitoring,...) and some test networks. At home everything routes back to my Mikrotik router while in the datacenter I use a Debian VM with FRR + ifupdown2 + nftables to manage everything. There I announce my own prefix, more info: https://github.com/33Fraise33/AS211184

## Ansible

### Running a playbook
``eval `ssh-agent` ``   
`ssh-add <ssh-key here>`      
`ansible-playbook -i ../netbox-ansible/netbox.yml playbooks/<playbook>.yml --tags <tags> --diff <--check>` (vault pass is handled by 1password cli)

### Encrypting passwords
`ansible-vault encrypt_string`
Next enter your variable to encrypt and press ctrl+d twice.

## Servicer Specific Info

### DNS
DNS is running in multiple stages.
- There is 1 unbound per physical location doing recursive resolving and dnssec validation. 
- Per physical location there is 1 adguard server which serves local dns records, does adblocking with oisd.nl and uses unbound as upstream server. 
- There is also a lancache playbook but as Valorant currently has issues this is not in use - also my upstream at home went from 100mbit to 500mbit so currently less of a requirement.

### Netbox

### Matrix Setup
- nginx serves frai.se => /.well-known/matrix/server redirects to https://matrix.frai.se:443
- matrix.frai.se directs directly towards the matrix server


