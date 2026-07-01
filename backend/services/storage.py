import os
import requests

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET = "Audio_files"

def _headers() -> dict:
    return {"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"}

def enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)

def upload(object_path: str, content: bytes, content_type: str) -> str:
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{object_path}"
    r = requests.post(url, data=content, headers={**_headers(), "Content-Type": content_type})
    r.raise_for_status()
    return public_url(object_path)

def delete(object_path: str) -> None:
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}"
    requests.delete(url, json={"prefixes": [object_path]},
                    headers={**_headers(), "Content-Type": "application/json"})

def public_url(object_path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{object_path}"

def is_remote(filename: str) -> bool:
    return filename.startswith("http")

def path_from_url(url: str) -> str:
    marker = f"/object/public/{BUCKET}/"
    idx = url.find(marker)
    return url[idx + len(marker):] if idx != -1 else url
