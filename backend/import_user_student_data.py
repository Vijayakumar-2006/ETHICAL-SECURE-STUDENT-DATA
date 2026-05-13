import os
import re
from pathlib import Path

import pypdf

from database import get_db_connection, init_db
from security.hashing import hash_password


USERS = [
    ("Harpreet Kaur thind", "9811055784"),
    ("Prithvi C N", "9590157911"),
    ("Sameia Suha", "9740183267"),
    ("Alka Rani", "9482595017"),
    ("Soumya", "9686027440"),
]


ASSIGNMENTS = {
    "Harpreet Kaur thind": [
        ("1DS21CS144", "Prajwal Chandrashekar"),
        ("1DS21CS134", "Nithin R Kashyap"),
        ("1DS21CS044", "Arjit Bhardwaj"),
        ("1DS21CS187", "Samyak Jayaram"),
        ("1DS21CS124", "Naman Chopra"),
        ("1DS21CS190", "Sanjana Sureshmeesi"),
        ("1DS21CS088", "Harsh Vardhan"),
        ("1DS21CS212", "Sinchana Ravikumar Naik"),
        ("1DS20CS017", "Akshata"),
        ("1DS21CS229", "Sushmitha S"),
        ("1DS21CS102", "Khalid Rasheed"),
        ("1DS21CS162", "Punith V"),
    ],
    "Prithvi C N": [
        ("1DS21CS251", "S Varun"),
        ("1DS21CS240", "Udit Jain"),
        ("1DS22CS411", "Navya V"),
        ("1DS21CS084", "Gattu Sai Ganesh"),
        ("1DS21CS014", "Abrar Gouri"),
        ("1DS21CS245", "V Vilas"),
        ("1DS22CS406", "D Ravikumara"),
        ("1DS21CS108", "Lavanya H U"),
        ("1DS22CS423", "Vasundara M G"),
        ("1DS21CS226", "Sunidhi Suresh"),
        ("1DS21CS219", "Suddapalli Venkatasai"),
        ("1DS21CS060", "Charu N Bohra"),
    ],
    "Sameia Suha": [
        ("1DS21CS196", "Shaan Sharma"),
        ("1DS21CS049", "Ashish Kumar Jaiswal"),
        ("1DS22CS405", "Chiranth L P"),
        ("1DS21CS158", "Priyanka"),
        ("1DS21CS262", "Zaid Bin Manzoor"),
        ("1DS21CS260", "Yusuf Azam"),
        ("1DS21CS006", "Aayush Kumar"),
        ("1DS21CS071", "Devansh Pehlajani"),
        ("1DS21CS009", "Abhay V"),
        ("1DS21CS061", "Chilla Anusha"),
        ("1DS21CS161", "Puneet H S"),
        ("1DS21CS090", "Harshitha T U"),
    ],
    "Alka Rani": [
        ("1DS21CS076", "Divya Muppalla"),
        ("1DS21CS197", "Shah Faizan"),
        ("1DS21CS179", "Sai Manasa Ravula Palli"),
        ("1DS22CS407", "Darshan"),
        ("1DS21CS165", "Rahul Kumar A S"),
        ("1DS21CS042", "Ankur Kumar"),
        ("1DS22CS424", "Yashaswini R"),
        ("1DS21CS194", "Sawant Omkar Mohan"),
        ("1DS21CS010", "Abhijeet Aryan"),
        ("1DS21CS174", "S Kavyashree"),
        ("1DS21CS155", "Prathibha R"),
        ("1DS22CS404", "Bumika R M"),
    ],
    "Soumya": [
        ("1DS21CS117", "Mohammed Reyan"),
        ("1DS21CS003", "Aarushi Nimish Dhruv"),
        ("1DS21CS094", "Jeevika S"),
        ("1DS21CS027", "Akarsh Mundaganur"),
        ("1DS21CS043", "Anusha D"),
        ("1DS21CS111", "M Kavacin"),
        ("1DS21CS096", "Karthik K H"),
        ("1DS22CS408", "Ganavi S S"),
        ("1DS21CS058", "Bhoomika Nataraja"),
        ("1DS21CS056", "Bhavya R"),
        ("1DS21CS066", "Darshan M"),
        ("1DS21CS104", "Khushi V"),
    ],
}


