# Personal Ansible Playbooks

These are my personal playbooks to host all kinds of items under frai.se and or unitix.be.

Feel free to take a look around. If you have any questions please let me know.

## Structure

### Overview
![Overview Image](https://i.imgur.com/lfj1ciX.png)

I'm aiming at running as much as possible in docker containers. Everything is hosted behind Cloudflare proxies for external connections. For internal connections the letsencrypt certificates provided by traefik make sure everything is also running fine. I have local dns entries in pihole for all my local sites to prevent items like Plex to use my external bandwith going to cloudflare and back.

### Networking
I have 3 vlans configured on my router,
- 1 for access - Vlan 50 (Phones, Laptops, desktops, entertainment,...)
- 1 for networkmanagement - Vlan 33 (Servers, switches, access points,...)
- 1 for docker containers - Vlan 333 (macvlan interface with as gateway the router, that way I can port forward and firewall my containers on my router and I don't have to look at the host firewall)

## Running a playbook
``eval `ssh-agent` ``   
`ssh-add <ssh-key here>`      
`ansible-playbook -i development playbooks/<playbook>.yaml` (vault pass is asked by default so --ask-vault-pass is not needed)

## Encrypting passwords
`ansible-vault encrypt_string`    
type in your ansible vault password (I use the same generated vault key for all my variables in this project and store the one password in my password manager.)
Next enter your variable to encrypt and press ctrl+d twice.

## Matrix Setup
- nginx serves frai.se => /.well-known/matrix/server redirects to https://matrix.frai.se:443
- matrix.frai.se directs directly towards the synapse server

## Todo
- Make my grafana dashboards managed by Ansible: [More Info](https://docs.ansible.com/ansible/latest/collections/community/grafana/grafana_dashboard_module.html)

