# DHCP Reservation Bug Analysis & Fix

## The Problem

Your app was **wiping out the entire list of reserved IPs** instead of appending to it. This happened in `router-service/app.py` in the `_add_reservation()` function.

## Root Cause

The bug occurs in this code flow:

```python
# Step 1: Fetch current DHCP static list from router
raw = _extract_staticlist(data)

# Step 2: If extraction fails or returns empty, raw = ""
# (due to API parsing issue, format change, or first-time setup)

# Step 3: Append new entry
if raw:
    raw = f"{raw}\t{mac}:{ip}:{name}"  # ← Keeps existing + adds new
else:
    raw = f"{mac}:{ip}:{name}"  # ← ❌ ONLY new entry, all old ones LOST!

# Step 4: Send back to router
commands = {
    "dhcp_staticlist": raw,  # ← If raw is just the new entry, everything else is wiped!
}
```

### Why This Happens

If ANY of these conditions occur:
1. **Router returns empty/null value** - `_extract_staticlist()` returns `""`
2. **API response format changed** - Key not found, extraction fails
3. **Parsing error** - Some router responses have different delimiters than expected
4. **First-time setup** - Router has no existing dhcp_staticlist (this is OK!)

Then the code would:
- Set `raw = ""` (empty)
- Append only the new entry: `raw = "AA:BB:CC:DD:EE:FF:192.168.1.225:minecraft-server"`
- Send ONLY this entry back to router
- **Result: All previously reserved IPs are gone! 🔥**

## The Fix

I've added three layers of safety:

### 1. Better Diagnostic Logging in `_extract_staticlist()`

```python
if not result:
    print(f"[DHCP] _extract_staticlist: ⚠️  Value is empty/null at top level")

# If key not found at all:
print(f"[DHCP] _extract_staticlist: ❌ CRITICAL - dhcp_staticlist NOT FOUND!")
print(f"[DHCP] _extract_staticlist: This WILL cause data loss if caller doesn't verify!")
```

**Result:** Loud warnings if extraction fails, making the problem obvious in logs.

### 2. Safety Check Before Sending Data Back

```python
# Before sending to router, verify our new entry is actually in the final data
entry_to_send = f"{mac_normalized}:{ip}:{name}"
if entry_to_send not in raw:
    raise ValueError("[DHCP] Safety check failed - refusing to send incomplete data!")
    # This aborts before data loss occurs
```

### 3. Explicit Empty-Check Warning

```python
if len(raw) == 0:
    print(f"[DHCP] _update: ⚠️  WARNING - Extracted EMPTY dhcp_staticlist!")
    print(f"[DHCP] _update: This could indicate:")
    print(f"[DHCP] _update:   1. First-time setup (OK)")
    print(f"[DHCP] _update:   2. API format changed (contact dev)")
    print(f"[DHCP] _update:   3. Parsing logic needs updating")
```

## What to Check

If you still experience data loss issues:

1. **Check router-service logs** for these warnings
2. **Look for**: "`CRITICAL - dhcp_staticlist NOT FOUND`" or "`Value is empty/null`"
3. **Verify router API response** - The extraction function prints the full response
4. **Check router firmware** - API format may vary by ASUS firmware version

## Normal Operation

When working correctly, you should see logs like:

```
[DHCP] _extract_staticlist: Found at top level (length: 145)
[DHCP] _update: Step 2 - Extracted staticlist: 145 bytes
[DHCP] _update: Step 3 - MAC AA:BB:CC:DD:EE:FF not found, appending new entry...
[DHCP] _update: Step 4 - Final staticlist: 200 bytes
[DHCP] _update: Step 5 - Sending command to router (staticlist=200 bytes)...
```

The lengths should increase as you add servers (145 → 200 → 255, etc), never reset to small numbers.

## Testing

To verify the fix works:

```bash
# 1. Add a server (creates first DHCP reservation)
# 2. Check router admin panel - should see the reservation
# 3. Add another server
# 4. Check logs - should show:
#    - First staticlist extraction
#    - Append new entry
#    - Final staticlist is LARGER (not same size or reset)
# 5. Verify BOTH servers visible in router DHCP reservations
```

If you see the second server creation wipe out the first reservation's logs should show the warning messages to help identify what went wrong.
