#!/usr/bin/env python3
"""
DHCP Recovery Script - Restore all lost server reservations to ASUS router
"""
import asyncio
import aiohttp
from asusrouter import AsusRouter
from asusrouter.modules.endpoint import EndpointControl

# Server list from MobaXterm with MAC addresses from ARP table
SERVERS_TO_RESTORE = [
    # Minecraft servers
    ("88:a2:9e:0e:24:cb", "192.168.1.225", "IceMaker"),
    ("bc:24:11:aa:1d:29", "192.168.1.232", "minecraft-velocity01"),
    ("bc:24:11:80:18:3d", "192.168.1.234", "minecraft02"),
    
    # Confirmed from ARP
    ("18:66:da:66:86:31", "192.168.1.55", "Proxmox"),
    ("bc:24:11:b0:04:e0", "192.168.1.240", "dns01"),
    ("bc:24:11:bd:dd:cb", "192.168.1.241", "dns02"),
    
    # From ARP but unknown names (will use IP as name)
    ("c6:46:3f:c2:52:dd", "192.168.1.177", "host-177"),
    ("04:42:1a:f1:d2:be", "192.168.1.25", "host-25"),
    ("38:68:a4:0e:ba:c4", "192.168.1.165", "host-165"),
    ("bc:24:11:53:e9:34", "192.168.1.253", "host-253"),
    
    # These are offline or not in ARP - will try to add anyway
    ("", "192.168.1.231", "pterodactyl"),
    ("", "192.168.1.233", "minecraft01"),
    ("", "192.168.1.235", "minecraft03"),
    ("", "192.168.1.236", "nitrox1"),
    ("", "192.168.1.157", "teamspeak"),
    ("", "192.168.1.36", "Sunkenland"),
    ("", "192.168.1.99", "Development"),
    ("", "192.168.1.243", "filamentdryer"),
    ("", "192.168.1.111", "flex"),
    ("", "192.168.1.144", "minecraft-manager"),
    ("", "192.168.1.26", "OpenEMR-Test"),
    ("", "192.168.1.98", "Rancher"),
    ("", "192.168.1.222", "Samba"),
    ("", "192.168.1.42", "Thor"),
    ("", "192.168.1.124", "Ubuntu"),
    ("", "192.168.1.75", "Voter"),
    ("", "192.168.1.57", "host-57"),
    ("", "192.168.1.100", "FPP"),
    ("", "192.168.1.189", "HomeAssistant"),
    ("", "192.168.1.82", "hotbox"),
    ("", "192.168.1.115", "HotTub"),
    ("", "192.168.1.180", "MagicMirror"),
    ("", "192.168.1.44", "OctoPrint"),
    ("", "192.168.1.13", "OpenSprinkler"),
    ("", "192.168.1.91", "plex-media"),
    ("", "192.168.1.9", "Pool Controller"),
    ("", "192.168.1.66", "PoolDisplay"),
    ("", "192.168.1.200", "kub01"),
    ("", "192.168.1.201", "kub02"),
    ("", "192.168.1.202", "kub03"),
    ("", "192.168.1.203", "kworker01"),
    ("", "192.168.1.204", "kworker02"),
    ("", "192.168.1.205", "kworker03"),
    ("", "192.168.1.211", "ansible"),
    ("", "192.168.1.210", "checkmk"),
    ("", "192.168.1.56", "proxmox2"),
    ("", "192.168.1.38", "zammad"),
    ("", "192.168.1.238", "dnslb1"),
    ("", "192.168.1.239", "dnslb2"),
    ("", "192.168.1.127", "haproxy2"),
    ("", "192.168.1.128", "haproxy3"),
]

async def restore_dhcp():
    """Restore all DHCP reservations"""
    router_host = "192.168.1.1"
    router_user = "camaro4life18"
    router_pass = "camaro4life18"
    
    session = aiohttp.ClientSession()
    router = AsusRouter(
        hostname=router_host,
        username=router_user,
        password=router_pass,
        use_ssl=True,
        session=session,
    )
    
    try:
        await router.async_connect()
        
        print("[*] Connected to router")
        print("[*] Fetching current DHCP static list...")
        
        # Get current staticlist
        data = await router.async_api_hook("nvram_get(dhcp_staticlist)")
        current_raw = data.get("dhcp_staticlist", "") if isinstance(data, dict) else ""
        
        print(f"[*] Current staticlist length: {len(current_raw)} bytes")
        print(f"[*] Current content: {current_raw[:100]}...")
        
        # Parse current list
        reservations = []
        if current_raw:
            # Parse tab-separated format
            for entry in current_raw.split("\t"):
                if entry and ":" in entry:
                    parts = entry.split(":")
                    if len(parts) >= 2:
                        reservations.append({
                            "mac": parts[0].upper(),
                            "ip": parts[1],
                            "name": parts[2] if len(parts) > 2 else ""
                        })
        
        print(f"[*] Parsed {len(reservations)} existing reservations")
        
        # Add new servers
        added_count = 0
        skipped_count = 0
        
        for mac, ip, name in SERVERS_TO_RESTORE:
            # Skip if no MAC (offline)
            if not mac:
                print(f"[!] SKIP: {name} ({ip}) - MAC unknown (offline)")
                skipped_count += 1
                continue
            
            # Check if already exists
            exists = False
            for res in reservations:
                if res["mac"].lower() == mac.lower() or res["ip"] == ip:
                    print(f"[+] ALREADY: {name} ({ip}) - {mac}")
                    exists = True
                    break
            
            if not exists:
                reservations.append({
                    "mac": mac.upper(),
                    "ip": ip,
                    "name": name
                })
                print(f"[+] ADDED: {name} ({ip}) - {mac}")
                added_count += 1
        
        # Format and send back
        staticlist = "\t".join(
            f"{r['mac']}:{r['ip']}:{r.get('name', '')}"
            for r in reservations
        )
        
        print(f"\n[*] Sending {len(reservations)} total reservations to router...")
        print(f"[*] Staticlist size: {len(staticlist)} bytes")
        
        commands = {
            "action_mode": "apply",
            "rc_service": "restart_dhcpd",
            "dhcp_staticlist": staticlist,
        }
        
        result = await router.async_api_command(commands, EndpointControl.COMMAND)
        
        print(f"[✓] Successfully restored DHCP reservations!")
        print(f"    - Added: {added_count}")
        print(f"    - Existing: {len(reservations) - added_count}")
        print(f"    - Skipped (offline): {skipped_count}")
        print(f"    - Total: {len(reservations)}")
        
    finally:
        await router.async_disconnect()
        await session.close()

if __name__ == "__main__":
    asyncio.run(restore_dhcp())
