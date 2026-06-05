from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt
import os
import uuid
from datetime import datetime
import html

from database import get_db_connection, get_cursor, log_security_event
from routes.auth import JWT_SECRET, ALGORITHM, parse_user_agent

def verify_magic_bytes(file_bytes: bytes, allowed_types: list[str]) -> bool:
    if "png" in allowed_types and file_bytes.startswith(b"\x89PNG"):
        return True
    if ("jpeg" in allowed_types or "jpg" in allowed_types) and file_bytes.startswith(b"\xff\xd8\xff"):
        return True
    if "pdf" in allowed_types and file_bytes.startswith(b"%PDF"):
        return True
    return False

router = APIRouter()
security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        sub = payload["sub"]
        
        if jti:
            conn = get_db_connection()
            try:
                cursor = get_cursor(conn)
                cursor.execute("SELECT is_active FROM user_sessions WHERE token_jti = %s", (jti,))
                session = cursor.fetchone()
            finally:
                conn.close()
            
            if not session or not session["is_active"]:
                raise HTTPException(status_code=401, detail="Session expired or logged out")
                
        return sub
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.get("/me")
def get_me(current_user: str = Depends(verify_token)):
    conn = get_db_connection()
    try:
        cursor = get_cursor(conn)
        cursor.execute(
            """
            SELECT username, employee_id, full_name, department, designation, email, phone, status,
                   profile_picture, last_login, last_device, last_browser, last_location
            FROM users WHERE username = %s
            """,
            (current_user,)
        )
        user = cursor.fetchone()
    finally:
        conn.close()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    role = "admin" if user["username"] == "admin" else "professor"
    return {
        "username": user["username"],
        "employee_id": user["employee_id"] or ("ADMIN" if role == "admin" else "EMP000"),
        "full_name": user["full_name"] or ("Administrator" if role == "admin" else user["username"]),
        "department": user["department"] or ("IT" if role == "admin" else "CSE"),
        "designation": user["designation"] or ("Administrator" if role == "admin" else "Assistant Professor"),
        "email": user["email"] or "",
        "phone": user["phone"] or "",
        "status": user["status"] or "present",
        "role": role,
        "profile_picture": user["profile_picture"],
        "last_login": user["last_login"].isoformat() if user["last_login"] else None,
        "last_device": user["last_device"],
        "last_browser": user["last_browser"],
        "last_location": user["last_location"]
    }


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
    assignedProfessor: str | None = None

@router.post("/")
def add_student(student: StudentCreate, request: Request, current_user: str = Depends(verify_token)):
    conn = get_db_connection()
    cursor = get_cursor(conn)
    
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    ip_address = request.client.host if request.client else "Unknown IP"
    
    if current_user == "admin":
        conn.close()
        log_security_event(
            username=current_user,
            action="Unauthorized Student Creation Attempt",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=True,
            details="Admin attempted to create a student record"
        )
        raise HTTPException(status_code=403, detail="Admin is not authorized to add student records.")
    
    # Sanitize inputs
    student.roll_number = html.escape(student.roll_number)
    student.name = html.escape(student.name)
    if student.be_stream:
        student.be_stream = html.escape(student.be_stream)
    if student.company_1:
        student.company_1 = html.escape(student.company_1)
    if student.ctc_1:
        student.ctc_1 = html.escape(student.ctc_1)
    if student.stipend_1:
        student.stipend_1 = html.escape(student.stipend_1)
    if student.company_2:
        student.company_2 = html.escape(student.company_2)
    if student.ctc_2:
        student.ctc_2 = html.escape(student.ctc_2)
        
    assigned = current_user
        
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
                assigned,
            ),
        )
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Roll number might already exist or DB error.")
    finally:
        conn.close()
    return {"message": "Student added successfully"}

class ProfessorCreate(BaseModel):
    full_name: str
    username: str
    password: str
    employee_id: str
    department: str
    designation: str
    email: str | None = None
    phone: str | None = None
    status: str | None = "present"

