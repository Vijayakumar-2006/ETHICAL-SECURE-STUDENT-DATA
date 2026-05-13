import psycopg2
import psycopg2.extras
import os

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
        conn.commit()
        conn.close()
        print("Connected to PostgreSQL and tables created successfully.")
    except Exception as e:
        print(f"Warning: Could not connect to PostgreSQL. {e}")

init_db()
