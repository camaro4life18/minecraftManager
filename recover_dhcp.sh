#!/bin/bash
# Recovery script to restore lost DHCP reservations

# Servers to restore (from MobaXterm sessions)
declare -A servers=(
    [IceMaker]="192.168.1.225"
    [pterodactyl]="192.168.1.231"
    [minecraft-velocity01]="192.168.1.232"
    [minecraft01]="192.168.1.233"
    [minecraft02]="192.168.1.234"
    [minecraft03]="192.168.1.235"
    [nitrox1]="192.168.1.236"
)

# Get MAC addresses from ARP table
echo "=== Current ARP Table ==="
cat /proc/net/arp | grep -E "192.168.1.(225|231|232|233|234|235|236)"

echo ""
echo "=== Checking which servers are reachable ==="

# Create recovery list
> /tmp/dhcp_recovery.txt

for name in "${!servers[@]}"; do
    ip=${servers[$name]}
    echo "Checking $name ($ip)..."
    
    # Try to ping
    if ping -c 1 -W 1 "$ip" &> /dev/null; then
        echo "  ✓ ONLINE - Attempting to get MAC address"
        # Try to get MAC via SSH
        mac=$(ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no "joseph@$ip" "cat /sys/class/net/eth0/address 2>/dev/null || cat /sys/class/net/ens3/address 2>/dev/null" 2>/dev/null)
        if [ ! -z "$mac" ]; then
            echo "  MAC: $mac"
            echo "$mac:$ip:$name" >> /tmp/dhcp_recovery.txt
        fi
    else
        echo "  ✗ OFFLINE - Checking ARP table"
        # Check if in ARP
        mac=$(grep "$ip" /proc/net/arp | awk '{print $4}')
        if [ ! -z "$mac" ]; then
            echo "  MAC (from ARP): $mac"
            echo "$mac:$ip:$name" >> /tmp/dhcp_recovery.txt
        else
            echo "  MAC: NOT FOUND"
        fi
    fi
done

echo ""
echo "=== Recovery List ==="
cat /tmp/dhcp_recovery.txt

echo ""
echo "=== Formatted for Router ==="
cat /tmp/dhcp_recovery.txt | tr '\n' '\t'
