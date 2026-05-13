const API_URL = 'http://127.0.0.1:8001/api';

// --- Auth Logic (index.html) ---
const authForm = document.getElementById('auth-form');
if (authForm) {
    let isLogin = true;
    let expectedCaptcha = '';
    const toggleLink = document.getElementById('toggle-link');
    const formTitle = document.getElementById('form-title');
    const formSubtitle = document.getElementById('form-subtitle');
    const togglePrompt = document.getElementById('toggle-prompt');
    const submitBtn = document.getElementById('submit-btn');
    const msgContainer = document.getElementById('message-container');

    function generateCaptcha() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let captchaText = '';
        for (let i = 0; i < 6; i++) {
            captchaText += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        expectedCaptcha = captchaText;
        
        const canvas = document.getElementById('captcha-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            ctx.font = '22px Inter, sans-serif';
            ctx.fillStyle = '#1e1b4b';
            ctx.textBaseline = 'middle';
            
            for(let i=0; i < captchaText.length; i++) {
                ctx.save();
                ctx.translate(15 + i * 20, 20);
                const rotation = (Math.random() - 0.5) * 0.4;
                ctx.rotate(rotation);
                ctx.fillText(captchaText[i], 0, 0);
                ctx.restore();
            }

            for (let i = 0; i < 5; i++) {
                ctx.strokeStyle = `rgba(0,0,0, ${Math.random() * 0.2 + 0.1})`;
                ctx.beginPath();
                ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
                ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
                ctx.stroke();
            }
        }

        const captchaInput = document.getElementById('captcha');
        if (captchaInput) {
            captchaInput.value = '';
            captchaInput.style.borderColor = '';
            const statusEl = document.getElementById('captcha-status');
            if (statusEl) statusEl.textContent = '';
        }
    }
    generateCaptcha();

    const refreshBtn = document.getElementById('refresh-captcha');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', generateCaptcha);
    }

    const captchaInputField = document.getElementById('captcha');
    if (captchaInputField) {
        captchaInputField.addEventListener('input', (e) => {
            const statusEl = document.getElementById('captcha-status');
            if (!statusEl) return;
            
            if (e.target.value === '') {
                statusEl.textContent = '';
                captchaInputField.style.borderColor = '';
            } else if (e.target.value === expectedCaptcha) {
                statusEl.textContent = '✓';
                statusEl.style.color = 'var(--success-color, #10b981)';
                captchaInputField.style.borderColor = 'var(--success-color, #10b981)';
            } else {
                statusEl.textContent = '✗';
                statusEl.style.color = 'var(--error-color, #ef4444)';
                captchaInputField.style.borderColor = 'var(--error-color, #ef4444)';
            }
        });
    }

    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isLogin = !isLogin;
        formTitle.textContent = isLogin ? 'Login' : 'Register';
        formSubtitle.textContent = isLogin ? 'Access the secure portal.' : 'Create a new secure account.';
        togglePrompt.textContent = isLogin ? "Don't have an account?" : "Already have an account?";
        toggleLink.textContent = isLogin ? "Register here" : "Login here";
        submitBtn.textContent = isLogin ? "Login" : "Register";
        msgContainer.textContent = '';
        generateCaptcha();
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const captchaInput = document.getElementById('captcha');
        if (captchaInput && captchaInput.value !== expectedCaptcha) {
            showMessage(msgContainer, "Incorrect CAPTCHA answer", "error-msg");
            generateCaptcha();
            return;
        }

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
                    generateCaptcha();
                }
            } else {
                showMessage(msgContainer, data.detail || "An error occurred", "error-msg");
                generateCaptcha();
            }
        } catch (error) {
            showMessage(msgContainer, "Server unreachable", "error-msg");
            generateCaptcha();
        }
    });
}

// --- Dashboard Logic (dashboard.html) ---
const addStudentForm = document.getElementById('add-student-form');
const logoutBtn = document.getElementById('logout-btn');
const addBtn = document.getElementById('add-btn');
const addModal = document.getElementById('add-modal');
const closeAddModalBtn = document.getElementById('close-add-modal');

