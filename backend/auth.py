from datetime import datetime, timedelta, timezone

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from backend.config import ADMIN_EMAILS, GOOGLE_CLIENT_ID, JWT_EXPIRE_DAYS, JWT_SECRET

_bearer = HTTPBearer(auto_error=False)


def verify_google_token(credential: str) -> dict:
    """Call Google's tokeninfo endpoint to verify the ID token and extract claims."""
    resp = requests.get(
        "https://oauth2.googleapis.com/tokeninfo",
        params={"id_token": credential},
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    data = resp.json()

    if GOOGLE_CLIENT_ID and data.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Token audience mismatch")

    return {
        "sub":     data["sub"],
        "email":   data.get("email", ""),
        "name":    data.get("name", data.get("email", "").split("@")[0]),
        "picture": data.get("picture", ""),
    }


def create_app_token(sub: str, email: str, name: str) -> str:
    """Issue our own JWT with a 30-day expiry."""
    expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS)
    is_admin = email in ADMIN_EMAILS
    payload = {"sub": sub, "email": email, "name": name, "is_admin": is_admin, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """FastAPI dependency — decodes our JWT and returns {sub, email, name}."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        return {
            "sub":      payload["sub"],
            "email":    payload.get("email", ""),
            "name":     payload.get("name", ""),
            "is_admin": payload.get("is_admin", False),
        }
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalid or expired — please sign in again",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency — requires is_admin=True in JWT."""
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
