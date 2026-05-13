from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt

from database import get_db_connection, get_cursor
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
    serial_no: int | None = None
    roll_number: str
    name: str
    be_stream: str | None = None
    first_offer: bool | None = None
    company_1: str | None = None
    ctc_1: str | None = None
    stipend_1: str | None = None
    second_offer: bool | None = None
    company_2: str | None = None
    ctc_2: str | None = None

@router.post("/")
def add_student(student: StudentCreate, current_user: str = Depends(verify_token)):
    
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        cursor.execute(
            """
            INSERT INTO students (
                serial_no, roll_number, name, be_stream, first_offer, company_1, ctc_1, stipend_1,
                second_offer, company_2, ctc_2, assigned_username
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                student.serial_no,
                student.roll_number,
                student.name,
                student.be_stream,
                student.first_offer,
                student.company_1,
                student.ctc_1,
                student.stipend_1,
                student.second_offer,
                student.company_2,
                student.ctc_2,
                current_user,
            ),
        )
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Roll number might already exist or DB error.")
    finally:
        conn.close()
    return {"message": "Student added successfully"}

@router.get("/")
def get_students(current_user: str = Depends(verify_token)):
    conn = get_db_connection()
    cursor = get_cursor(conn)
    cursor.execute(
        "SELECT * FROM students WHERE assigned_username = %s ORDER BY id",
        (current_user,),
    )
    students = cursor.fetchall()
    conn.close()
    
    result = []
    for s in students:
        result.append({
            "id": s["id"],
            "serial_no": s.get("serial_no"),
            "roll_number": s["roll_number"],
            "name": s["name"],
            "be_stream": s.get("be_stream"),
            "first_offer": s.get("first_offer"),
            "company_1": s.get("company_1"),
            "ctc_1": s.get("ctc_1"),
            "stipend_1": s.get("stipend_1"),
            "second_offer": s.get("second_offer"),
            "company_2": s.get("company_2"),
            "ctc_2": s.get("ctc_2")
        })
        
    return result

@router.put("/{student_id}")
def update_student(student_id: int, student: StudentCreate, current_user: str = Depends(verify_token)):
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        cursor.execute(
            """
            UPDATE students SET
                serial_no = %s,
                roll_number = %s,
                name = %s,
                be_stream = %s,
                first_offer = %s,
                company_1 = %s,
                ctc_1 = %s,
                stipend_1 = %s,
                second_offer = %s,
                company_2 = %s,
                ctc_2 = %s
            WHERE id = %s
            """,
            (
                student.serial_no,
                student.roll_number,
                student.name,
                student.be_stream,
                student.first_offer,
                student.company_1,
                student.ctc_1,
                student.stipend_1,
                student.second_offer,
                student.company_2,
                student.ctc_2,
                student_id,
            ),
        )
        conn.commit()
        updated = cursor.rowcount
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Update failed. Roll number might already exist.")
    finally:
        conn.close()
        
    if updated == 0:
        raise HTTPException(status_code=404, detail="Student not found")
        
    return {"message": "Student updated successfully"}

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
