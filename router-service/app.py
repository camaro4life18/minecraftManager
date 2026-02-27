import asyncio
import os
from typing import Any, Dict, List, Optional

import aiohttp
from flask import Flask, jsonify, request

from asusrouter import AsusRouter
from asusrouter.modules.endpoint import EndpointControl

app = Flask(__name__)


def run_async(coro):
    try:
        return asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()


def _extract_staticlist(data: Any) -> str:
    """Extract dhcp_staticlist from various response formats.
    
    The router API can return data in different formats:
    1. Direct dict with "dhcp_staticlist" key
    2. Nested under "nvram_get"
    3. Other key variations
    """
    result = ""
    
    if isinstance(data, dict):
        # Try direct key first
        if "dhcp_staticlist" in data:
            result = data.get("dhcp_staticlist") or ""
            print(f"[DHCP] _extract_staticlist: Found at top level (length: {len(result)})")
            return result
            
        # Try nested under nvram_get
        if "nvram_get" in data and isinstance(data.get("nvram_get"), dict):
            nested = data.get("nvram_get")
            if nested and "dhcp_staticlist" in nested:
                result = nested.get("dhcp_staticlist") or ""
                print(f"[DHCP] _extract_staticlist: Found in nvram_get (length: {len(result)})")
                return result
        
        # Try any key containing dhcp_staticlist
        for key, value in data.items():
            if "dhcp_staticlist" in str(key).lower():
                result = value or ""
                print(f"[DHCP] _extract_staticlist: Found in key '{key}' (length: {len(result)})")
                return result
    
    # Warn if data not found - this is critical!
    data_keys = list(data.keys()) if isinstance(data, dict) else type(data).__name__
    print(f"[DHCP] _extract_staticlist: WARNING - dhcp_staticlist NOT FOUND. Data structure: {data_keys}")
    print(f"[DHCP] _extract_staticlist: Full response: {data}")
    
    return ""


def _parse_staticlist(raw: str) -> List[Dict[str, str]]:
    """Parse dhcp_staticlist from router into individual reservations.
    
    Supports multiple formats:
    - MAC:IP:name\tMAC:IP:name\t... (preferred)
    - <MAC>IP>name (legacy)
    - Other separators
    """
    reservations: List[Dict[str, str]] = []
    
    if not raw or not raw.strip():
        print(f"[DHCP] _parse_staticlist: Raw is empty or whitespace")
        return reservations
    
    print(f"[DHCP] _parse_staticlist: Input length: {len(raw)} bytes, first 200 chars: {repr(raw[:200])}")
    
    # Try format 1: <MAC>IP>NAME delimited (legacy)
    if "<" in raw and ">" in raw:
        print(f"[DHCP] _parse_staticlist: Attempting <> delimiter format")
        try:
            entries_raw = raw.split("<")
            for entry in entries_raw:
                if not entry or not entry.strip():
                    continue
                parts = entry.split(">")
                if len(parts) >= 3:
                    mac = parts[0].strip().upper()
                    ip = parts[1].strip()
                    name = parts[2].strip()
                    if mac and ip:
                        reservations.append({"mac": mac, "ip": ip, "name": name})
            
            if reservations:
                print(f"[DHCP] _parse_staticlist: Successfully parsed {len(reservations)} entries using <> format")
                return reservations
        except Exception as e:
            print(f"[DHCP] _parse_staticlist: Error parsing <> format: {e}")
    
    # Try format 2: MAC:IP:NAME with tab/semicolon/newline separators
    if ":" in raw:
        print(f"[DHCP] _parse_staticlist: Attempting colon:separator format")
        
        # Detect separator
        separator = None
        if "\t" in raw:
            separator = "\t"
            print(f"[DHCP] _parse_staticlist: Detected TAB separator")
        elif ";" in raw:
            separator = ";"
            print(f"[DHCP] _parse_staticlist: Detected SEMICOLON separator")
        elif "\n" in raw:
            separator = "\n"
            print(f"[DHCP] _parse_staticlist: Detected NEWLINE separator")
        elif " " in raw and raw.count(" ") > raw.count(":"):
            # More spaces than colons suggests space separator
            separator = " "
            print(f"[DHCP] _parse_staticlist: Detected SPACE separator")
        else:
            # Single entry or unknown format
            print(f"[DHCP] _parse_staticlist: No separator found, treating as single entry")
            separator = None
        
        try:
            if separator:
                entries_raw = raw.split(separator)
            else:
                entries_raw = [raw]
            
            for entry in entries_raw:
                if not entry or not entry.strip():
                    continue
                
                parts = entry.split(":")
                if len(parts) >= 2:
                    mac = parts[0].strip().upper()
                    ip = parts[1].strip()
                    name = parts[2].strip() if len(parts) > 2 else ""
                    
                    # Validate MAC and IP format
                    if mac and ip:
                        reservations.append({"mac": mac, "ip": ip, "name": name})
                    else:
                        print(f"[DHCP] _parse_staticlist: Skipping invalid entry (no MAC or IP): {entry}")
            
            if reservations:
                print(f"[DHCP] _parse_staticlist: Successfully parsed {len(reservations)} entries using colon format")
                return reservations
        except Exception as e:
            print(f"[DHCP] _parse_staticlist: Error parsing colon format: {e}")
    
    # If we get here, we couldn't parse anything
    print(f"[DHCP] _parse_staticlist: WARNING - Could not parse any entries from raw data")
    print(f"[DHCP] _parse_staticlist: Parsed 0 entries")
    
    return reservations


