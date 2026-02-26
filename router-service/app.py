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
    if isinstance(data, dict):
        if "dhcp_staticlist" in data:
            result = data.get("dhcp_staticlist") or ""
            print(f"[DHCP] _extract_staticlist: Found in top level: {repr(result[:200])}")
            return result
        if "nvram_get" in data and isinstance(data.get("nvram_get"), dict):
            nested = data.get("nvram_get")
            if nested and "dhcp_staticlist" in nested:
                result = nested.get("dhcp_staticlist") or ""
                print(f"[DHCP] _extract_staticlist: Found in nvram_get: {repr(result[:200])}")
                return result
        for key, value in data.items():
            if "dhcp_staticlist" in str(key):
                result = value or ""
                print(f"[DHCP] _extract_staticlist: Found in key '{key}': {repr(result[:200])}")
                return result
    print(f"[DHCP] _extract_staticlist: NOT FOUND in data: {list(data.keys()) if isinstance(data, dict) else type(data)}")
    return ""


def _parse_staticlist(raw: str) -> List[Dict[str, str]]:
    reservations: List[Dict[str, str]] = []
    if not raw:
        print(f"[DHCP] _parse_staticlist: Raw is empty")
        return reservations

    print(f"[DHCP] _parse_staticlist: Input (first 300 chars): {repr(raw[:300])}")
    
    # Try both formats: <MAC>IP>NAME and MAC:IP:NAME\t
    entries = []
    
    # Format 1: <MAC>IP>NAME delimeted
    if "<" in raw and ">" in raw:
        print(f"[DHCP] _parse_staticlist: Detected <> delimiter format")
        entries_raw = raw.split("<")
        for entry in entries_raw:
            if not entry:
                continue
            parts = entry.split(">")
            if len(parts) >= 3:
                entries.append({
                    "mac": parts[0].upper(),
                    "ip": parts[1],
                    "name": parts[2]
                })
    # Format 2: MAC:IP:NAME\t separated
    elif ":" in raw and "\t" in raw:
        print(f"[DHCP] _parse_staticlist: Detected colon:tab delimiter format")
        entries_raw = raw.split("\t")
        for entry in entries_raw:
            if not entry:
                continue
            parts = entry.split(":")
            if len(parts) >= 3:
                entries.append({
                    "mac": parts[0].upper(),
                    "ip": parts[1],
                    "name": parts[2]
                })
    # Format 3: MAC:IP:NAME separated (might have semicolon or other delimiter)
    elif ":" in raw:
        print(f"[DHCP] _parse_staticlist: Detected colon-separated format (no tabs)")
        # Try to split intelligently - might be MAC:IP:name;MAC:IP:name or other
        # First detect potential separator
        possible_separators = [";", "\n", " "]
        separator = None
        for sep in possible_separators:
            if sep in raw:
                separator = sep
                print(f"[DHCP] _parse_staticlist: Using separator '{repr(separator)}'")
                break
        
        if separator:
            entries_raw = raw.split(separator)
        else:
            # Single entry or unknown format
            entries_raw = [raw]
        
        for entry in entries_raw:
            if not entry or entry.isspace():
                continue
            parts = entry.split(":")
            if len(parts) >= 2:  # At least MAC:IP
                entries.append({
                    "mac": parts[0].upper(),
                    "ip": parts[1],
                    "name": parts[2] if len(parts) > 2 else ""
                })
    else:
        print(f"[DHCP] _parse_staticlist: WARNING - Unknown format, no recognized delimiters")
    
    print(f"[DHCP] _parse_staticlist: Parsed {len(entries)} entries")
    for i, e in enumerate(entries[:5]):  # Log first 5
        print(f"[DHCP]   Entry {i}: {e}")
    if len(entries) > 5:
        print(f"[DHCP]   ... and {len(entries) - 5} more")
    
    return entries


def _format_staticlist(reservations: List[Dict[str, str]]) -> str:
    # IMPORTANT: Router format should be MAC:IP:name with tab separators
    # NOT the <MAC>IP>NAME format from old code
    result = "\t".join(
        f"{r['mac']}:{r['ip']}:{r.get('name', '')}"
        for r in reservations
    )
    print(f"[DHCP] _format_staticlist: Input count: {len(reservations)}")
    print(f"[DHCP] _format_staticlist: Output (first 300 chars): {repr(result[:300])}")
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
    async def _fetch(router: AsusRouter):
        data = await router.async_api_hook("nvram_get(dhcp_staticlist)")
        raw = _extract_staticlist(data)
        return _parse_staticlist(raw)

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
    print(f"[DHCP] _add_reservation: Adding {mac} -> {ip} ({name})")
    
    async def _update(router: AsusRouter):
        print(f"[DHCP] _update: Fetching current dhcp_staticlist from router...")
        data = await router.async_api_hook("nvram_get(dhcp_staticlist)")
        raw = _extract_staticlist(data)
        print(f"[DHCP] _update: Raw staticlist length: {len(raw)} bytes")
        
        reservations = _parse_staticlist(raw)
        print(f"[DHCP] _update: Parsed {len(reservations)} existing reservations")

        updated = False
        for reservation in reservations:
            if reservation["mac"].lower() == mac.lower():
                print(f"[DHCP] _update: Updating existing reservation for {mac}")
                reservation["ip"] = ip
                reservation["name"] = name
                updated = True
                break

        if not updated:
            print(f"[DHCP] _update: Adding new reservation for {mac}")
            reservations.append({
                "mac": mac.upper(),
                "ip": ip,
                "name": name,
            })

        staticlist = _format_staticlist(reservations)
        print(f"[DHCP] _update: Sending {len(reservations)} total reservations back to router")
        print(f"[DHCP] _update: Formatted staticlist length: {len(staticlist)} bytes")
        
        commands = {
            "action_mode": "apply",
            "rc_service": "restart_dhcpd",
            "dhcp_staticlist": staticlist,
        }

        print(f"[DHCP] _update: Calling async_api_command with staticlist...")
        result = await router.async_api_command(commands, EndpointControl.COMMAND)
        print(f"[DHCP] _update: Command result: {result}")
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
