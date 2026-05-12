from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt

from database import get_db_connection, get_cursor
from security.encryption import encrypt_data, decrypt_data
from routes.auth import JWT_SECRET, ALGORITHM

router = APIRouter()
security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[ALGORITHM])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

class StudentCreate(BaseModel):
    roll_number: str
    name: str
    sensitive_details: str

@router.post("/")
def add_student(student: StudentCreate, current_user: str = Depends(verify_token)):
    encrypted_details = encrypt_data(student.sensitive_details)
    
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        cursor.execute("INSERT INTO students (roll_number, name, encrypted_data) VALUES (%s, %s, %s)", 
                       (student.roll_number, student.name, encrypted_details))
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Roll number might already exist or DB error.")
    finally:
        conn.close()
    return {"message": "Student added successfully in an encrypted form"}

@router.get("/")
def get_students(current_user: str = Depends(verify_token)):
    conn = get_db_connection()
    cursor = get_cursor(conn)
    cursor.execute("SELECT * FROM students")
    students = cursor.fetchall()
    conn.close()
    
    result = []
    for s in students:
        try:
            decrypted_details = decrypt_data(s["encrypted_data"])
        except Exception:
            decrypted_details = "ERROR: Failed to decrypt data"
            
        result.append({
            "id": s["id"],
            "roll_number": s["roll_number"],
            "name": s["name"],
            "sensitive_details": decrypted_details
        })
        
    return result

@router.delete("/{student_id}")
def delete_student(student_id: int, current_user: str = Depends(verify_token)):
    conn = get_db_connection()
    cursor = get_cursor(conn)
    cursor.execute("DELETE FROM students WHERE id = %s", (student_id,))
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Student not found")
        
    return {"message": "Student deleted"}
