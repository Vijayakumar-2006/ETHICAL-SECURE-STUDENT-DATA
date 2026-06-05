import urllib.request
import urllib.error
import json
import time
import base64

BASE_URL = "http://127.0.0.1:8001"

def send_request(url, method="GET", headers=None, data=None, auth=None):
    headers = headers or {}
    if auth:
        auth_str = f"{auth[0]}:{auth[1]}"
        encoded_auth = base64.b64encode(auth_str.encode()).decode()
        headers["Authorization"] = f"Basic {encoded_auth}"
        
    req = urllib.request.Request(url, method=method, headers=headers)
    
    if data is not None:
        if isinstance(data, (dict, list)):
            req.data = json.dumps(data).encode()
            if "Content-Type" not in headers:
                req.add_header("Content-Type", "application/json")
        else:
            req.data = data
            
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
            return resp.status, resp.headers, body
    except urllib.error.HTTPError as e:
        body = e.read()
        return e.code, e.headers, body
    except Exception as e:
        print(f"Network error: {e}")
        return 0, {}, b""

def test_api_docs_basic_auth():
    print("Testing HTTP Basic Authentication on API docs...")
    status, headers, body = send_request(f"{BASE_URL}/docs")
    assert status == 401, f"Expected 401, got {status}"
    print("[OK] Accessing /docs without auth returned 401 Unauthorized.")

    status, headers, body = send_request(f"{BASE_URL}/docs", auth=("admin", "wrong_pass"))
    assert status == 401, f"Expected 401, got {status}"
    print("[OK] Accessing /docs with wrong credentials returned 401.")

    status, headers, body = send_request(f"{BASE_URL}/docs", auth=("admin", "secure@123"))
    assert status == 200, f"Expected 200, got {status}"
    print("[OK] Accessing /docs with correct credentials returned 200 OK.")

def test_secure_headers():
    print("\nTesting HTTP Secure Headers middleware...")
    status, headers, body = send_request(f"{BASE_URL}/")
    
    assert headers.get("X-Frame-Options") == "DENY", "X-Frame-Options: DENY header missing"
    assert headers.get("X-Content-Type-Options") == "nosniff", "X-Content-Type-Options: nosniff header missing"
    assert "Content-Security-Policy" in headers, "Content-Security-Policy header missing"
    assert "Strict-Transport-Security" in headers, "Strict-Transport-Security header missing"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin", "Referrer-Policy header missing"
    
    print("[OK] X-Frame-Options: DENY verified.")
    print("[OK] X-Content-Type-Options: nosniff verified.")
    print("[OK] Content-Security-Policy verified.")
    print("[OK] Strict-Transport-Security verified.")
    print("[OK] Referrer-Policy verified.")

def test_cors_restrictions():
    print("\nTesting CORS origin restriction...")
    headers = {"Origin": "http://malicious-attacker.com"}
    status, headers_resp, body = send_request(f"{BASE_URL}/api/auth/login", method="OPTIONS", headers=headers)
    cors_allowed = headers_resp.get("Access-Control-Allow-Origin")
    assert cors_allowed != "http://malicious-attacker.com", "Malicious origin allowed by CORS!"
    print("[OK] Malicious origin blocked by CORS constraints.")

def test_brute_force_lockout():
    print("\nTesting brute force lockout protection...")
    username = f"test_user_{int(time.time())}"
    
    # First 4 attempts should return 401
    for i in range(4):
        status, headers, body = send_request(f"{BASE_URL}/api/auth/login", method="POST", data={"username": username, "password": "wrongpassword"})
        assert status == 401, f"Expected 401, got {status} on attempt {i+1}"
    print("[OK] First 4 failed attempts returned 401.")

    # 5th attempt locks the account
    status, headers, body = send_request(f"{BASE_URL}/api/auth/login", method="POST", data={"username": username, "password": "wrongpassword"})
    assert status == 401, f"Expected 401, got {status} on 5th attempt"
    
    # 6th attempt should return 423 Locked
    status, headers, body = send_request(f"{BASE_URL}/api/auth/login", method="POST", data={"username": username, "password": "wrongpassword"})
    assert status == 423, f"Expected 423 Locked, got {status}"
    res_json = json.loads(body.decode())
    assert "locked due to too many failed login attempts" in res_json["detail"], "Lockout message not matching"
    print("[OK] 6th failed attempt locked account and returned 423 Locked.")

