#!/bin/bash
# Simple DHCP restoration - directly add to router

ROUTER_HOST="192.168.1.1"
ROUTER_USER="camaro4life18"
ROUTER_PASS="camaro4life18"

echo "[*] Restoring DHCP reservations to router..."
echo ""

# Build the staticlist - FORMAT: MAC:IP:name\tMAC:IP:name\t...
# Using pipe-separated temp format to avoid shell parsing issues
SERVERS_DATA=(
    "88a29e0e24cb|192.168.1.225|IceMaker"
    "bc2411aa1d29|192.168.1.232|minecraft-velocity01"
    "bc241180183d|192.168.1.234|minecraft02"
    "1866da668631|192.168.1.55|Proxmox"
    "bc2411b004e0|192.168.1.240|dns01"
    "bc2411bddcb|192.168.1.241|dns02"
    "c6463fc252dd|192.168.1.177|host-177"
    "04421af1d2be|192.168.1.25|host-25"
    "3868a40eba4|192.168.1.165|host-165"
    "bc241153e934|192.168.1.253|host-253"
)

# Convert pipe format to colon format with proper MAC formatting
build_staticlist() {
    local list=""
    count=0
    for entry in "${SERVERS_DATA[@]}"; do
        mac_nocolon=$(echo "$entry" | cut -d'|' -f1)
        ip=$(echo "$entry" | cut -d'|' -f2)
        name=$(echo "$entry" | cut -d'|' -f3)
        
        # Format MAC properly: insert colons every 2 chars
        mac_formatted=$(echo "$mac_nocolon" | sed 's/\(..\)/\1:/g' | sed 's/:$//')
        
        entry_formatted="${mac_formatted}:${ip}:${name}"
        
        if [ -z "$list" ]; then
            list="$entry_formatted"
        else
            list="$list	$entry_formatted"
        fi
        
        echo "  + $name ($ip) = $mac_formatted"
        ((count++))
    done
    
    echo "$list"
}

echo "[1] Building DHCP entries..."
STATICLIST=$(build_staticlist)

echo ""
echo "[2] List size: ${#STATICLIST} bytes"
echo ""
echo "[3] Sending to router via curl..."

# URL encode the list
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$STATICLIST'''))")

curl -s -k -u "$ROUTER_USER:$ROUTER_PASS" \
  -X POST "https://$ROUTER_HOST/admin/nvramsetting.asp" \
  -d "action_mode=apply&action_script=&rc_service=restart_dhcpd&dhcp_staticlist=${ENCODED}" \
  -w "\nHTTP Status: %{http_code}\n" \
  -o /tmp/router_resp.txt

HTTP_CODE=$(tail -1 /tmp/router_resp.txt | grep -oP '\d+$')

if [ "$HTTP_CODE" = "200" ]; then
    echo "    ✓ Successfully restored to router (HTTP $HTTP_CODE)"
    echo ""
    echo "[✓] Done! Restored ${#SERVERS_DATA[@]} DHCP entries"
else
    echo "    ✗ Router returned HTTP $HTTP_CODE"
    echo "Response:"
    cat /tmp/router_resp.txt
    exit 1
fi
