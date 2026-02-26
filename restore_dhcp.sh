#!/bin/bash
# Simple DHCP restoration via backend API

BACKEND_HOST="192.168.1.144:5000"
ROUTER_HOST="192.168.1.1"
ROUTER_USER="camaro4life18"
ROUTER_PASS="camaro4life18"

echo "[*] Restoring DHCP reservations..."

# List of servers to restore (mac:ip:name)
SERVERS=(
    "88:a2:9e:0e:24:cb:192.168.1.225:IceMaker"
    "bc:24:11:aa:1d:29:192.168.1.232:minecraft-velocity01"
    "bc:24:11:80:18:3d:192.168.1.234:minecraft02"
    "18:66:da:66:86:31:192.168.1.55:Proxmox"
    "bc:24:11:b0:04:e0:192.168.1.240:dns01"
    "bc:24:11:bd:dd:cb:192.168.1.241:dns02"
    "c6:46:3f:c2:52:dd:192.168.1.177:host-177"
    "04:42:1a:f1:d2:be:192.168.1.25:host-25"
    "38:68:a4:0e:ba:c4:192.168.1.165:host-165"
    "bc:24:11:53:e9:34:192.168.1.253:host-253"
)

ADDED=0
FAILED=0

for server in "${SERVERS[@]}"; do
    IFS=':' read -r mac ip name <<< "$server"
    
    echo "Adding $name ($ip) [$mac]..."
    
    curl -s -X POST "http://$BACKEND_HOST/api/router/dhcp" \
        -H "Content-Type: application/json" \
        -d "{\"mac\": \"$mac\", \"ip\": \"$ip\", \"name\": \"$name\"}" \
        > /tmp/resp.json
    
    if grep -q "success" /tmp/resp.json 2>/dev/null; then
        echo "  ✓ Added"
        ((ADDED++))
    else
        echo "  ✗ Failed"
        cat /tmp/resp.json
        ((FAILED++))
    fi
done

echo ""
echo "Results: Added=$ADDED, Failed=$FAILED"