def test_magic_bytes_upload():
    print("\nTesting magic-bytes file upload checking...")
    # Log in as admin to create a temporary professor
    status, headers, body = send_request(f"{BASE_URL}/api/auth/login", method="POST", data={"username": "admin", "password": "secure@123"})
    assert status == 200, "Could not log in as admin to create temp professor"
    admin_token = json.loads(body.decode())["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Create temp professor
    import time
    test_username = f"prof_temp_{int(time.time())}"
    prof_payload = {
        "full_name": "Temporary Test Professor",
        "username": test_username,
        "password": "profpassword123",
        "employee_id": f"EMP_{test_username}",
        "department": "CSE",
        "designation": "Assistant Professor",
        "email": "temp@college.edu",
        "phone": "9998887770",
        "status": "present"
    }
    status, headers, body = send_request(f"{BASE_URL}/api/students/professors", method="POST", headers=admin_headers, data=prof_payload)
    assert status == 200, f"Could not create temp professor: {body.decode()}"
    
    # Log in as newly created active professor
    status, headers, body = send_request(f"{BASE_URL}/api/auth/login", method="POST", data={"username": test_username, "password": "profpassword123"})
    assert status == 200, "Could not log in as newly created professor"
    token = json.loads(body.decode())["access_token"]
    
    # Helper to construct multipart/form-data
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    
    def make_multipart(filename, file_data, mime_type):
        part_1 = f'--{boundary}\r\nContent-Disposition: form-data; name="leave_comment"\r\n\r\nFeeling sick today\r\n'
        part_2 = f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime_type}\r\n\r\n'
        part_3 = f'\r\n--{boundary}--\r\n'
        return part_1.encode() + part_2.encode() + file_data + part_3.encode()

    # 1. Spoofed extension upload
    spoofed_body = make_multipart("malicious_payload.png", b"console.log('malicious script content');", "image/png")
    headers_req = {
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary={boundary}"
    }
    status, headers_resp, body = send_request(f"{BASE_URL}/api/students/leaves", method="POST", headers=headers_req, data=spoofed_body)
    assert status == 400, f"Expected 400, got {status}"
    res_json = json.loads(body.decode())
    assert "Invalid file signature" in res_json["detail"], "Expected file signature mismatch error"
    print("[OK] Renamed text file spoofing as PNG rejected by magic bytes analysis.")

    # 2. Valid PNG header upload
    png_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    valid_body = make_multipart("legit_image.png", png_data, "image/png")
    status, headers_resp, body = send_request(f"{BASE_URL}/api/students/leaves", method="POST", headers=headers_req, data=valid_body)
    assert status == 200, f"Expected 200, got {status} ({body.decode()})"
    print("[OK] Valid PNG header accepted successfully.")

def test_unauthorized_rbac_limits():
    print("\nTesting Admin RBAC modifications limits...")
    status, headers, body = send_request(f"{BASE_URL}/api/auth/login", method="POST", data={"username": "admin", "password": "secure@123"})
    assert status == 200, "Could not log in as admin"
    admin_token = json.loads(body.decode())["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    student_payload = {
        "roll_number": "TEST-RBAC-001",
        "name": "RBAC Test student",
        "be_stream": "CSE"
    }
    status, headers_resp, body = send_request(f"{BASE_URL}/api/students/", method="POST", headers=admin_headers, data=student_payload)
    assert status == 403, f"Expected 403, got {status}"
    print("[OK] Admin blocked from adding student data directly.")

if __name__ == "__main__":
    print("--- Starting Security Hardening Tests ---")
    test_api_docs_basic_auth()
    
    test_secure_headers()
    test_cors_restrictions()
    test_brute_force_lockout()
    test_magic_bytes_upload()
    test_unauthorized_rbac_limits()
    print("\n--- All Security Verification Tests Passed Successfully! ---")
