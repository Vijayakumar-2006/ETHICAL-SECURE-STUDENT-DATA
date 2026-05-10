import sqlite3
import os

DB_NAME = "student_data.db"

def get_db_connection():
    # Make sure DB is created in the same directory as this file
    db_path = os.path.join(os.path.dirname(__file__), DB_NAME)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            roll_number TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            encrypted_data TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

init_db()