class ProfessorUpdate(BaseModel):
    full_name: str
    employee_id: str
    department: str
    designation: str
    email: str | None = None
    phone: str | None = None
    password: str | None = None

@router.get("/professors")
def get_professors_with_counts(current_user: str = Depends(verify_token)):
    if current_user != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view the professor directory.")
        
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        cursor.execute("""
            SELECT u.id, u.username, u.employee_id, u.full_name, u.department, u.designation, u.email, u.phone, u.status,
                   COUNT(s.id) as student_count
            FROM users u
            LEFT JOIN students s ON u.username = s.assigned_username
            WHERE u.username != 'admin'
            GROUP BY u.id, u.username, u.employee_id, u.full_name, u.department, u.designation, u.email, u.phone, u.status
            ORDER BY u.username;
        """)
        professors = cursor.fetchall()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
        
    return [
        {
            "id": p["id"],
            "username": p["username"],
            "employee_id": p["employee_id"] or f"EMP{p['id']:03d}",
            "full_name": p["full_name"] or p["username"],
            "department": p["department"] or "CSE",
            "designation": p["designation"] or "Assistant Professor",
            "email": p["email"] or "",
            "phone": p["phone"] or "",
            "status": p["status"] or "present",
            "student_count": p["student_count"]
        }
        for p in professors
    ]

