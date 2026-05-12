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
                roll_number TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                encrypted_data TEXT NOT NULL
            )
        ''')
        conn.commit()
        conn.close()
        print("Connected to PostgreSQL and tables created successfully.")
    except Exception as e:
        print(f"Warning: Could not connect to PostgreSQL. {e}")

init_db()