def _format_staticlist(reservations: List[Dict[str, str]]) -> str:
    """Format reservations back to router dhcp_staticlist format.
    
    Uses MAC:IP:name with tab separators (no trailing tab).
    
    Args:
        reservations: List of reservation dicts with 'mac', 'ip', 'name' keys
        
    Returns:
        Formatted string ready for router API
    """
    if not reservations:
        print(f"[DHCP] _format_staticlist: No reservations to format")
        return ""
    
    # Build entries, filtering out any with missing MAC or IP
    entries = []
    for r in reservations:
        mac = r.get('mac', '').strip()
        ip = r.get('ip', '').strip()
        name = r.get('name', '').strip()
        
        if not mac or not ip:
            print(f"[DHCP] _format_staticlist: Skipping entry with missing MAC or IP: {r}")
            continue
        
        # Validate MAC format (should be XX:XX:XX:XX:XX:XX)
        if mac.count(':') != 5:
            print(f"[DHCP] _format_staticlist: WARNING - Invalid MAC format: {mac}")
        
        entries.append(f"{mac}:{ip}:{name}")
    
    # Join with tabs (no trailing tab)
    result = "\t".join(entries)
    
    print(f"[DHCP] _format_staticlist: Input reservations: {len(reservations)}")
    print(f"[DHCP] _format_staticlist: Valid entries: {len(entries)}")
    print(f"[DHCP] _format_staticlist: Output length: {len(result)} bytes")
    print(f"[DHCP] _format_staticlist: First 200 chars: {repr(result[:200])}")
    
    return result


async def _with_router(host: str, username: str, password: str, use_ssl: bool, fn):
    session = aiohttp.ClientSession()
    router = AsusRouter(
        hostname=host,
        username=username,
        password=password,
        use_ssl=use_ssl,
        session=session,
    )

    try:
        await router.async_connect()
        result = await fn(router)
        return result
    finally:
        try:
            await router.async_disconnect()
        except Exception as e:
            print(f"Error disconnecting router: {e}")
        try:
            await session.close()
        except Exception as e:
            print(f"Error closing session: {e}")


async def _get_reservations(host: str, username: str, password: str, use_ssl: bool):
    """Retrieve current DHCP reservations from router."""
    async def _fetch(router: AsusRouter):
        print(f"[DHCP] _fetch: Fetching dhcp_staticlist from router...")
        try:
            data = await router.async_api_hook("nvram_get(dhcp_staticlist)")
            raw = _extract_staticlist(data)
            reservations = _parse_staticlist(raw)
            print(f"[DHCP] _fetch: Retrieved {len(reservations)} reservations")
            for i, res in enumerate(reservations[:5]):
                print(f"[DHCP] _fetch:   [{i}] {res['mac']} -> {res['ip']} ({res.get('name', '')})")
            if len(reservations) > 5:
                print(f"[DHCP] _fetch:   ... and {len(reservations) - 5} more")
            return reservations
        except Exception as e:
            print(f"[DHCP] _fetch: ERROR - {e}")
            raise

    return await _with_router(host, username, password, use_ssl, _fetch)


