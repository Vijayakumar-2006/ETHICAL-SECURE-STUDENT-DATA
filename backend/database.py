import psycopg2
import psycopg2.extras
import os
from dotenv import load_dotenv

# Load env file from backend root
load_dotenv()

# Set a default PostgreSQL connection string (adjust as needed for pgAdmin4 setup)
DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:Vijaya%4020@localhost:5432/postgres")

def get_db_connection():
    conn = psycopg2.connect(DB_URL)
    return conn

def get_cursor(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def init_db():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                serial_no INTEGER,
                roll_number TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                be_stream TEXT,
                first_offer BOOLEAN,
                company_1 TEXT,
                ctc_1 TEXT,
                stipend_1 TEXT,
                second_offer BOOLEAN,
                company_2 TEXT,
                ctc_2 TEXT,
                assigned_username TEXT
            )
        ''')
        # Lightweight migrations for existing databases.
        cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS serial_no INTEGER")
        cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS assigned_username TEXT")
        cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS be_stream TEXT")
        cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS first_offer BOOLEAN")
        cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS company_1 TEXT")
        cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS ctc_1 TEXT")
        cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS stipend_1 TEXT")
        cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS second_offer BOOLEAN")
        cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS company_2 TEXT")
        cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS ctc_2 TEXT")
        
        # User migrations for faculty info
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id TEXT UNIQUE")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present'")
        cursor.execute("ALTER TABLE users ALTER COLUMN status SET DEFAULT 'present'")
        
        # Prepopulate existing users data to avoid breakage and migrate to present
        cursor.execute("UPDATE users SET status = 'present' WHERE status IS NULL OR status = 'active' OR status = 'inactive'")
        cursor.execute("UPDATE users SET full_name = username WHERE full_name IS NULL AND username != 'admin'")
        cursor.execute("UPDATE users SET department = 'CSE' WHERE department IS NULL AND username != 'admin'")
        cursor.execute("UPDATE users SET designation = 'Assistant Professor' WHERE designation IS NULL AND username != 'admin'")
        cursor.execute("UPDATE users SET employee_id = 'EMP001' WHERE username ILIKE '%harpreet%' AND employee_id IS NULL")
        cursor.execute("UPDATE users SET employee_id = 'EMP002' WHERE username ILIKE '%prithvi%' AND employee_id IS NULL")
        cursor.execute("UPDATE users SET employee_id = 'EMP003' WHERE username ILIKE '%sameia%' AND employee_id IS NULL")
        cursor.execute("UPDATE users SET employee_id = 'EMP004' WHERE username ILIKE '%alka%' AND employee_id IS NULL")
        cursor.execute("UPDATE users SET employee_id = 'EMP005' WHERE username ILIKE '%soumya%' AND employee_id IS NULL")
        cursor.execute("UPDATE users SET employee_id = 'EMP' || LPAD(id::text, 3, '0') WHERE employee_id IS NULL AND username != 'admin'")
        
        # Leaves table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS leaves (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                full_name TEXT NOT NULL,
                leave_comment TEXT,
                attachment_filename TEXT,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                approval_status TEXT DEFAULT 'Pending'
            )
        ''')
        
        # Profile fields & Settings migrations
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_device TEXT")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_browser TEXT")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_location TEXT")
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_settings (
                username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
                theme TEXT DEFAULT 'dark',
                accent_color TEXT DEFAULT 'purple',
                layout_size TEXT DEFAULT 'comfortable',
                animations_enabled BOOLEAN DEFAULT TRUE,
                reduce_motion BOOLEAN DEFAULT FALSE,
                sticky_navbar BOOLEAN DEFAULT TRUE,
                compact_table_view BOOLEAN DEFAULT FALSE,
                auto_save BOOLEAN DEFAULT TRUE,
                remember_last_page BOOLEAN DEFAULT TRUE,
                email_notifications BOOLEAN DEFAULT TRUE,
                leave_approval_alerts BOOLEAN DEFAULT TRUE,
                student_update_alerts BOOLEAN DEFAULT TRUE,
                security_login_alerts BOOLEAN DEFAULT TRUE,
                dashboard_notifications BOOLEAN DEFAULT TRUE
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_sessions (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
                token_jti TEXT UNIQUE NOT NULL,
                device TEXT,
                browser TEXT,
                ip_address TEXT,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS security_logs (
                id SERIAL PRIMARY KEY,
                username TEXT,
                action TEXT NOT NULL,
                ip_address TEXT,
                device TEXT,
                browser TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_suspicious BOOLEAN DEFAULT FALSE,
                details TEXT
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS login_attempts (
                username TEXT PRIMARY KEY,
                failed_count INTEGER DEFAULT 0,
                locked_until TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        print("Connected to PostgreSQL and tables/migrations completed successfully.")
    except Exception as e:
        print(f"Warning: Could not connect to PostgreSQL. {e}")

init_db()

def log_security_event(username: str | None, action: str, ip_address: str | None = None, device: str | None = None, browser: str | None = None, is_suspicious: bool = False, details: str | None = None):
    conn = get_db_connection()
    cursor = get_cursor(conn)
    try:
        cursor.execute(
            """
            INSERT INTO security_logs (username, action, ip_address, device, browser, is_suspicious, details)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (username, action, ip_address, device, browser, is_suspicious, details)
        )
        conn.commit()
    except Exception as e:
        print(f"Failed to write security log: {e}")
    finally:
        conn.close()
