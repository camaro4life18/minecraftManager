#!/bin/bash
# Full DHCP Recovery Script - Restore all servers from MobaXterm

cat > /tmp/all_servers.txt << 'EOF'
IceMaker:192.168.1.225
pterodactyl:192.168.1.231
minecraft-velocity01:192.168.1.232
minecraft01:192.168.1.233
minecraft02:192.168.1.234
minecraft03:192.168.1.235
nitrox1:192.168.1.236
teamspeak:192.168.1.157
UT99:192.168.1.241
Sunkenland:192.168.1.36
dns01:192.168.1.240
dns02:192.168.1.241
dnslb1:192.168.1.238
dnslb2:192.168.1.239
haproxy2:192.168.1.127
haproxy3:192.168.1.128
ansible:192.168.1.211
checkmk:192.168.1.210
Proxmox:192.168.1.55
proxmox2:192.168.1.56
zammad:192.168.1.38
FPP:192.168.1.100
HomeAssistant:192.168.1.189
hotbox:192.168.1.82
HotTub:192.168.1.115
MagicMirror:192.168.1.180
OctoPrint:192.168.1.44
OpenSprinkler:192.168.1.13
plex-media:192.168.1.91
Pool Controller:192.168.1.9
PoolDisplay:192.168.1.66
kub01:192.168.1.200
kub02:192.168.1.201
kub03:192.168.1.202
kworker01:192.168.1.203
kworker02:192.168.1.204
kworker03:192.168.1.205
192.168.1.150:192.168.1.150
192.168.1.156:192.168.1.156
192.168.1.175:192.168.1.175
192.168.1.176:192.168.1.176
192.168.1.251:192.168.1.251
192.168.1.252:192.168.1.252
192.168.1.36:192.168.1.36
192.168.1.93:192.168.1.93
192.168.1.95:192.168.1.95
Development:192.168.1.99
filamentdryer:192.168.1.243
flex:192.168.1.111
minecraft-manager:192.168.1.144
OpenEMR-Test:192.168.1.26
Rancher:192.168.1.98
Samba:192.168.1.222
Thor:192.168.1.42
Ubuntu:192.168.1.124
Voter:192.168.1.75
192.168.1.57:192.168.1.57
EOF

echo "=== Building recovery list ==="
echo ""

# Get all ARP entries
cat > /tmp/arp_map.txt << 'EOF'
192.168.1.225 88:a2:9e:0e:24:cb
192.168.1.232 bc:24:11:aa:1d:29
192.168.1.234 bc:24:11:80:18:3d
192.168.1.240 bc:24:11:b0:04:e0
192.168.1.241 bc:24:11:bd:dd:cb
192.168.1.1 c8:7f:54:14:4d:80
192.168.1.55 18:66:da:66:86:31
192.168.1.253 bc:24:11:53:e9:34
192.168.1.177 c6:46:3f:c2:52:dd
192.168.1.25 04:42:1a:f1:d2:be
192.168.1.165 38:68:a4:0e:ba:c4
EOF

> /tmp/dhcp_recovery_full.txt

while IFS=':' read name ip; do
    # Look up MAC in ARP map
    mac=$(grep "^$ip " /tmp/arp_map.txt | awk '{print $2}')
    
    if [ ! -z "$mac" ]; then
        echo "$mac:$ip:$name" >> /tmp/dhcp_recovery_full.txt
        echo "✓ $name ($ip): $mac"
    else
        echo "? $name ($ip): NOT IN ARP"
    fi
done < /tmp/all_servers.txt

echo ""
echo "=== Recovery List Ready ==="
cat /tmp/dhcp_recovery_full.txt

echo ""  
echo "=== Format for Router API ==="
cat /tmp/dhcp_recovery_full.txt | tr '\n' '\t' && echo ""
