from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime, timedelta
import jwt
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

from database import get_db_connection, get_cursor, log_security_event
from security.hashing import hash_password, verify_password

router = APIRouter()

JWT_SECRET = os.environ.get("JWT_SECRET", "super_secret_jwt_key_secure_2026_default")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

class UserAuth(BaseModel):
    username: str
    password: str

def parse_user_agent(ua_string: str):
    if not ua_string:
        return "Unknown OS", "Unknown Browser"
    
    if "Windows" in ua_string:
        device = "Windows"
    elif "Macintosh" in ua_string or "Mac OS X" in ua_string:
        device = "macOS"
    elif "Linux" in ua_string:
        device = "Linux"
    elif "Android" in ua_string:
        device = "Android"
    elif "iPhone" in ua_string or "iPad" in ua_string:
        device = "iOS"
    else:
        device = "Other Device"
        
    if "Chrome" in ua_string and "Safari" in ua_string and "Edge" not in ua_string and "Edg" not in ua_string:
        browser = "Chrome"
    elif "Safari" in ua_string and "Chrome" not in ua_string:
        browser = "Safari"
    elif "Firefox" in ua_string:
        browser = "Firefox"
    elif "Edge" in ua_string or "Edg" in ua_string:
        browser = "Edge"
    else:
        browser = "Other Browser"
        
    return device, browser

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)


@router.post("/login")
def login(user: UserAuth, request: Request):
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        # Extract client details
        ua = request.headers.get("user-agent", "")
        device, browser = parse_user_agent(ua)
        ip_address = request.client.host if request.client else "Unknown IP"
        location = "College Network" if (ip_address == "127.0.0.1" or ip_address.startswith("192.168") or ip_address.startswith("10.")) else "External Network"
        
        now = datetime.utcnow()
        
        # 1. Check for lockouts
        cursor.execute("SELECT * FROM login_attempts WHERE username = %s", (user.username,))
        lock_record = cursor.fetchone()
        if lock_record and lock_record["locked_until"]:
            locked_until = lock_record["locked_until"]
            if now < locked_until:
                log_security_event(
                    username=user.username,
                    action="Failed Login - Account Locked",
                    ip_address=ip_address,
                    device=device,
                    browser=browser,
                    is_suspicious=True,
                    details=f"Locked until {locked_until}"
                )
                # Generic response to prevent enumeration, but alert user about lock
                remaining_sec = int((locked_until - now).total_seconds())
                remaining_min = max(1, remaining_sec // 60)
                raise HTTPException(
                    status_code=423,
                    detail=f"Account is temporarily locked due to too many failed login attempts. Try again in {remaining_min} minutes."
                )
                
        # 2. Query user
        cursor.execute("SELECT * FROM users WHERE username = %s", (user.username,))
        db_user = cursor.fetchone()
        
        # 3. Verify password
        if not db_user or not verify_password(user.password, db_user["password_hash"]):
            # Increment failed attempt count
            failed_count = 1
            if lock_record:
                failed_count = lock_record["failed_count"] + 1
                
            locked_until = None
            if failed_count >= 5:
                locked_until = now + timedelta(minutes=15)
                failed_count = 0 # reset count after locking
                
            cursor.execute(
                """
                INSERT INTO login_attempts (username, failed_count, locked_until)
                VALUES (%s, %s, %s)
                ON CONFLICT (username) DO UPDATE SET
                    failed_count = EXCLUDED.failed_count,
                    locked_until = EXCLUDED.locked_until
                """,
                (user.username, failed_count, locked_until)
            )
            conn.commit()
            
            details_msg = f"Failed count: {failed_count}"
            if locked_until:
                details_msg = f"Account Locked out for 15 minutes. Lock expires at {locked_until}"
                
            log_security_event(
                username=user.username,
                action="Failed Login Attempt",
                ip_address=ip_address,
                device=device,
                browser=browser,
                is_suspicious=True,
                details=details_msg
            )
            raise HTTPException(status_code=401, detail="Invalid username or password")
            
        if db_user.get("status") == "inactive":
            raise HTTPException(status_code=403, detail="Your account is inactive. Please contact the administrator.")
            
        jti = str(uuid.uuid4())
        
        # Reset failed login attempts on success
        cursor.execute(
            """
            INSERT INTO login_attempts (username, failed_count, locked_until)
            VALUES (%s, 0, NULL)
            ON CONFLICT (username) DO UPDATE SET
                failed_count = 0,
                locked_until = NULL
            """,
            (db_user["username"],)
        )
        
        # Save session to user_sessions
        cursor.execute(
            """
            INSERT INTO user_sessions (username, token_jti, device, browser, ip_address, last_active, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE)
            """,
            (db_user["username"], jti, device, browser, ip_address, now)
        )
        
        # Update user last login info
        cursor.execute(
            """
            UPDATE users SET
                last_login = %s,
                last_device = %s,
                last_browser = %s,
                last_location = %s
            WHERE username = %s
            """,
            (now, device, browser, location, db_user["username"])
        )
        conn.commit()
        
        user_role = "admin" if db_user["username"] == "admin" else "professor"
        
        log_security_event(
            username=db_user["username"],
            action="Successful Login",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=False,
            details=f"Session JTI: {jti} | Role: {user_role}"
        )
            
        access_token = create_access_token(data={"sub": db_user["username"], "jti": jti, "role": user_role})
        refresh_token = create_refresh_token(data={"sub": db_user["username"], "jti": jti, "role": user_role})
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer"
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record session. {e}")
    finally:
        conn.close()

class RefreshRequest(BaseModel):
    refresh_token: str

@router.post("/refresh")
def refresh_token(payload: RefreshRequest, request: Request):
    ip_address = request.client.host if request.client else "Unknown IP"
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    
    try:
        decoded = jwt.decode(payload.refresh_token, JWT_SECRET, algorithms=[ALGORITHM])
        if decoded.get("type") != "refresh":
            log_security_event(
                username=None,
                action="Failed Token Refresh - Invalid Type",
                ip_address=ip_address,
                device=device,
                browser=browser,
                is_suspicious=True,
                details="Supplied token is not of type 'refresh'"
            )
            raise HTTPException(status_code=401, detail="Invalid token type")
            
        jti = decoded.get("jti")
        username = decoded.get("sub")
        role = decoded.get("role")
        
        conn = get_db_connection()
        cursor = get_cursor(conn)
        cursor.execute("SELECT is_active FROM user_sessions WHERE token_jti = %s", (jti,))
        session = cursor.fetchone()
        conn.close()
        
        if not session or not session["is_active"]:
            log_security_event(
                username=username,
                action="Failed Token Refresh - Session Inactive",
                ip_address=ip_address,
                device=device,
                browser=browser,
                is_suspicious=True,
                details="Session was revoked or expired"
            )
            raise HTTPException(status_code=401, detail="Session expired or logged out")
            
        new_access = create_access_token(data={"sub": username, "jti": jti, "role": role})
        return {"access_token": new_access, "token_type": "bearer"}
        
    except jwt.ExpiredSignatureError:
        log_security_event(
            username=None,
            action="Failed Token Refresh - Token Expired",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=True,
            details="Expired signature"
        )
        raise HTTPException(status_code=401, detail="Refresh token has expired")
    except jwt.InvalidTokenError:
        log_security_event(
            username=None,
            action="Failed Token Refresh - Invalid Signature",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=True,
            details="Invalid token signature"
        )
        raise HTTPException(status_code=401, detail="Invalid refresh token")
