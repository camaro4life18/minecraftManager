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
            return data.get("dhcp_staticlist") or ""
        if "nvram_get" in data and isinstance(data.get("nvram_get"), dict):
            nested = data.get("nvram_get")
            if nested and "dhcp_staticlist" in nested:
                return nested.get("dhcp_staticlist") or ""
        for key, value in data.items():
            if "dhcp_staticlist" in str(key):
                return value or ""
    return ""


def _parse_staticlist(raw: str) -> List[Dict[str, str]]:
    reservations: List[Dict[str, str]] = []
    if not raw:
        return reservations

    entries = raw.split("<")
    for entry in entries:
        if not entry:
            continue
        parts = entry.split(">")
        if len(parts) >= 3:
            reservations.append({
                "mac": parts[0].upper(),
                "ip": parts[1],
                "name": parts[2]
            })
    return reservations


def _format_staticlist(reservations: List[Dict[str, str]]) -> str:
    return "".join(
        f"<{r['mac']}>{r['ip']}>{r.get('name', '')}"
        for r in reservations
    )


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
    async def _update(router: AsusRouter):
        data = await router.async_api_hook("nvram_get(dhcp_staticlist)")
        raw = _extract_staticlist(data)
        reservations = _parse_staticlist(raw)

        updated = False
        for reservation in reservations:
            if reservation["mac"].lower() == mac.lower():
                reservation["ip"] = ip
                reservation["name"] = name
                updated = True
                break

        if not updated:
            reservations.append({
                "mac": mac.upper(),
                "ip": ip,
                "name": name,
            })

        staticlist = _format_staticlist(reservations)
        commands = {
            "action_mode": "apply",
            "rc_service": "restart_dhcpd",
            "dhcp_staticlist": staticlist,
        }

        await router.async_api_command(commands, EndpointControl.COMMAND)
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
        run_async(_add_reservation(host, username, password, use_ssl, mac, ip, name))
        return jsonify({"success": True, "mac": mac.upper(), "ip": ip, "name": name})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    port = int(os.getenv("ROUTER_SERVICE_PORT", "7001"))
    app.run(host="0.0.0.0", port=port)