const navEditBtn = document.getElementById('nav-edit-btn');
const editModal = document.getElementById('edit-modal');
const closeEditModalBtn = document.getElementById('close-edit-modal');
const editStudentForm = document.getElementById('edit-student-form');
const selectEditStudent = document.getElementById('select_edit_student');
let cachedStudents = [];

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('jwt_token');
        window.location.href = 'index.html';
    });
}

if (addBtn && addModal) {
    addBtn.addEventListener('click', () => {
        addModal.removeAttribute('hidden');
        toggleFirstOfferFields();
    });
}

if (closeAddModalBtn && addModal) {
    closeAddModalBtn.addEventListener('click', () => {
        addModal.setAttribute('hidden', 'hidden');
    });
}

if (navEditBtn && editModal) {
    navEditBtn.addEventListener('click', () => {
        populateEditDropdown();
        editModal.removeAttribute('hidden');
        toggleEditFirstOfferFields();
    });
}

if (closeEditModalBtn && editModal) {
    closeEditModalBtn.addEventListener('click', () => {
        editModal.setAttribute('hidden', 'hidden');
    });
}

function populateEditDropdown(selectedId = null) {
    if (!selectEditStudent) return;
    selectEditStudent.innerHTML = '<option value="">-- Choose a student --</option>';
    cachedStudents.forEach(st => {
        const opt = document.createElement('option');
        opt.value = st.id;
        opt.textContent = `${st.roll_number} - ${st.name}`;
        if (selectedId && st.id === selectedId) {
            opt.selected = true;
        }
        selectEditStudent.appendChild(opt);
    });
    handleEditSelectionChange(selectedId);
}

function handleEditSelectionChange(selectedId) {
    const id = selectedId || (selectEditStudent ? Number(selectEditStudent.value) : null);
    const st = cachedStudents.find(s => s.id === id);
    if (st) {
        document.getElementById('edit_student_id').value = st.id;
        document.getElementById('edit_serial_no').value = st.serial_no ?? '';
        document.getElementById('edit_roll_number').value = st.roll_number ?? '';
        document.getElementById('edit_name').value = st.name ?? '';
        document.getElementById('edit_be_stream').value = st.be_stream ?? '';
        document.getElementById('edit_first_offer').value = st.first_offer === null ? '' : st.first_offer.toString();
        document.getElementById('edit_company_1').value = st.company_1 ?? '';
        document.getElementById('edit_ctc_1').value = st.ctc_1 ?? '';
        document.getElementById('edit_stipend_1').value = st.stipend_1 ?? '';
        document.getElementById('edit_second_offer').value = st.second_offer === null ? '' : st.second_offer.toString();
        document.getElementById('edit_company_2').value = st.company_2 ?? '';
        document.getElementById('edit_ctc_2').value = st.ctc_2 ?? '';
    } else {
        document.getElementById('edit_student_id').value = '';
        document.getElementById('edit_serial_no').value = '';
        document.getElementById('edit_roll_number').value = '';
        document.getElementById('edit_name').value = '';
        document.getElementById('edit_be_stream').value = '';
        document.getElementById('edit_first_offer').value = '';
        document.getElementById('edit_company_1').value = '';
        document.getElementById('edit_ctc_1').value = '';
        document.getElementById('edit_stipend_1').value = '';
        document.getElementById('edit_second_offer').value = '';
        document.getElementById('edit_company_2').value = '';
        document.getElementById('edit_ctc_2').value = '';
    }
}

if (selectEditStudent) {
    selectEditStudent.addEventListener('change', () => {
        handleEditSelectionChange();
    });
}

function openEditModalFor(id) {
    if (editModal) {
        populateEditDropdown(id);
        editModal.removeAttribute('hidden');
        toggleEditFirstOfferFields();
    }
}

