#!/usr/bin/env python3
"""Assemble the original HUD V2 ZIP from its GitHub-safe transfer parts."""
from pathlib import Path
import base64
import hashlib
import zipfile

root = Path(__file__).resolve().parent
parts = sorted((root / "_transfer_parts").glob("bridge_hud_v2_*.b64"))
assert len(parts) == 30, f"Expected 30 parts; got {len(parts)}"
data = base64.b64decode("".join(p.read_text(encoding="ascii").strip() for p in parts), validate=True)
sha = hashlib.sha256(data).hexdigest()
assert sha == "4540ea63e2659c485732d30bcdaaf42257eec4ef72dfbdf067b4ddbae9127e5a", f"SHA-256 mismatch: {sha}"
target = root / "hud_v2_complete_ascii.zip"
target.write_bytes(data)
with zipfile.ZipFile(target) as z:
    assert z.testzip() is None
    assert len(z.namelist()) == 49
print(f"Restored {target} ({len(data)} bytes), 49 entries, SHA256={sha}")
