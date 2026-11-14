import os
import requests

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET = "Audio_files"

def _headers() -> dict:
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey": SUPABASE_SERVICE_KEY,
    }

def enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)

# (connect, read) seconds — a hung storage call must not hold an upload worker forever.
_TIMEOUT = (10, 300)

def upload(object_path: str, content, content_type: str) -> str:
    """content: bytes or an open binary file (streamed)."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{object_path}"
    r = requests.post(url, data=content, timeout=_TIMEOUT, headers={
        **_headers(),
        "Content-Type": content_type,
        "x-upsert": "true",
    })
    if not r.ok:
        raise Exception(f"Supabase Storage upload failed {r.status_code}: {r.text[:300]}")
    return public_url(object_path)

def upload_file(object_path: str, path: str, content_type: str) -> str:
    with open(path, "rb") as f:
        return upload(object_path, f, content_type)

def delete(object_path: str) -> None:
    delete_many([object_path])

def delete_many(object_paths: list[str]) -> None:
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}"
    for i in range(0, len(object_paths), 500):
        requests.delete(url, json={"prefixes": object_paths[i:i + 500]}, timeout=_TIMEOUT,
                        headers={**_headers(), "Content-Type": "application/json"})

def public_url(object_path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{object_path}"

def is_remote(filename: str) -> bool:
    return filename.startswith("http")

def path_from_url(url: str) -> str:
    marker = f"/object/public/{BUCKET}/"
    idx = url.find(marker)
    return url[idx + len(marker):] if idx != -1 else url
