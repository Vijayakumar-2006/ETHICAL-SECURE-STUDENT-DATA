const API_URL = 'http://127.0.0.1:8000/api';

// --- Auth Logic (index.html) ---
const authForm = document.getElementById('auth-form');
if (authForm) {
    let isLogin = true;
    const toggleLink = document.getElementById('toggle-link');
    const formTitle = document.getElementById('form-title');
    const formSubtitle = document.getElementById('form-subtitle');
    const togglePrompt = document.getElementById('toggle-prompt');
    const submitBtn = document.getElementById('submit-btn');
    const msgContainer = document.getElementById('message-container');

    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isLogin = !isLogin;
        formTitle.textContent = isLogin ? 'Login' : 'Register';
        formSubtitle.textContent = isLogin ? 'Access the secure portal.' : 'Create a new secure account.';
        togglePrompt.textContent = isLogin ? "Don't have an account?" : "Already have an account?";
        toggleLink.textContent = isLogin ? "Register here" : "Login here";
        submitBtn.textContent = isLogin ? "Login" : "Register";
        msgContainer.textContent = '';
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        const endpoint = isLogin ? '/auth/login' : '/auth/register';
        
        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            
            if (response.ok) {
                if (isLogin) {
                    localStorage.setItem('jwt_token', data.access_token);
                    window.location.href = 'dashboard.html';
                } else {
                    showMessage(msgContainer, "Registration successful. You can now login.", "success-msg");
                    isLogin = true;
                    // reset ui back to login
                    formTitle.textContent = 'Login';
                    formSubtitle.textContent = 'Access the secure portal.';
                    togglePrompt.textContent = "Don't have an account?";
                    toggleLink.textContent = "Register here";
                    submitBtn.textContent = "Login";
                }
            } else {
                showMessage(msgContainer, data.detail || "An error occurred", "error-msg");
            }
        } catch (error) {
            showMessage(msgContainer, "Server unreachable", "error-msg");
        }
    });
}

// --- Dashboard Logic (dashboard.html) ---
const addStudentForm = document.getElementById('add-student-form');
const logoutBtn = document.getElementById('logout-btn');

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('jwt_token');
        window.location.href = 'index.html';
    });
}

if (addStudentForm) {
    addStudentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const roll_number = document.getElementById('roll_number').value;
        const name = document.getElementById('name').value;
        const sensitive_details = document.getElementById('sensitive_details').value;
        const token = localStorage.getItem('jwt_token');
        const msgContainer = document.getElementById('add-msg');

        try {
            const response = await fetch(`${API_URL}/students/`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ roll_number, name, sensitive_details })
            });
            
            const data = await response.json();
            if (response.ok) {
                showMessage(msgContainer, "Securely added and encrypted!", "success-msg");
                addStudentForm.reset();
                fetchStudents();
            } else {
                showMessage(msgContainer, data.detail || "Error adding student", "error-msg");
            }
        } catch (error) {
             showMessage(msgContainer, "Server error", "error-msg");
        }
    });
}

async function fetchStudents() {
    const tbody = document.getElementById('students-tbody');
    const msgContainer = document.getElementById('fetch-msg');
    if (!tbody) return;
    
    const token = localStorage.getItem('jwt_token');
    
    try {
        const response = await fetch(`${API_URL}/students/`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('jwt_token');
            window.location.href = 'index.html';
            return;
        }

        const students = await response.json();
        tbody.innerHTML = '';
        
        students.forEach(student => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${student.roll_number}</td>
                <td>${student.name}</td>
                <td><small>${student.sensitive_details}</small></td>
                <td><button class="danger-btn" onclick="deleteStudent(${student.id})">Delete</button></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        showMessage(msgContainer, "Failed to load records", "error-msg");
    }
}

async function deleteStudent(id) {
    const token = localStorage.getItem('jwt_token');
    if(!confirm("Are you sure you want to delete this record?")) return;
    
    try {
        const response = await fetch(`${API_URL}/students/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            fetchStudents();
        } else {
            alert("Failed to delete");
        }
    } catch (err) {
        console.error(err);
    }
}

function showMessage(el, text, className) {
    if(!el) return;
    el.textContent = text;
    el.className = `message ${className}`;
    setTimeout(() => {
        el.textContent = '';
        el.className = 'message';
    }, 5000);
}