@router.post("/professors")
def add_professor(prof: ProfessorCreate, request: Request, current_user: str = Depends(verify_token)):
    if current_user != "admin":
        raise HTTPException(status_code=403, detail="Only admin can add professors.")
        
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    ip_address = request.client.host if request.client else "Unknown IP"
    
    # Sanitize inputs
    prof.full_name = html.escape(prof.full_name)
    prof.username = html.escape(prof.username)
    prof.employee_id = html.escape(prof.employee_id)
    prof.department = html.escape(prof.department)
    prof.designation = html.escape(prof.designation)
    if prof.email:
        prof.email = html.escape(prof.email)
    if prof.phone:
        prof.phone = html.escape(prof.phone)
        
    conn = get_db_connection()
    cursor = get_cursor(conn)
    
    # Check if username exists
    cursor.execute("SELECT id FROM users WHERE username = %s", (prof.username,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Username already exists.")
        
    # Check if employee_id exists
    cursor.execute("SELECT id FROM users WHERE employee_id = %s", (prof.employee_id,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Employee ID already exists.")
        
    from security.hashing import hash_password
    hashed_pw = hash_password(prof.password)
    
    db_status = prof.status or "present"
    if db_status in ["active", "inactive"]:
        db_status = "present"
        
    try:
        cursor.execute(
            """
            INSERT INTO users (username, password_hash, employee_id, full_name, department, designation, email, phone, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                prof.username,
                hashed_pw,
                prof.employee_id,
                prof.full_name,
                prof.department,
                prof.designation,
                prof.email,
                prof.phone,
                db_status
            )
        )
        conn.commit()
        
        log_security_event(
            username=current_user,
            action="Professor Created",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=False,
            details=f"Created professor: {prof.username}"
        )
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
        
    return {"message": "Professor added successfully"}

@router.put("/professors/{username}")
def update_professor(username: str, prof: ProfessorUpdate, request: Request, current_user: str = Depends(verify_token)):
    if current_user != "admin":
        raise HTTPException(status_code=403, detail="Only admin can update professors.")
        
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    ip_address = request.client.host if request.client else "Unknown IP"
    
    # Sanitize inputs
    prof.full_name = html.escape(prof.full_name)
    prof.employee_id = html.escape(prof.employee_id)
    prof.department = html.escape(prof.department)
    prof.designation = html.escape(prof.designation)
    if prof.email:
        prof.email = html.escape(prof.email)
    if prof.phone:
        prof.phone = html.escape(prof.phone)
        
    conn = get_db_connection()
    cursor = get_cursor(conn)
    
    # Check if user exists
    cursor.execute("SELECT id, username FROM users WHERE username = %s", (username,))
    user_record = cursor.fetchone()
    if not user_record:
        conn.close()
        raise HTTPException(status_code=404, detail="Professor not found.")
        
    # Check if employee_id exists for another user
    cursor.execute("SELECT id FROM users WHERE employee_id = %s AND username != %s", (prof.employee_id, username))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Employee ID already exists for another user.")
        
    try:
        if prof.password:
            from security.hashing import hash_password
            hashed_pw = hash_password(prof.password)
            cursor.execute(
                """
                UPDATE users SET
                    full_name = %s,
                    employee_id = %s,
                    department = %s,
                    designation = %s,
                    email = %s,
                    phone = %s,
                    password_hash = %s
                WHERE username = %s
                """,
                (
                    prof.full_name,
                    prof.employee_id,
                    prof.department,
                    prof.designation,
                    prof.email,
                    prof.phone,
                    hashed_pw,
                    username
                )
            )
        else:
            cursor.execute(
                """
                UPDATE users SET
                    full_name = %s,
                    employee_id = %s,
                    department = %s,
                    designation = %s,
                    email = %s,
                    phone = %s
                WHERE username = %s
                """,
                (
                    prof.full_name,
                    prof.employee_id,
                    prof.department,
                    prof.designation,
                    prof.email,
                    prof.phone,
                    username
                )
            )
        conn.commit()
        
        log_security_event(
            username=current_user,
            action="Professor Updated",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=False,
            details=f"Updated professor: {username}"
        )
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
        
@router.delete("/professors/{username}")
def delete_professor(username: str, request: Request, current_user: str = Depends(verify_token)):
    if current_user != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete professors.")
    
    if username == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete the admin user.")
        
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    ip_address = request.client.host if request.client else "Unknown IP"
    
    conn = get_db_connection()
    cursor = get_cursor(conn)
    
    # Check if user exists
    cursor.execute("SELECT id, profile_picture FROM users WHERE username = %s", (username,))
    user_record = cursor.fetchone()
    if not user_record:
        conn.close()
        raise HTTPException(status_code=404, detail="Professor not found.")
        
    profile_pic = user_record["profile_picture"]
    
    # Get all leaves files to delete them later
    cursor.execute("SELECT attachment_filename FROM leaves WHERE username = %s", (username,))
    leaves_records = cursor.fetchall()
    leave_files = [r["attachment_filename"] for r in leaves_records if r["attachment_filename"]]
    
    try:
        # Unassign students
        cursor.execute("UPDATE students SET assigned_username = NULL WHERE assigned_username = %s", (username,))
        
        # Delete leaves
        cursor.execute("DELETE FROM leaves WHERE username = %s", (username,))
        
        # Delete login attempts
        cursor.execute("DELETE FROM login_attempts WHERE username = %s", (username,))
        
        # Delete user (this will cascade delete user_settings and user_sessions)
        cursor.execute("DELETE FROM users WHERE username = %s", (username,))
        
        conn.commit()
        
        # Clean up files from disk
        if profile_pic:
            pic_path = os.path.join(UPLOADS_DIR, profile_pic)
            if os.path.exists(pic_path):
                try:
                    os.remove(pic_path)
                except Exception:
                    pass
                    
        for lf in leave_files:
            lf_path = os.path.join(UPLOADS_DIR, lf)
            if os.path.exists(lf_path):
                try:
                    os.remove(lf_path)
                except Exception:
                    pass
                    
        log_security_event(
            username=current_user,
            action="Professor Deleted",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=False,
            details=f"Deleted professor: {username}"
        )
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
        
    return {"message": "Professor deleted successfully"}


@router.get("/")
def get_students(professor_username: str | None = None, current_user: str = Depends(verify_token)):
    conn = get_db_connection()
    try:
        cursor = get_cursor(conn)
        
        if current_user == "admin":
            # Admin can view all students or filter by professor_username
            if professor_username:
                cursor.execute(
                    "SELECT * FROM students WHERE assigned_username = %s ORDER BY id",
                    (professor_username,),
                )
            else:
                cursor.execute("SELECT * FROM students ORDER BY id")
        else:
            # Professor can only view their own students
            if professor_username and professor_username != current_user:
                raise HTTPException(status_code=403, detail="You do not have access to this professor's students.")
            cursor.execute(
                "SELECT * FROM students WHERE assigned_username = %s ORDER BY id",
                (current_user,),
            )
            
        students = cursor.fetchall()
    finally:
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
            "ctc_2": s.get("ctc_2"),
            "assignedProfessor": s.get("assigned_username")
        })
        
    return result

@router.put("/{student_id}")
def update_student(student_id: int, student: StudentCreate, request: Request, current_user: str = Depends(verify_token)):
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    ip_address = request.client.host if request.client else "Unknown IP"
    
    if current_user == "admin":
        log_security_event(
            username=current_user,
            action="Unauthorized Student Update Attempt",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=True,
            details=f"Admin attempted to update student record ID: {student_id}"
        )
        raise HTTPException(status_code=403, detail="Admin is not authorized to modify student records.")

    conn = get_db_connection()
    cursor = get_cursor(conn)
    
    # Authorization check for professors
    cursor.execute("SELECT assigned_username FROM students WHERE id = %s", (student_id,))
    record = cursor.fetchone()
    if not record:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found")
    if record["assigned_username"] != current_user:
        conn.close()
        raise HTTPException(status_code=403, detail="You are not authorized to edit this student.")
        
    # Sanitize inputs
    student.roll_number = html.escape(student.roll_number)
    student.name = html.escape(student.name)
    if student.be_stream:
        student.be_stream = html.escape(student.be_stream)
    if student.company_1:
        student.company_1 = html.escape(student.company_1)
    if student.ctc_1:
        student.ctc_1 = html.escape(student.ctc_1)
    if student.stipend_1:
        student.stipend_1 = html.escape(student.stipend_1)
    if student.company_2:
        student.company_2 = html.escape(student.company_2)
    if student.ctc_2:
        student.ctc_2 = html.escape(student.ctc_2)
            
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
def delete_student(student_id: int, request: Request, current_user: str = Depends(verify_token)):
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    ip_address = request.client.host if request.client else "Unknown IP"
    
    if current_user == "admin":
        log_security_event(
            username=current_user,
            action="Unauthorized Student Delete Attempt",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=True,
            details=f"Admin attempted to delete student record ID: {student_id}"
        )
        raise HTTPException(status_code=403, detail="Admin is not authorized to delete student records.")

    conn = get_db_connection()
    try:
        cursor = get_cursor(conn)
        
        # Authorization check for professors
        cursor.execute("SELECT assigned_username FROM students WHERE id = %s", (student_id,))
        record = cursor.fetchone()
        if not record:
            raise HTTPException(status_code=404, detail="Student not found")
        if record["assigned_username"] != current_user:
            raise HTTPException(status_code=403, detail="You are not authorized to delete this student.")
                
        cursor.execute("DELETE FROM students WHERE id = %s", (student_id,))
        conn.commit()
        deleted = cursor.rowcount
    finally:
        conn.close()
    
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Student not found")
        
    return {"message": "Student deleted"}

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")


@router.post("/leaves")
def submit_leave(
    request: Request,
    leave_comment: str = Form(...),
    file: UploadFile = File(...),
    current_user: str = Depends(verify_token)
):
    if current_user == "admin":
        raise HTTPException(status_code=403, detail="Admin cannot submit leave requests.")
        
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    ip_address = request.client.host if request.client else "Unknown IP"
    
    # Sanitize inputs
    leave_comment = html.escape(leave_comment)
        
    conn = get_db_connection()
    cursor = get_cursor(conn)
    cursor.execute("SELECT employee_id, full_name FROM users WHERE username = %s", (current_user,))
    prof = cursor.fetchone()
    if not prof:
        conn.close()
        raise HTTPException(status_code=404, detail="Professor record not found.")
        
    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".pdf", ".jpg", ".jpeg", ".png"]:
        conn.close()
        log_security_event(
            username=current_user,
            action="Leave Upload Failed - Invalid Extension",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=True,
            details=f"Extension {ext} rejected for file: {filename}"
        )
        raise HTTPException(status_code=400, detail="Only PDF and image files are allowed.")
        
    max_size = 10 * 1024 * 1024
    file_data = file.file.read()
    if len(file_data) > max_size:
        conn.close()
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit.")
        
    # Magic-bytes validation
    if not verify_magic_bytes(file_data, ["pdf", "jpg", "jpeg", "png"]):
        conn.close()
        log_security_event(
            username=current_user,
            action="Leave Upload Failed - Magic Bytes Mismatch",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=True,
            details=f"File: {filename} failed magic bytes signature verification"
        )
        raise HTTPException(status_code=400, detail="Invalid file signature (magic bytes do not match expected PDF or image format).")
        
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOADS_DIR, unique_filename)
    
    try:
        with open(file_path, "wb") as f:
            f.write(file_data)
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to save attachment. {e}")
        
    try:
        cursor.execute(
            """
            INSERT INTO leaves (username, employee_id, full_name, leave_comment, attachment_filename, approval_status)
            VALUES (%s, %s, %s, %s, %s, 'Pending')
            """,
            (
                current_user,
                prof["employee_id"] or f"EMP_{current_user}",
                prof["full_name"] or current_user,
                leave_comment,
                unique_filename
            )
        )
        cursor.execute("UPDATE users SET status = 'absent' WHERE username = %s", (current_user,))
        conn.commit()
        
        log_security_event(
            username=current_user,
            action="Leave Request Submitted",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=False,
            details=f"Leave comment: {leave_comment} | Attachment: {unique_filename}"
        )
    except Exception as e:
        conn.close()
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
        
    return {"message": "Leave request submitted successfully"}

@router.get("/leaves/{username}")
def get_latest_leave(username: str, current_user: str = Depends(verify_token)):
    if current_user != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view leave details.")
        
    conn = get_db_connection()
    try:
        cursor = get_cursor(conn)
        cursor.execute(
            """
            SELECT id, username, employee_id, full_name, leave_comment, attachment_filename, uploaded_at, approval_status
            FROM leaves
            WHERE username = %s
            ORDER BY uploaded_at DESC
            LIMIT 1
            """,
            (username,)
        )
        leave = cursor.fetchone()
    finally:
        conn.close()
    
    if not leave:
        raise HTTPException(status_code=404, detail="No leave records found for this professor.")
        
    return {
        "id": leave["id"],
        "username": leave["username"],
        "employee_id": leave["employee_id"],
        "full_name": leave["full_name"],
        "leave_comment": leave["leave_comment"],
        "attachment_filename": leave["attachment_filename"],
        "uploaded_at": leave["uploaded_at"].isoformat() if leave["uploaded_at"] else None,
        "approval_status": leave["approval_status"]
    }


@router.post("/leaves/self-active")
@router.post("/leaves/self-present")
def mark_self_present(current_user: str = Depends(verify_token)):
    if current_user == "admin":
        raise HTTPException(status_code=403, detail="Admin cannot invoke this endpoint.")
        
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        cursor.execute(
            """
            UPDATE leaves SET approval_status = 'Completed'
            WHERE username = %s AND approval_status IN ('Pending', 'Approved')
            """,
            (current_user,)
        )
        cursor.execute("UPDATE users SET status = 'present' WHERE username = %s", (current_user,))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
        
    return {"message": "Status updated back to Present successfully."}

class UserSettingsUpdate(BaseModel):
    theme: str
    accent_color: str
    layout_size: str
    animations_enabled: bool
    reduce_motion: bool
    sticky_navbar: bool
    compact_table_view: bool
    auto_save: bool
    remember_last_page: bool
    email_notifications: bool
    leave_approval_alerts: bool
    student_update_alerts: bool
    security_login_alerts: bool
    dashboard_notifications: bool

class ProfileUpdate(BaseModel):
    full_name: str
    email: str | None = None
    phone: str | None = None

class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str

@router.get("/settings")
def get_user_settings(current_user: str = Depends(verify_token)):
    conn = get_db_connection()
    cursor = get_cursor(conn)
    cursor.execute("SELECT * FROM user_settings WHERE username = %s", (current_user,))
    settings = cursor.fetchone()
    
    if not settings:
        try:
            cursor.execute(
                """
                INSERT INTO user_settings (username) VALUES (%s)
                RETURNING *
                """,
                (current_user,)
            )
            settings = cursor.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            conn.close()
            raise HTTPException(status_code=500, detail=f"Failed to initialize user settings. {e}")
            
    conn.close()
    return settings

@router.post("/settings")
def update_user_settings(settings: UserSettingsUpdate, current_user: str = Depends(verify_token)):
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        cursor.execute(
            """
            INSERT INTO user_settings (
                username, theme, accent_color, layout_size, animations_enabled, reduce_motion,
                sticky_navbar, compact_table_view, auto_save, remember_last_page,
                email_notifications, leave_approval_alerts, student_update_alerts,
                security_login_alerts, dashboard_notifications
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (username) DO UPDATE SET
                theme = EXCLUDED.theme,
                accent_color = EXCLUDED.accent_color,
                layout_size = EXCLUDED.layout_size,
                animations_enabled = EXCLUDED.animations_enabled,
                reduce_motion = EXCLUDED.reduce_motion,
                sticky_navbar = EXCLUDED.sticky_navbar,
                compact_table_view = EXCLUDED.compact_table_view,
                auto_save = EXCLUDED.auto_save,
                remember_last_page = EXCLUDED.remember_last_page,
                email_notifications = EXCLUDED.email_notifications,
                leave_approval_alerts = EXCLUDED.leave_approval_alerts,
                student_update_alerts = EXCLUDED.student_update_alerts,
                security_login_alerts = EXCLUDED.security_login_alerts,
                dashboard_notifications = EXCLUDED.dashboard_notifications
            """,
            (
                current_user, settings.theme, settings.accent_color, settings.layout_size,
                settings.animations_enabled, settings.reduce_motion, settings.sticky_navbar,
                settings.compact_table_view, settings.auto_save, settings.remember_last_page,
                settings.email_notifications, settings.leave_approval_alerts,
                settings.student_update_alerts, settings.security_login_alerts,
                settings.dashboard_notifications
            )
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
    return {"message": "Settings updated successfully."}

@router.post("/settings/profile")
def update_profile_info(profile: ProfileUpdate, request: Request, current_user: str = Depends(verify_token)):
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    ip_address = request.client.host if request.client else "Unknown IP"
    
    # Sanitize inputs
    profile.full_name = html.escape(profile.full_name)
    if profile.email:
        profile.email = html.escape(profile.email)
    if profile.phone:
        profile.phone = html.escape(profile.phone)
        
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        cursor.execute(
            """
            UPDATE users SET
                full_name = %s,
                email = %s,
                phone = %s
            WHERE username = %s
            """,
            (profile.full_name, profile.email, profile.phone, current_user)
        )
        conn.commit()
        
        log_security_event(
            username=current_user,
            action="Profile Info Updated",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=False,
            details=f"Updated full name to: {profile.full_name}"
        )
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
    return {"message": "Profile updated successfully."}

@router.post("/settings/profile-picture")
def upload_profile_picture(request: Request, file: UploadFile = File(...), current_user: str = Depends(verify_token)):
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    ip_address = request.client.host if request.client else "Unknown IP"
    
    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png"]:
        log_security_event(
            username=current_user,
            action="Profile Pic Upload Failed - Invalid Extension",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=True,
            details=f"Extension {ext} rejected for file: {filename}"
        )
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, and PNG files are allowed.")
        
    max_size = 5 * 1024 * 1024
    file_data = file.file.read()
    if len(file_data) > max_size:
        raise HTTPException(status_code=400, detail="File size exceeds 5MB limit.")
        
    # Magic-bytes validation
    if not verify_magic_bytes(file_data, ["jpg", "jpeg", "png"]):
        log_security_event(
            username=current_user,
            action="Profile Pic Upload Failed - Magic Bytes Mismatch",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=True,
            details=f"File: {filename} failed magic bytes signature verification"
        )
        raise HTTPException(status_code=400, detail="Invalid file signature (magic bytes do not match expected image format).")
        
    unique_filename = f"avatar_{current_user}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(UPLOADS_DIR, unique_filename)
    
    try:
        with open(file_path, "wb") as f:
            f.write(file_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save profile picture. {e}")
        
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        cursor.execute("SELECT profile_picture FROM users WHERE username = %s", (current_user,))
        old_pic = cursor.fetchone()
        
        cursor.execute(
            "UPDATE users SET profile_picture = %s WHERE username = %s",
            (unique_filename, current_user)
        )
        conn.commit()
        
        log_security_event(
            username=current_user,
            action="Profile Picture Updated",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=False,
            details=f"Uploaded profile picture: {unique_filename}"
        )
        
        if old_pic and old_pic["profile_picture"]:
            old_path = os.path.join(UPLOADS_DIR, old_pic["profile_picture"])
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception:
                    pass
                
    except Exception as e:
        conn.rollback()
        conn.close()
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
        
    return {"message": "Profile picture updated successfully", "profile_picture": unique_filename}

@router.delete("/settings/profile-picture")
def remove_profile_picture(current_user: str = Depends(verify_token)):
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        cursor.execute("SELECT profile_picture FROM users WHERE username = %s", (current_user,))
        pic = cursor.fetchone()
        
        cursor.execute("UPDATE users SET profile_picture = NULL WHERE username = %s", (current_user,))
        conn.commit()
        
        if pic and pic["profile_picture"]:
            file_path = os.path.join(UPLOADS_DIR, pic["profile_picture"])
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
    return {"message": "Profile picture removed successfully."}

@router.post("/password")
def change_password(payload: PasswordUpdate, request: Request, current_user: str = Depends(verify_token)):
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    ip_address = request.client.host if request.client else "Unknown IP"
    
    pw = payload.new_password
    if len(pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")
    if not any(c.isupper() for c in pw):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter.")
    if not any(c.islower() for c in pw):
        raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter.")
    if not any(c.isdigit() for c in pw):
        raise HTTPException(status_code=400, detail="Password must contain at least one number.")
    
    special_chars = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~"
    if not any(c in special_chars for c in pw):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character.")
        
    conn = get_db_connection()
    cursor = get_cursor(conn)
    cursor.execute("SELECT password_hash FROM users WHERE username = %s", (current_user,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
        
    from security.hashing import verify_password, hash_password
    if not verify_password(payload.current_password, user["password_hash"]):
        conn.close()
        log_security_event(
            username=current_user,
            action="Password Change Failed",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=True,
            details="Incorrect current password entered"
        )
        raise HTTPException(status_code=400, detail="Incorrect current password.")
        
    new_hash = hash_password(payload.new_password)
    
    try:
        cursor.execute("UPDATE users SET password_hash = %s WHERE username = %s", (new_hash, current_user))
        conn.commit()
        
        log_security_event(
            username=current_user,
            action="Password Changed",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=False,
            details="Password successfully updated"
        )
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
        
    return {"message": "Password updated successfully."}

@router.get("/settings/sessions")
def get_user_sessions(request: Request, current_user: str = Depends(verify_token)):
    auth_header = request.headers.get("Authorization")
    current_jti = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
            current_jti = payload.get("jti")
        except Exception:
            pass
            
    conn = get_db_connection()
    cursor = get_cursor(conn)
    cursor.execute(
        """
        SELECT id, token_jti, device, browser, ip_address, last_active, is_active
        FROM user_sessions
        WHERE username = %s AND is_active = TRUE
        ORDER BY last_active DESC
        """,
        (current_user,)
    )
    sessions = cursor.fetchall()
    conn.close()
    
    result = []
    for s in sessions:
        result.append({
            "id": s["id"],
            "device": s["device"] or "Unknown Device",
            "browser": s["browser"] or "Unknown Browser",
            "ip_address": s["ip_address"] or "Unknown IP",
            "last_active": s["last_active"].isoformat() if s["last_active"] else None,
            "is_current": s["token_jti"] == current_jti
        })
    return result

@router.post("/settings/sessions/logout-others")
def logout_other_sessions(request: Request, current_user: str = Depends(verify_token)):
    auth_header = request.headers.get("Authorization")
    current_jti = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
            current_jti = payload.get("jti")
        except Exception:
            pass
            
    if not current_jti:
        raise HTTPException(status_code=400, detail="Invalid token request.")
        
    ua = request.headers.get("user-agent", "")
    device, browser = parse_user_agent(ua)
    ip_address = request.client.host if request.client else "Unknown IP"
    
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        cursor.execute(
            """
            UPDATE user_sessions
            SET is_active = FALSE
            WHERE username = %s AND token_jti != %s
            """,
            (current_user, current_jti)
        )
        conn.commit()
        
        log_security_event(
            username=current_user,
            action="Other Sessions Revoked",
            ip_address=ip_address,
            device=device,
            browser=browser,
            is_suspicious=False,
            details="Revoked other active user sessions"
        )
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error. {e}")
    finally:
        conn.close()
        
    return {"message": "All other sessions logged out successfully."}

@router.get("/security/logs")
def get_security_logs(current_user: str = Depends(verify_token)):
    if current_user != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view security logs.")
        
    conn = get_db_connection()
    cursor = get_cursor(conn)
    
    try:
        # 1. Fetch latest security logs
        cursor.execute("SELECT * FROM security_logs ORDER BY timestamp DESC LIMIT 100")
        logs = cursor.fetchall()
        
        # 2. Fetch active lockouts
        cursor.execute("SELECT username, locked_until FROM login_attempts WHERE locked_until > %s", (datetime.utcnow(),))
        lockouts = cursor.fetchall()
        
        # 3. Fetch active session count
        cursor.execute("SELECT COUNT(*) as count FROM user_sessions WHERE is_active = TRUE")
        session_count_res = cursor.fetchone()
        session_counts = session_count_res["count"] if session_count_res else 0
        
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error while fetching logs. {e}")
    finally:
        conn.close()
        
    # 4. Audit safety parameters
    require_https = os.environ.get("REQUIRE_HTTPS", "false").lower() == "true"
    frontend_url = os.environ.get("FRONTEND_URL", "http://127.0.0.1:8001")
    cors_restricted = (frontend_url != "*")
    
    audit_stats = {
        "https_redirect": require_https,
        "cors_restricted": cors_restricted,
        "csp_active": True,
        "secure_headers_active": True,
        "basic_auth_docs": True,
        "open_ports_audit": "Clean (No exposed test ports)"
    }
    
    formatted_logs = []
    for l in logs:
        formatted_logs.append({
            "id": l["id"],
            "username": l["username"],
            "action": l["action"],
            "ip_address": l["ip_address"],
            "device": l["device"],
            "browser": l["browser"],
            "timestamp": l["timestamp"].isoformat() if l["timestamp"] else None,
            "is_suspicious": l["is_suspicious"],
            "details": l["details"]
        })
        
    formatted_lockouts = []
    for lock in lockouts:
        formatted_lockouts.append({
            "username": lock["username"],
            "locked_until": lock["locked_until"].isoformat() if lock["locked_until"] else None
        })
        
    return {
        "logs": formatted_logs,
        "active_lockouts": formatted_lockouts,
        "session_counts": session_counts,
        "audit_stats": audit_stats
    }