def _extract_pdf_rows():
    pdf_path = Path(
        os.environ.get(
            "STUDENTS_PDF_PATH",
            "C:/Users/VIJU/AppData/Roaming/Cursor/User/workspaceStorage/e05988118a58afb47e4e018c3d03fc79/pdfs/6c7e5672-66ca-4df4-8837-13837c542742/student.pdf",
        )
    )
    if not pdf_path.exists():
        return {}

    reader = pypdf.PdfReader(str(pdf_path))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

    rows_by_usn = {}
    i = 0
    while i < len(lines):
        has_serial = re.fullmatch(r"\d+", lines[i]) is not None
        usn_joined = None
        if has_serial and i + 1 < len(lines):
            # OCR can split as: "1DS21C" and "S251"
            if re.fullmatch(r"1DS\d{2}C", lines[i + 1]) and i + 2 < len(lines) and re.fullmatch(r"S\d{3}", lines[i + 2]):
                usn_joined = f"{lines[i + 1]}{lines[i + 2]}"
            elif re.match(r"^1DS\d{2}C", lines[i + 1]):
                usn_joined = lines[i + 1].replace(" ", "")

        if has_serial and usn_joined:
            serial_no = int(lines[i])
            usn = usn_joined.replace(" ", "")
            j = i + 3 if re.fullmatch(r"1DS\d{2}C", lines[i + 1]) and i + 2 < len(lines) and re.fullmatch(r"S\d{3}", lines[i + 2]) else i + 2
            row_tokens = []
            while j < len(lines):
                if re.fullmatch(r"\d+", lines[j]) and j + 1 < len(lines) and re.match(r"^1DS\d{2}C", lines[j + 1]):
                    break
                if lines[j].startswith("-- ") and " of " in lines[j]:
                    j += 1
                    continue
                row_tokens.append(lines[j])
                j += 1

            row_text = " ".join(row_tokens)
            name_part = row_text.split(" CSE ")[0].strip() if " CSE " in row_text else row_text
            stream = "CSE" if " CSE " in row_text or row_text.endswith(" CSE") else None

            after_stream = ""
            if " CSE " in row_text:
                after_stream = row_text.split(" CSE ", 1)[1]

            first_offer = "YES" in after_stream
            second_offer = after_stream.count("YES") >= 2

            company_1 = None
            ctc_1 = None
            stipend_1 = None
            company_2 = None
            ctc_2 = None

            if "YES" in after_stream:
                first_seg = after_stream.split("YES", 1)[1].strip()
                if "YES" in first_seg:
                    left, right = first_seg.split("YES", 1)
                else:
                    left, right = first_seg, ""

                # Keep parsing lightweight and resilient to OCR splits.
                # Capture numeric tokens near the end for ctc/stipend.
                nums = re.findall(r"\d+(?:\.\d+)?", left)
                if nums:
                    ctc_1 = nums[-2] if len(nums) >= 2 else nums[-1]
                    stipend_1 = nums[-1] if len(nums) >= 2 else None
                company_1 = re.sub(r"\s+", " ", re.sub(r"\d+(?:\.\d+)?", "", left)).strip() or None

                if right.strip():
                    nums2 = re.findall(r"\d+(?:\.\d+)?", right)
                    if nums2:
                        ctc_2 = nums2[-1]
                    company_2 = re.sub(r"\s+", " ", re.sub(r"\d+(?:\.\d+)?", "", right)).strip() or None

            rows_by_usn[usn] = {
                "serial_no": serial_no,
                "name_from_pdf": re.sub(r"\s+", " ", name_part).strip(),
                "be_stream": stream,
                "first_offer": first_offer,
                "company_1": company_1,
                "ctc_1": ctc_1,
                "stipend_1": stipend_1,
                "second_offer": second_offer,
                "company_2": company_2,
                "ctc_2": ctc_2,
                "pdf_row_text": row_text,
            }
            i = j
            continue
        i += 1

    return rows_by_usn


def main():
    init_db()
    conn = get_db_connection()
    cur = conn.cursor()
    pdf_rows = _extract_pdf_rows()

    # Ensure auth users exist with provided passwords.
    for username, password in USERS:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        existing = cur.fetchone()
        if not existing:
            cur.execute(
                "INSERT INTO users (username, password_hash) VALUES (%s, %s)",
                (username, hash_password(password)),
            )

    # Insert/update students and ownership mapping.
    for username, students in ASSIGNMENTS.items():
        for roll_number, name in students:
            pdf = pdf_rows.get(roll_number, {})
            cur.execute(
                """
                INSERT INTO students (
                    serial_no, roll_number, name, be_stream, first_offer, company_1, ctc_1, stipend_1,
                    second_offer, company_2, ctc_2, assigned_username
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (roll_number)
                DO UPDATE SET
                    serial_no = EXCLUDED.serial_no,
                    name = EXCLUDED.name,
                    be_stream = EXCLUDED.be_stream,
                    first_offer = EXCLUDED.first_offer,
                    company_1 = EXCLUDED.company_1,
                    ctc_1 = EXCLUDED.ctc_1,
                    stipend_1 = EXCLUDED.stipend_1,
                    second_offer = EXCLUDED.second_offer,
                    company_2 = EXCLUDED.company_2,
                    ctc_2 = EXCLUDED.ctc_2,
                    assigned_username = EXCLUDED.assigned_username
                """,
                (
                    pdf.get("serial_no"),
                    roll_number,
                    name,
                    pdf.get("be_stream"),
                    pdf.get("first_offer"),
                    pdf.get("company_1"),
                    pdf.get("ctc_1"),
                    pdf.get("stipend_1"),
                    pdf.get("second_offer"),
                    pdf.get("company_2"),
                    pdf.get("ctc_2"),
                    username,
                ),
            )

    conn.commit()
    conn.close()
    print("Imported users and student assignments successfully.")


if __name__ == "__main__":
    main()