if (addStudentForm) {
    addStudentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const serialNoRaw = document.getElementById('serial_no').value;
        const roll_number = document.getElementById('roll_number').value;
        const name = document.getElementById('name').value;
        const be_stream = document.getElementById('be_stream').value;
        const firstOfferRaw = document.getElementById('first_offer').value;
        const company_1 = document.getElementById('company_1').value;
        const ctc_1 = document.getElementById('ctc_1').value;
        const stipend_1 = document.getElementById('stipend_1').value;
        const secondOfferRaw = document.getElementById('second_offer').value;
        const company_2 = document.getElementById('company_2').value;
        const ctc_2 = document.getElementById('ctc_2').value;
        const token = localStorage.getItem('jwt_token');
        const msgContainer = document.getElementById('add-msg');
        const payload = {
            serial_no: serialNoRaw ? Number(serialNoRaw) : null,
            roll_number,
            name,
            be_stream: be_stream || null,
            first_offer: firstOfferRaw === '' ? null : firstOfferRaw === 'true',
            company_1: company_1 || null,
            ctc_1: ctc_1 || null,
            stipend_1: stipend_1 || null,
            second_offer: secondOfferRaw === '' ? null : secondOfferRaw === 'true',
            company_2: company_2 || null,
            ctc_2: ctc_2 || null
        };

        try {
            const response = await fetch(`${API_URL}/students/`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            if (response.ok) {
                showMessage(msgContainer, "Student securely added!", "success-msg");
                addStudentForm.reset();
                if (addModal) {
                    addModal.setAttribute('hidden', 'hidden');
                }
                fetchStudents();
            } else {
                showMessage(msgContainer, data.detail || "Error adding student", "error-msg");
            }
        } catch (error) {
             showMessage(msgContainer, "Server error", "error-msg");
        }
    });
}

if (editStudentForm) {
    editStudentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit_student_id').value;
        if (!id) return;

        const serialNoRaw = document.getElementById('edit_serial_no').value;
        const roll_number = document.getElementById('edit_roll_number').value;
        const name = document.getElementById('edit_name').value;
        const be_stream = document.getElementById('edit_be_stream').value;
        const firstOfferRaw = document.getElementById('edit_first_offer').value;
        const company_1 = document.getElementById('edit_company_1').value;
        const ctc_1 = document.getElementById('edit_ctc_1').value;
        const stipend_1 = document.getElementById('edit_stipend_1').value;
        const secondOfferRaw = document.getElementById('edit_second_offer').value;
        const company_2 = document.getElementById('edit_company_2').value;
        const ctc_2 = document.getElementById('edit_ctc_2').value;
        const token = localStorage.getItem('jwt_token');
        const msgContainer = document.getElementById('edit-msg');

        const payload = {
            serial_no: serialNoRaw ? Number(serialNoRaw) : null,
            roll_number,
            name,
            be_stream: be_stream || null,
            first_offer: firstOfferRaw === '' ? null : firstOfferRaw === 'true',
            company_1: company_1 || null,
            ctc_1: ctc_1 || null,
            stipend_1: stipend_1 || null,
            second_offer: secondOfferRaw === '' ? null : secondOfferRaw === 'true',
            company_2: company_2 || null,
            ctc_2: ctc_2 || null
        };

        try {
            const response = await fetch(`${API_URL}/students/${id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            if (response.ok) {
                showMessage(document.getElementById('fetch-msg'), "Student updated successfully!", "success-msg");
                if (editModal) {
                    editModal.setAttribute('hidden', 'hidden');
                }
                fetchStudents();
            } else {
                showMessage(msgContainer, data.detail || "Error updating student", "error-msg");
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
        cachedStudents = students;
        tbody.innerHTML = '';
        
        students.forEach((student, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${student.roll_number}</td>
                <td>${student.name}</td>
                <td>${student.be_stream ?? ''}</td>
                <td>${student.first_offer === null || student.first_offer === undefined ? '' : (student.first_offer ? 'YES' : 'NO')}</td>
                <td>${student.company_1 ?? ''}</td>
                <td>${student.ctc_1 ?? ''}</td>
                <td>${student.stipend_1 ?? ''}</td>
                <td>${student.second_offer === null || student.second_offer === undefined ? '' : (student.second_offer ? 'YES' : 'NO')}</td>
                <td>${student.company_2 ?? ''}</td>
                <td>${student.ctc_2 ?? ''}</td>
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