async def _add_reservation(
    host: str,
    username: str,
    password: str,
    use_ssl: bool,
    mac: str,
    ip: str,
    name: str,
):
    """Add a DHCP reservation to the router without modifying existing ones.
    
    This function:
    1. Fetches current DHCP staticlist from router (raw)
    2. Appends new entry directly to the raw string
    3. Sends back to router
    
    CRITICAL: We do NOT parse/modify existing entries - just append the new one.
    This prevents data loss if parsing fails or format changes.
    """
    print(f"[DHCP] _add_reservation: Adding/updating {mac} -> {ip} ({name})")
    
    async def _update(router: AsusRouter):
        print(f"[DHCP] _update: Step 1 - Fetching current dhcp_staticlist from router...")
        
        try:
            data = await router.async_api_hook("nvram_get(dhcp_staticlist)")
            print(f"[DHCP] _update: Router API returned: {type(data).__name__}")
        except Exception as e:
            print(f"[DHCP] _update: ERROR fetching from router: {e}")
            raise
        
        raw = _extract_staticlist(data)
        print(f"[DHCP] _update: Step 2 - Extracted staticlist: {len(raw)} bytes")
        
        mac_normalized = mac.upper()
        
        # Check if this MAC already exists in the raw string (simple substring check)
        # Look for MAC:IP:name pattern
        mac_search = f"{mac_normalized}:"
        if mac_search in raw:
            print(f"[DHCP] _update: Step 3 - Found existing entry for {mac_normalized}, updating it...")
            # Simple approach: parse just enough to find and replace the entry
            entries_raw = raw.split("\t")
            updated = False
            
            for i, entry in enumerate(entries_raw):
                if entry.startswith(mac_normalized + ":"):
                    print(f"[DHCP] _update: Replacing: {entry}")
                    entries_raw[i] = f"{mac_normalized}:{ip}:{name}"
                    print(f"[DHCP] _update: With: {entries_raw[i]}")
                    updated = True
                    break
            
            if updated:
                raw = "\t".join(entries_raw)
        else:
            print(f"[DHCP] _update: Step 3 - MAC {mac_normalized} not found, appending new entry...")
            # Simply append the new entry
            # Use tab separator, but only if raw is not empty
            if raw:
                raw = f"{raw}\t{mac_normalized}:{ip}:{name}"
            else:
                raw = f"{mac_normalized}:{ip}:{name}"
            print(f"[DHCP] _update: Appended new entry")
        
        print(f"[DHCP] _update: Step 4 - Final staticlist: {len(raw)} bytes")
        print(f"[DHCP] _update: Content (first 200 chars): {repr(raw[:200])}")
        
        if not raw:
            raise ValueError("[DHCP] _update: Final staticlist is empty - refusing to write!")
        
        # Prepare command to send raw string back
        commands = {
            "action_mode": "apply",
            "rc_service": "restart_dhcpd",
            "dhcp_staticlist": raw,
        }
        
        print(f"[DHCP] _update: Step 5 - Sending command to router (staticlist={len(raw)} bytes)...")
        
        try:
            result = await router.async_api_command(commands, EndpointControl.COMMAND)
            print(f"[DHCP] _update: Step 6 - Command succeeded! Result: {result}")
        except Exception as e:
            print(f"[DHCP] _update: Step 6 - ERROR sending command to router: {e}")
            print(f"[DHCP] _update: Failed command: {commands}")
            raise
        
        return True

    return await _with_router(host, username, password, use_ssl, _update)


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/test")
def test_connection():
    payload = request.get_json(force=True) or {}
    host = payload.get("host")
    username = payload.get("username")
    password = payload.get("password")
    use_ssl = payload.get("useHttps", True)

    if not host or not username or not password:
        return jsonify({"success": False, "error": "Missing router credentials"}), 400

    try:
        print(f"Testing router connection to {host} (SSL: {use_ssl})")
        print(f"[DEBUG] Calling _get_reservations...")
        reservations = run_async(_get_reservations(host, username, password, use_ssl))
        print(f"Connection successful. Found {len(reservations)} reservations")
        return jsonify({
            "success": True,
            "message": f"Connected successfully. Found {len(reservations)} DHCP reservations.",
            "reservations": reservations,
        })
    except Exception as exc:
        error_msg = str(exc)
        print(f"Router connection failed: {error_msg}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": error_msg}), 500


@app.post("/dhcp-reservations")
def list_reservations():
    payload = request.get_json(force=True) or {}
    host = payload.get("host")
    username = payload.get("username")
    password = payload.get("password")
    use_ssl = payload.get("useHttps", True)

    if not host or not username or not password:
        return jsonify({"error": "Missing router credentials"}), 400

    try:
        reservations = run_async(_get_reservations(host, username, password, use_ssl))
        return jsonify({"success": True, "reservations": reservations})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/dhcp-reservation")
def add_reservation():
    payload = request.get_json(force=True) or {}
    host = payload.get("host")
    username = payload.get("username")
    password = payload.get("password")
    use_ssl = payload.get("useHttps", True)

    mac = payload.get("mac")
    ip = payload.get("ip")
    name = payload.get("name", "")

    if not host or not username or not password:
        return jsonify({"error": "Missing router credentials"}), 400

    if not mac or not ip:
        return jsonify({"error": "Missing mac or ip"}), 400

    try:
        print(f"[DHCP] add_reservation: Calling async _add_reservation...")
        result = run_async(_add_reservation(host, username, password, use_ssl, mac, ip, name))
        print(f"[DHCP] add_reservation: Success! Result: {result}")
        return jsonify({"success": True, "mac": mac.upper(), "ip": ip, "name": name})
    except Exception as exc:
        print(f"[DHCP] add_reservation: ERROR - {type(exc).__name__}: {exc}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"{type(exc).__name__}: {str(exc)}"}), 500


if __name__ == "__main__":
    port = int(os.getenv("ROUTER_SERVICE_PORT", "7001"))
    app.run(host="0.0.0.0", port=port)
