from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
import jwt

from database import get_db_connection
from security.hashing import hash_password, verify_password

router = APIRouter()

JWT_SECRET = "super_secret_jwt_key_secure_2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

class UserAuth(BaseModel):
    username: str
    password: str

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)

@router.post("/register")
def register(user: UserAuth):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE username = ?", (user.username,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Username already registered")
        
    hashed_pw = hash_password(user.password)
    try:
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (user.username, hashed_pw))
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=500, detail="Database Error")
    finally:
        conn.close()
    
    return {"message": "User registered successfully"}

@router.post("/login")
def login(user: UserAuth):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (user.username,))
    db_user = cursor.fetchone()
    conn.close()
    
    if not db_user or not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
        
    access_token = create_access_token(data={"sub": db_user["username"]})
    return {"access_token": access_token, "token_type": "bearer"}
