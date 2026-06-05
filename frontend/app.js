const API_URL = 'http://127.0.0.1:8001/api';

// --- Auth Logic (index.html) ---
const authForm = document.getElementById('auth-form');
if (authForm) {
    let expectedCaptcha = '';
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
        
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            
            if (response.ok) {
                localStorage.setItem('jwt_token', data.access_token);
                localStorage.setItem('refresh_token', data.refresh_token);
                window.location.href = 'dashboard.html';
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
let selectedProfessor = null;
let cachedProfessors = [];
let studentDirectoryScrollTop = 0;

const empMap = {
    "harpreet kaur thind": "EMP001",
    "harpreet kaur": "EMP001",
    "prithvi c n": "EMP002",
    "prithvi cn": "EMP002",
    "sameia suha": "EMP003",
    "alka rani": "EMP004",
    "soumya": "EMP005"
};

function getProfessorInitials(name) {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("harpreet")) return "HK";
    if (lowerName.includes("prithvi")) return "PC";
    if (lowerName.includes("sameia")) return "SS";
    if (lowerName.includes("alka")) return "AR";
    if (lowerName.includes("soumya")) return "SY";
    
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) {
        return (parts[0][0] + parts[0][1]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function getProfessorEmpId(name) {
    const clean = name.toLowerCase().trim();
    for (const [key, val] of Object.entries(empMap)) {
        if (clean.includes(key)) return val;
    }
    // Stable hash fallback based on string characters
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const num = Math.abs(hash % 900) + 100;
    return `EMP${num}`;
}


function getUsernameFromToken() {
    const token = localStorage.getItem('jwt_token');
    if (!token) return 'Guest';
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);
        return payload.sub || 'User';
    } catch (e) {
        console.error("Error decoding token:", e);
        return 'User';
    }
}

function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getFirstName(name) {
    if (!name) return 'User';
    return name.trim().split(/\s+/)[0];
}

function updateGreeting() {
    const greetingEl = document.getElementById('nav-brand-greeting');
    if (!greetingEl) return;
    
    const username = getUsernameFromToken();
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour >= 5 && hour < 12) {
        greeting = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
        greeting = 'Good afternoon';
    }
    
    greetingEl.textContent = `${greeting}, ${username}`;

    // Also populate profile dropdown username
    const profileUsernameEl = document.getElementById('profile-username');
    if (profileUsernameEl) {
        profileUsernameEl.textContent = username;
    }

    // Set short name on the trigger button
    const shortNameEl = document.getElementById('profile-short-name');
    if (shortNameEl) {
        shortNameEl.textContent = getFirstName(username);
    }
    
    // Set initials in the trigger and dropdown
    const initials = getInitials(username);
    const triggerInitialsEl = document.getElementById('avatar-initials');
    if (triggerInitialsEl) {
        triggerInitialsEl.textContent = initials;
    }
    const dropdownInitialsEl = document.getElementById('dropdown-avatar-initials');
    if (dropdownInitialsEl) {
        dropdownInitialsEl.textContent = initials;
    }
}

// Initialize greeting
updateGreeting();

// Profile Dropdown Toggle Logic
const profileBtn = document.getElementById('profile-btn');
const profileDropdown = document.getElementById('profile-dropdown');
if (profileBtn && profileDropdown) {
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = profileDropdown.hasAttribute('hidden');
        if (isHidden) {
            profileDropdown.removeAttribute('hidden');
        } else {
            profileDropdown.setAttribute('hidden', 'hidden');
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!profileDropdown.contains(e.target) && e.target !== profileBtn) {
            profileDropdown.setAttribute('hidden', 'hidden');
        }
    });
}

// Click listener for Student Details navigation link
const studentDetailsLink = document.getElementById('nav-student-details');
if (studentDetailsLink) {
    studentDetailsLink.addEventListener('click', (e) => {
        e.preventDefault();
        const settingsSection = document.getElementById('settings-section');
        const securitySection = document.getElementById('security-section');
        const isSettingsVisible = settingsSection && !settingsSection.hasAttribute('hidden');
        const isSecurityVisible = securitySection && !securitySection.hasAttribute('hidden');
        
        if (isSettingsVisible || isSecurityVisible) {
            navigateToStudentDirectory();
        } else {
            // Already in Student Directory, scroll to section smoothly
            const targetSection = document.getElementById('student-directory-section');
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });
}

// RBAC View Initialization
function initializeDashboard() {
    fetchUserProfile();
    fetchSettings(); // Apply theme/accent/layout preferences on dashboard load
    const username = getUsernameFromToken();
    const navDashboard = document.getElementById('nav-dashboard');
    const navProfessors = document.getElementById('nav-professors');
    const navSecurity = document.getElementById('nav-security');
    const navSettings = document.getElementById('nav-settings');
    const navStudentDetails = document.getElementById('nav-student-details');
    const profSection = document.getElementById('professor-directory-section');
    const studSection = document.getElementById('student-directory-section');
    const settingsSection = document.getElementById('settings-section');
    const securitySection = document.getElementById('security-section');
    const backBtn = document.getElementById('back-to-dashboard-btn');
    
    // Always hide settings and security elements when returning to standard dashboard view
    if (settingsSection) settingsSection.setAttribute('hidden', 'hidden');
    if (securitySection) securitySection.setAttribute('hidden', 'hidden');
    if (navSettings) navSettings.style.display = 'none';
    if (navSecurity) navSecurity.style.display = 'none';
    
    const profHeaderCard = document.getElementById('prof-directory-header-card');
    if (profHeaderCard) profHeaderCard.style.display = 'none';
    
    // Reset active nav state
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    
    const addBtn = document.getElementById('add-btn');
    const navEditBtn = document.getElementById('nav-edit-btn');
    
    const addProfBtn = document.getElementById('add-prof-btn');
    
    if (username === 'admin') {
        setStudentEditMode(false);
        // Hide edit/add buttons for admin
        if (addBtn) addBtn.style.display = 'none';
        if (navEditBtn) navEditBtn.style.display = 'none';
        if (addProfBtn) addProfBtn.style.display = 'inline-flex';
        
        // Show Admin Nav & Sections
        if (navDashboard) {
            navDashboard.style.display = 'inline-block';
        }
        if (navProfessors) {
            navProfessors.style.display = 'inline-block';
            navProfessors.classList.add('active'); // Default active menu: Professors
        }
        if (navSecurity) {
            navSecurity.style.display = 'inline-block';
        }
        if (navStudentDetails) {
            navStudentDetails.style.display = 'none'; // Completely hidden for Admin
        }
        
        if (profSection) profSection.removeAttribute('hidden');
        if (studSection) studSection.setAttribute('hidden', 'hidden');
        if (backBtn) backBtn.style.display = 'none';
        
        // Fetch professors directory
        fetchProfessors();
    } else {
        setStudentEditMode(false);
        // Show edit/add buttons for professors
        if (addBtn) addBtn.style.display = 'inline-flex';
        if (navEditBtn) navEditBtn.style.display = 'inline-flex';
        if (addProfBtn) addProfBtn.style.display = 'none';
        
        // Professor login
        if (navDashboard) navDashboard.style.display = 'none';
        if (navProfessors) navProfessors.style.display = 'none';
        if (navSecurity) navSecurity.style.display = 'none';
        if (navStudentDetails) {
            navStudentDetails.style.display = 'inline-block';
            navStudentDetails.classList.add('active');
        }
        
        if (profSection) profSection.setAttribute('hidden', 'hidden');
        if (studSection) studSection.removeAttribute('hidden');
        if (backBtn) backBtn.style.display = 'none';
        
        selectedProfessor = username; // For query filtering
        const titleEl = document.getElementById('directory-title');
        if (titleEl) titleEl.textContent = 'Student Directory';
        
        // Fetch students directly
        fetchStudents();
    }
}

async function fetchProfessors() {
    const token = localStorage.getItem('jwt_token');
    try {
        const response = await fetch(`${API_URL}/students/professors`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            cachedProfessors = await response.json();
            
            // Calculate statistics
            const totalProfessors = cachedProfessors.length;
            const totalStudents = cachedProfessors.reduce((acc, p) => acc + p.student_count, 0);
            
            // Bind statistics UI
            const statTotalProfs = document.getElementById('stat-total-professors');
            const statTotalStuds = document.getElementById('stat-total-students');
            
            if (statTotalProfs) statTotalProfs.textContent = totalProfessors;
            if (statTotalStuds) statTotalStuds.textContent = totalStudents;
            
            renderProfessors();
        }
    } catch (e) {
        console.error("Error fetching professors:", e);
    }
}

function renderProfessors() {
    const grid = document.getElementById('professors-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    // Get search query
    const searchInput = document.getElementById('prof-search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    // Filter professors
    let filtered = cachedProfessors.filter(prof => {
        const fName = (prof.full_name || '').toLowerCase();
        const uName = (prof.username || '').toLowerCase();
        const empId = (prof.employee_id || '').toLowerCase();
        const dept = (prof.department || '').toLowerCase();
        return fName.includes(query) || uName.includes(query) || empId.includes(query) || dept.includes(query);
    });
    
    // Get sorting option
    const sortSelect = document.getElementById('prof-sort-select');
    const sortBy = sortSelect ? sortSelect.value : 'name-asc';
    
    // Sort professors
    filtered.sort((a, b) => {
        const nameA = a.full_name || a.username;
        const nameB = b.full_name || b.username;
        if (sortBy === 'name-asc') {
            return nameA.localeCompare(nameB);
        } else if (sortBy === 'name-desc') {
            return nameB.localeCompare(nameA);
        } else if (sortBy === 'count-desc') {
            return b.student_count - a.student_count;
        } else if (sortBy === 'count-asc') {
            return a.student_count - b.student_count;
        }
        return 0;
    });
    
    filtered.forEach((prof) => {
        const card = document.createElement('div');
        card.className = 'professor-card glass-card';
        
        const initials = getProfessorInitials(prof.full_name || prof.username);
        
        let statusBadge = '';
        let viewLeaveButton = '';
        const statusClean = (prof.status || 'present').toLowerCase();
        if (statusClean === 'absent') {
            statusBadge = `<span class="status-badge absent" style="cursor: pointer;" onclick="openAdminLeaveModalFor('${prof.username}')">🟡 Absent</span>`;
            viewLeaveButton = `<button class="view-details-link view-leave-btn" style="font-size: 0.8rem; color: #F59E0B; margin-left: 0.25rem;" onclick="openAdminLeaveModalFor('${prof.username}')">(View Leave)</button>`;
        } else {
            statusBadge = '<span class="status-badge present">🟢 Present</span>';
        }
        
        card.innerHTML = `
            <div class="prof-card-header">
                <div class="prof-avatar-circle">${initials}</div>
                <div class="prof-meta">
                    <h3 class="prof-name">${prof.full_name || prof.username}</h3>
                    <span class="prof-emp-id">${prof.employee_id}</span>
                </div>
            </div>
            <div class="prof-info-body">
                <div class="prof-info-row">
                    <span>Department:</span>
                    <strong>${prof.department || 'CSE'}</strong>
                </div>
                <div class="prof-info-row">
                    <span>Students Assigned:</span>
                    <strong>${prof.student_count}</strong>
                </div>
                <div class="prof-info-row">
                    <span>Status:</span>
                    <strong style="display: inline-flex; align-items: center; gap: 0.25rem;">
                        ${statusBadge} ${viewLeaveButton}
                    </strong>
                </div>
            </div>
            <div class="prof-card-actions-row">
                <button class="prof-action-btn view-students-btn" title="View Students">
                    <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span>View Students</span>
                </button>
                <button class="prof-action-btn edit-prof-btn" title="Edit Professor">
                    <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <span>Edit</span>
                </button>
                <button class="prof-action-btn delete-prof-btn" title="Delete Professor">
                    <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                    <span>Delete</span>
                </button>
            </div>
        `;
        
        // Add click listener to view students
        const viewBtn = card.querySelector('.view-students-btn');
        viewBtn.addEventListener('click', () => {
            viewProfessorDirectory(prof.username);
        });
        
        // Add click listener to edit professor details
        const editBtn = card.querySelector('.edit-prof-btn');
        editBtn.addEventListener('click', () => {
            openEditProfModalFor(prof);
        });

        // Add click listener to delete professor details
        const deleteBtn = card.querySelector('.delete-prof-btn');
        deleteBtn.addEventListener('click', () => {
            openDeleteProfModalFor(prof);
        });
        
        grid.appendChild(card);
    });
}

function openEditProfModalFor(prof) {
    const modal = document.getElementById('edit-prof-modal');
    if (!modal) return;
    
    document.getElementById('edit_prof_original_username').value = prof.username;
    document.getElementById('edit_prof_full_name').value = prof.full_name;
    document.getElementById('edit_prof_employee_id').value = prof.employee_id;
    document.getElementById('edit_prof_department').value = prof.department || 'CSE';
    document.getElementById('edit_prof_designation').value = prof.designation || 'Assistant Professor';
    document.getElementById('edit_prof_email').value = prof.email || '';
    document.getElementById('edit_prof_phone').value = prof.phone || '';
    document.getElementById('edit_prof_password').value = '';
    
    modal.removeAttribute('hidden');
}


function openDeleteProfModalFor(prof) {
    const modal = document.getElementById('delete-prof-modal');
    if (!modal) return;
    
    const nameSpan = document.getElementById('delete-prof-name-span');
    if (nameSpan) {
        nameSpan.textContent = prof.full_name || prof.username;
    }
    
    // Clear message
    const msgContainer = document.getElementById('delete-prof-msg');
    if (msgContainer) {
        msgContainer.textContent = '';
        msgContainer.className = 'message';
    }
    
    const confirmBtn = document.getElementById('confirm-delete-prof-btn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.addEventListener('click', async () => {
        const token = localStorage.getItem('jwt_token');
        try {
            const response = await fetch(`${API_URL}/students/professors/${prof.username}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (response.ok) {
                showMessage(msgContainer, "Professor successfully deleted!", "success-msg");
                setTimeout(() => {
                    modal.setAttribute('hidden', 'hidden');
                    fetchProfessors();
                }, 1500);
            } else {
                showMessage(msgContainer, data.detail || "Error deleting professor", "error-msg");
            }
        } catch (e) {
            showMessage(msgContainer, "Network error", "error-msg");
        }
    });
    
    modal.removeAttribute('hidden');
}

// Bind cancel button for delete modal
const cancelDeleteBtn = document.getElementById('cancel-delete-prof-btn');
if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', () => {
        const modal = document.getElementById('delete-prof-modal');
        if (modal) modal.setAttribute('hidden', 'hidden');
    });
}


function viewProfessorDirectory(professorName) {
    setStudentEditMode(false);
    selectedProfessor = professorName;
    
    const profSection = document.getElementById('professor-directory-section');
    const studSection = document.getElementById('student-directory-section');
    const backBtn = document.getElementById('back-to-dashboard-btn');
    const navDashboard = document.getElementById('nav-dashboard');
    const navProfessors = document.getElementById('nav-professors');
    const navStudentDetails = document.getElementById('nav-student-details');
    
    if (profSection) profSection.setAttribute('hidden', 'hidden');
    if (studSection) studSection.removeAttribute('hidden');
    if (backBtn) backBtn.style.display = 'inline-block';
    
    // Update active nav links: Highlight Student Details, show it in navbar for Admin
    if (navDashboard) navDashboard.classList.remove('active');
    if (navProfessors) navProfessors.classList.remove('active');
    if (navStudentDetails) {
        navStudentDetails.style.display = 'inline-block';
        navStudentDetails.classList.add('active');
    }
    
    // Populate and show the professional header card
    const profHeaderCard = document.getElementById('prof-directory-header-card');
    if (profHeaderCard) {
        const prof = cachedProfessors.find(p => p.username === professorName);
        if (prof) {
            const initials = getProfessorInitials(prof.full_name || prof.username);
            const statusClean = (prof.status || 'present').toLowerCase();
            const statusGlowClass = statusClean === 'absent' ? 'status-absent-glow' : 'status-present-glow';
            const statusText = statusClean === 'absent' ? '🟡 Absent' : '🟢 Present';
            
            profHeaderCard.innerHTML = `
                <div class="prof-header-info">
                    <div class="prof-header-avatar">${initials}</div>
                    <div class="prof-header-details">
                        <h3>Professor: ${prof.full_name || prof.username}</h3>
                        <p>
                            <span><strong>Department:</strong> ${prof.department || 'CSE'}</span>
                            <span><strong>Assigned Students:</strong> ${prof.student_count}</span>
                        </p>
                    </div>
                </div>
                <div class="prof-header-status ${statusGlowClass}">
                    <span>Status:</span>
                    <strong>${statusText}</strong>
                </div>
            `;
            profHeaderCard.style.display = 'flex';
        } else {
            profHeaderCard.style.display = 'none';
        }
    }
    
    // Update directory title
    const titleEl = document.getElementById('directory-title');
    if (titleEl) {
        titleEl.textContent = `Student Directory - ${professorName}`;
    }
    
    // Load that professor's students
    fetchStudents();
}

// Nav dashboard toggle click listener
const navDashboardBtn = document.getElementById('nav-dashboard');
if (navDashboardBtn) {
    navDashboardBtn.addEventListener('click', (e) => {
        e.preventDefault();
        selectedProfessor = null;
        initializeDashboard();
    });
}

// Nav professors toggle click listener
const navProfessorsBtn = document.getElementById('nav-professors');
if (navProfessorsBtn) {
    navProfessorsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        selectedProfessor = null;
        initializeDashboard();
    });
}

// Back to dashboard list button click listener
const backBtn = document.getElementById('back-to-dashboard-btn');
if (backBtn) {
    backBtn.addEventListener('click', () => {
        selectedProfessor = null;
        initializeDashboard();
    });
}

function sanitizeSearchQuery(query) {
    return query.replace(/[<>"';\\\/]/g, '');
}

// Search filtering event listener
const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const rawQuery = e.target.value;
        const sanitized = sanitizeSearchQuery(rawQuery);
        if (rawQuery !== sanitized) {
            e.target.value = sanitized;
        }
        const query = sanitized.toLowerCase().trim();
        const filtered = cachedStudents.filter(st => {
            const nameMatch = (st.name ?? '').toLowerCase().includes(query);
            const rollMatch = (st.roll_number ?? '').toLowerCase().includes(query);
            const streamMatch = (st.be_stream ?? '').toLowerCase().includes(query);
            const companyMatch = ((st.company_1 ?? '') + ' ' + (st.company_2 ?? '')).toLowerCase().includes(query);
            return nameMatch || rollMatch || streamMatch || companyMatch;
        });
        renderStudents(filtered);
    });
}

// Professor Search and Sort event listeners
const profSearchInput = document.getElementById('prof-search-input');
if (profSearchInput) {
    profSearchInput.addEventListener('input', () => {
        const rawQuery = profSearchInput.value;
        const sanitized = sanitizeSearchQuery(rawQuery);
        if (rawQuery !== sanitized) {
            profSearchInput.value = sanitized;
        }
        renderProfessors();
    });
}

const profSortSelect = document.getElementById('prof-sort-select');
if (profSortSelect) {
    profSortSelect.addEventListener('change', () => {
        renderProfessors();
    });
}


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
const deleteStudentModal = document.getElementById('delete-student-modal');
const editModalDeleteBtn = document.getElementById('edit-modal-delete-btn');
let cachedStudents = [];
let isStudentEditMode = false;
let pendingDeleteStudentId = null;

function canManageStudents() {
    return getUsernameFromToken() !== 'admin';
}

function setStudentEditMode(enabled) {
    isStudentEditMode = !!enabled;
    const directorySection = document.getElementById('student-directory-section');
    if (directorySection) {
        directorySection.classList.toggle('student-edit-mode', isStudentEditMode);
    }
    if (navEditBtn) {
        navEditBtn.classList.toggle('edit-mode-active', isStudentEditMode);
        navEditBtn.setAttribute('aria-pressed', isStudentEditMode ? 'true' : 'false');
        const labelSpan = navEditBtn.querySelector('.edit-btn-label');
        if (labelSpan) {
            labelSpan.textContent = isStudentEditMode ? 'Done' : 'Edit';
        }
    }
    const query = document.getElementById('search-input')?.value.toLowerCase().trim() || '';
    if (query) {
        const filtered = cachedStudents.filter(st => {
            const nameMatch = (st.name ?? '').toLowerCase().includes(query);
            const rollMatch = (st.roll_number ?? '').toLowerCase().includes(query);
            const streamMatch = (st.be_stream ?? '').toLowerCase().includes(query);
            const companyMatch = ((st.company_1 ?? '') + ' ' + (st.company_2 ?? '')).toLowerCase().includes(query);
            return nameMatch || rollMatch || streamMatch || companyMatch;
        });
        renderStudents(filtered);
    } else {
        renderStudents(cachedStudents);
    }
}

function toggleStudentEditMode() {
    setStudentEditMode(!isStudentEditMode);
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('refresh_token');
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

if (navEditBtn) {
    navEditBtn.addEventListener('click', () => {
        if (!canManageStudents()) return;
        openEditModalFor(null);
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
    if (!editModal || !canManageStudents()) return;
    populateEditDropdown(id);
    
    // Show/hide select dropdown container based on whether a specific student ID was passed
    const selectContainer = document.getElementById('select_edit_student_container');
    if (selectContainer) {
        if (id) {
            selectContainer.style.display = 'none';
        } else {
            selectContainer.style.display = 'block';
        }
    }
    
    editModal.removeAttribute('hidden');
    if (typeof toggleEditFirstOfferFields === 'function') {
        toggleEditFirstOfferFields();
    }
}

function handleStudentRowClick(studentId) {
    openViewModalFor(studentId);
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
            ctc_2: ctc_2 || null,
            assignedProfessor: selectedProfessor || null
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

function renderStudents(students) {
    const tbody = document.getElementById('students-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const editModeActive = canManageStudents() && isStudentEditMode;

    students.forEach((student, index) => {
        const tr = document.createElement('tr');
        tr.className = 'student-data-row';
        tr.dataset.studentId = student.id;
        tr.setAttribute('role', 'button');
        tr.setAttribute('tabindex', '0');
        tr.setAttribute('aria-label', editModeActive
            ? `Edit ${student.name || 'student'}`
            : `View details for ${student.name || 'student'}`);
        if (editModeActive) {
            tr.classList.add('row-edit-mode');
        }
        tr.style.opacity = '0';
        tr.style.transform = 'translateY(10px)';
        tr.style.transition = 'opacity 0.25s ease, transform 0.25s ease';

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
        `;

        tr.addEventListener('click', () => handleStudentRowClick(student.id));
        tr.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleStudentRowClick(student.id);
            }
        });

        tbody.appendChild(tr);

        setTimeout(() => {
            tr.style.opacity = '1';
            tr.style.transform = 'translateY(0)';
        }, index * 20);
    });
}

function openViewModalFor(id) {
    const viewModal = document.getElementById('view-modal');
    if (!viewModal) return;
    
    const st = cachedStudents.find(s => s.id === id);
    if (!st) return;
    
    document.getElementById('view_roll_number').textContent = st.roll_number || '-';
    document.getElementById('view_name').textContent = st.name || '-';
    document.getElementById('view_be_stream').textContent = st.be_stream || '-';
    document.getElementById('view_first_offer').textContent = st.first_offer === null || st.first_offer === undefined ? '-' : (st.first_offer ? 'YES' : 'NO');
    document.getElementById('view_company_1').textContent = st.company_1 || '-';
    document.getElementById('view_ctc_1').textContent = st.ctc_1 || '-';
    document.getElementById('view_stipend_1').textContent = st.stipend_1 || '-';
    document.getElementById('view_second_offer').textContent = st.second_offer === null || st.second_offer === undefined ? '-' : (st.second_offer ? 'YES' : 'NO');
    document.getElementById('view_company_2').textContent = st.company_2 || '-';
    document.getElementById('view_ctc_2').textContent = st.ctc_2 || '-';
    
    const editFromViewBtn = document.getElementById('btn-edit-from-view');
    const actionsContainer = document.getElementById('view-modal-actions-container');
    if (actionsContainer) {
        actionsContainer.style.display = canManageStudents() ? 'flex' : 'none';
    }
    
    if (editFromViewBtn) {
        const newBtn = editFromViewBtn.cloneNode(true);
        editFromViewBtn.parentNode.replaceChild(newBtn, editFromViewBtn);
        newBtn.addEventListener('click', () => {
            viewModal.setAttribute('hidden', 'hidden');
            openEditModalFor(id);
        });
    }
    
    viewModal.removeAttribute('hidden');
}

const closeViewModalBtn = document.getElementById('close-view-modal');
if (closeViewModalBtn) {
    closeViewModalBtn.addEventListener('click', () => {
        const viewModal = document.getElementById('view-modal');
        if (viewModal) viewModal.setAttribute('hidden', 'hidden');
    });
}


async function fetchStudents() {
    const tbody = document.getElementById('students-tbody');
    const msgContainer = document.getElementById('fetch-msg');
    if (!tbody) return;
    
    const token = localStorage.getItem('jwt_token');
    
    try {
        let fetchUrl = `${API_URL}/students/`;
        if (getUsernameFromToken() === 'admin' && selectedProfessor) {
            fetchUrl += `?professor_username=${encodeURIComponent(selectedProfessor)}`;
        }
        
        const response = await fetch(fetchUrl, {
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
        
        // Re-apply search filter if user has typed a query
        const query = document.getElementById('search-input')?.value.toLowerCase().trim() || '';
        if (query) {
            const filtered = students.filter(st => {
                const nameMatch = (st.name ?? '').toLowerCase().includes(query);
                const rollMatch = (st.roll_number ?? '').toLowerCase().includes(query);
                const streamMatch = (st.be_stream ?? '').toLowerCase().includes(query);
                const companyMatch = ((st.company_1 ?? '') + ' ' + (st.company_2 ?? '')).toLowerCase().includes(query);
                return nameMatch || rollMatch || streamMatch || companyMatch;
            });
            renderStudents(filtered);
        } else {
            renderStudents(students);
        }
    } catch (error) {
        showMessage(msgContainer, "Failed to load records", "error-msg");
    }
}

function openDeleteStudentConfirmModal(id) {
    if (!canManageStudents() || !deleteStudentModal) return;
    const st = cachedStudents.find(s => s.id === id);
    if (!st) return;

    pendingDeleteStudentId = id;
    const nameSpan = document.getElementById('delete-student-name-span');
    if (nameSpan) {
        nameSpan.textContent = st.name || st.roll_number || 'this student';
    }
    deleteStudentModal.removeAttribute('hidden');
}

function closeDeleteStudentConfirmModal() {
    pendingDeleteStudentId = null;
    if (deleteStudentModal) {
        deleteStudentModal.setAttribute('hidden', 'hidden');
    }
    const msg = document.getElementById('delete-student-msg');
    if (msg) {
        msg.textContent = '';
        msg.className = 'message';
    }
}

async function confirmDeleteStudent() {
    if (!pendingDeleteStudentId) return;
    const id = pendingDeleteStudentId;
    const token = localStorage.getItem('jwt_token');
    const msgEl = document.getElementById('delete-student-msg');

    try {
        const response = await fetch(`${API_URL}/students/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            closeDeleteStudentConfirmModal();
            if (editModal) {
                editModal.setAttribute('hidden', 'hidden');
            }
            showMessage(document.getElementById('fetch-msg'), 'Student deleted successfully.', 'success-msg');
            fetchStudents();
        } else {
            const data = await response.json().catch(() => ({}));
            if (msgEl) {
                showMessage(msgEl, data.detail || 'Failed to delete student', 'error-msg');
            }
        }
    } catch (err) {
        console.error(err);
        if (msgEl) {
            showMessage(msgEl, 'Server error while deleting', 'error-msg');
        }
    }
}

if (editModalDeleteBtn) {
    editModalDeleteBtn.addEventListener('click', () => {
        const id = Number(document.getElementById('edit_student_id')?.value);
        if (id) {
            openDeleteStudentConfirmModal(id);
        }
    });
}

const cancelDeleteStudentBtn = document.getElementById('cancel-delete-student-btn');
if (cancelDeleteStudentBtn) {
    cancelDeleteStudentBtn.addEventListener('click', closeDeleteStudentConfirmModal);
}

const confirmDeleteStudentBtn = document.getElementById('confirm-delete-student-btn');
if (confirmDeleteStudentBtn) {
    confirmDeleteStudentBtn.addEventListener('click', confirmDeleteStudent);
}

if (deleteStudentModal) {
    deleteStudentModal.addEventListener('click', (e) => {
        if (e.target === deleteStudentModal) {
            closeDeleteStudentConfirmModal();
        }
    });
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

// --- Professor Management Modals & Forms ---
const addProfBtn = document.getElementById('add-prof-btn');
const addProfModal = document.getElementById('add-prof-modal');
const closeAddProfModal = document.getElementById('close-add-prof-modal');
const editProfModal = document.getElementById('edit-prof-modal');
const closeEditProfModal = document.getElementById('close-edit-prof-modal');

if (addProfBtn && addProfModal) {
    addProfBtn.addEventListener('click', () => {
        const form = document.getElementById('add-professor-form');
        if (form) form.reset();
        const msgContainer = document.getElementById('add-prof-msg');
        if (msgContainer) {
            msgContainer.textContent = '';
            msgContainer.className = 'message';
        }
        addProfModal.removeAttribute('hidden');
    });
}

if (closeAddProfModal && addProfModal) {
    closeAddProfModal.addEventListener('click', () => {
        addProfModal.setAttribute('hidden', 'hidden');
    });
}

if (closeEditProfModal && editProfModal) {
    closeEditProfModal.addEventListener('click', () => {
        editProfModal.setAttribute('hidden', 'hidden');
    });
}

const addProfForm = document.getElementById('add-professor-form');
if (addProfForm) {
    addProfForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const full_name = document.getElementById('prof_full_name').value;
        const username = document.getElementById('prof_username').value;
        const password = document.getElementById('prof_password').value;
        const employee_id = document.getElementById('prof_employee_id').value;
        const department = document.getElementById('prof_department').value;
        const designation = document.getElementById('prof_designation').value;
        const email = document.getElementById('prof_email').value;
        const phone = document.getElementById('prof_phone').value;
        
        const token = localStorage.getItem('jwt_token');
        const msgContainer = document.getElementById('add-prof-msg');
        
        const payload = {
            full_name,
            username,
            password,
            employee_id,
            department,
            designation,
            email: email || null,
            phone: phone || null,
            status: "present"
        };
        
        try {
            const response = await fetch(`${API_URL}/students/professors`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (response.ok) {
                showMessage(msgContainer, "Professor saved successfully!", "success-msg");
                setTimeout(() => {
                    addProfModal.setAttribute('hidden', 'hidden');
                    fetchProfessors();
                }, 1500);
            } else {
                showMessage(msgContainer, data.detail || "Error saving professor", "error-msg");
            }
        } catch (error) {
            showMessage(msgContainer, "Server error", "error-msg");
        }
    });
}

const editProfForm = document.getElementById('edit-professor-form');
if (editProfForm) {
    editProfForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const origUsername = document.getElementById('edit_prof_original_username').value;
        const full_name = document.getElementById('edit_prof_full_name').value;
        const employee_id = document.getElementById('edit_prof_employee_id').value;
        const department = document.getElementById('edit_prof_department').value;
        const designation = document.getElementById('edit_prof_designation').value;
        const email = document.getElementById('edit_prof_email').value;
        const phone = document.getElementById('edit_prof_phone').value;
        const password = document.getElementById('edit_prof_password').value;
        
        const token = localStorage.getItem('jwt_token');
        const msgContainer = document.getElementById('edit-prof-msg');
        
        const payload = {
            full_name,
            employee_id,
            department,
            designation,
            email: email || null,
            phone: phone || null,
            password: password || null
        };
        
        try {
            const response = await fetch(`${API_URL}/students/professors/${origUsername}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (response.ok) {
                showMessage(msgContainer, "Changes saved successfully!", "success-msg");
                setTimeout(() => {
                    editProfModal.setAttribute('hidden', 'hidden');
                    fetchProfessors();
                }, 1500);
            } else {
                showMessage(msgContainer, data.detail || "Error updating professor", "error-msg");
            }
        } catch (error) {
            showMessage(msgContainer, "Server error", "error-msg");
        }
    });
}


// --- Leave System Frontend Logic ---

// Leave submission modal elements
const leaveSubmissionModal = document.getElementById('leave-submission-modal');
const closeLeaveModalBtn = document.getElementById('close-leave-modal');
const leaveSubmissionForm = document.getElementById('leave-submission-form');
const profileStatusSelect = document.getElementById('profile-status-select');

// Admin leave details modal elements
const adminLeaveDetailsModal = document.getElementById('admin-leave-details-modal');
const closeAdminLeaveModalBtn = document.getElementById('close-admin-leave-modal');
const btnApproveLeave = document.getElementById('btn-approve-leave');
const btnRejectLeave = document.getElementById('btn-reject-leave');
const btnMarkActive = document.getElementById('btn-mark-active');

// Fullscreen preview elements
const filePreviewModal = document.getElementById('file-preview-modal');
const closeFullscreenPreviewBtn = document.getElementById('close-fullscreen-preview');
const btnFullscreenPreview = document.getElementById('btn-fullscreen-preview');

let currentLeaveUsername = ''; // track who is being reviewed by Admin
let currentLeaveAttachmentUrl = ''; // track attachment URL for preview

// 1. Fetch User Profile & Set Dropdown Status
let currentUserProfile = null;

async function fetchUserProfile() {
    const token = localStorage.getItem('jwt_token');
    if (!token) return;
    try {
        const response = await fetch(`${API_URL}/students/me`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            currentUserProfile = await response.json();
            
            // Update profile header role
            const roleEl = document.querySelector('.profile-role');
            if (roleEl) {
                if (currentUserProfile.role === 'admin') {
                    roleEl.textContent = 'Administrator';
                } else {
                    roleEl.textContent = currentUserProfile.designation || 'Assistant Professor';
                }
            }
            
            // Show/Hide profile status container based on role
            const statusContainer = document.getElementById('profile-status-container');
            if (statusContainer) {
                if (currentUserProfile.role === 'admin') {
                    statusContainer.style.display = 'none';
                } else {
                    statusContainer.style.display = 'flex';
                    
                    // Set status select value
                    if (profileStatusSelect) {
                        profileStatusSelect.value = currentUserProfile.status || 'present';
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error fetching user profile:", e);
    }
}

// 2. Status Dropdown Select Handler
if (profileStatusSelect) {
    profileStatusSelect.addEventListener('change', async () => {
        const selectedValue = profileStatusSelect.value;
        const previousValue = currentUserProfile ? currentUserProfile.status : 'present';
        
        if (selectedValue === 'absent') {
            // Open Leave Submission Modal
            if (leaveSubmissionForm) leaveSubmissionForm.reset();
            const msgEl = document.getElementById('leave-msg');
            if (msgEl) {
                msgEl.textContent = '';
                msgEl.className = 'message';
            }
            // Temporarily set it back in UI until form submits
            profileStatusSelect.value = previousValue;
            
            if (leaveSubmissionModal) {
                leaveSubmissionModal.removeAttribute('hidden');
            }
        } else if (selectedValue === 'present') {
            // Self return to present status
            const token = localStorage.getItem('jwt_token');
            try {
                const response = await fetch(`${API_URL}/students/leaves/self-present`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    if (currentUserProfile) currentUserProfile.status = 'present';
                    profileStatusSelect.value = 'present';
                    alert("Welcome back! Your status has been set to Present.");
                    // Re-initialize dashboard
                    initializeDashboard();
                } else {
                    const data = await response.json();
                    alert(data.detail || "Failed to update status to Present.");
                    profileStatusSelect.value = previousValue;
                }
            } catch (err) {
                console.error(err);
                alert("Server error. Please try again.");
                profileStatusSelect.value = previousValue;
            }
        }
    });
}

// Close Leave Modal Button
if (closeLeaveModalBtn && leaveSubmissionModal) {
    closeLeaveModalBtn.addEventListener('click', () => {
        leaveSubmissionModal.setAttribute('hidden', 'hidden');
    });
}

// 3. Submit Leave Form Handler
if (leaveSubmissionForm) {
    leaveSubmissionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const leaveComment = document.getElementById('leave_comment').value;
        const fileInput = document.getElementById('leave_file');
        const msgContainer = document.getElementById('leave-msg');
        
        if (!fileInput.files || fileInput.files.length === 0) {
            showMessage(msgContainer, "Please upload a leave supporting document.", "error-msg");
            return;
        }
        
        const file = fileInput.files[0];
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        
        // Frontend validation: File types
        if (!['.pdf', '.jpg', '.jpeg', '.png'].includes(ext)) {
            showMessage(msgContainer, "Allowed formats are PDF, JPG, JPEG, PNG only.", "error-msg");
            return;
        }
        
        // Frontend validation: File size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            showMessage(msgContainer, "File size cannot exceed 10MB.", "error-msg");
            return;
        }
        
        // Build FormData
        const formData = new FormData();
        formData.append('leave_comment', leaveComment);
        formData.append('file', file);
        
        const token = localStorage.getItem('jwt_token');
        try {
            const response = await fetch(`${API_URL}/students/leaves`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            
            const data = await response.json();
            if (response.ok) {
                showMessage(msgContainer, "Leave submitted successfully!", "success-msg");
                if (currentUserProfile) currentUserProfile.status = 'absent';
                if (profileStatusSelect) profileStatusSelect.value = 'absent';
                
                setTimeout(() => {
                    leaveSubmissionModal.setAttribute('hidden', 'hidden');
                    initializeDashboard();
                }, 1500);
            } else {
                showMessage(msgContainer, data.detail || "Error submitting leave request.", "error-msg");
            }
        } catch (err) {
            showMessage(msgContainer, "Server communication error.", "error-msg");
        }
    });
}

// 4. Admin Leave Modal Opener
async function openAdminLeaveModalFor(username) {
    if (!adminLeaveDetailsModal) return;
    
    currentLeaveUsername = username;
    const token = localStorage.getItem('jwt_token');
    
    // Clear and reset values
    document.getElementById('leave-prof-name').textContent = 'Loading...';
    document.getElementById('leave-prof-emp-id').textContent = '-';
    if (document.getElementById('leave-submitted-on')) document.getElementById('leave-submitted-on').textContent = '-';
    if (document.getElementById('leave-submitted-time')) document.getElementById('leave-submitted-time').textContent = '-';
    document.getElementById('leave-comment-text').textContent = '-';
    
    const statusBadge = document.getElementById('leave-status-badge');
    if (statusBadge) {
        statusBadge.textContent = 'Absent';
        statusBadge.className = 'status-badge absent';
    }
    
    // Reset preview
    document.getElementById('preview-placeholder').style.display = 'block';
    document.getElementById('preview-image').style.display = 'none';
    document.getElementById('preview-pdf').style.display = 'none';
    
    adminLeaveDetailsModal.removeAttribute('hidden');
    
    try {
        const response = await fetch(`${API_URL}/students/leaves/${username}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const leave = await response.json();
            
            document.getElementById('leave-prof-name').textContent = leave.full_name || username;
            document.getElementById('leave-prof-emp-id').textContent = leave.employee_id || '-';
            
            let dateStr = '-';
            let timeStr = '-';
            if (leave.uploaded_at) {
                const dateObj = new Date(leave.uploaded_at);
                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const day = dateObj.getDate();
                const month = months[dateObj.getMonth()];
                const year = dateObj.getFullYear();
                dateStr = `${day} ${month} ${year}`;
                
                let hours = dateObj.getHours();
                const minutes = dateObj.getMinutes().toString().padStart(2, '0');
                const ampm = hours >= 12 ? 'AM' : 'PM';
                hours = hours % 12;
                hours = hours ? hours : 12;
                timeStr = `${hours}:${minutes} ${ampm}`;
            }
            
            const dateEl = document.getElementById('leave-submitted-on');
            if (dateEl) dateEl.textContent = dateStr;
            const timeEl = document.getElementById('leave-submitted-time');
            if (timeEl) timeEl.textContent = timeStr;
            
            document.getElementById('leave-comment-text').textContent = leave.leave_comment || '';
            
            // Set leave status badge
            if (statusBadge) {
                statusBadge.textContent = 'Absent';
                statusBadge.className = 'status-badge absent';
            }
            
            // Render attachment preview
            const filename = leave.attachment_filename;
            if (filename) {
                const hostUrl = API_URL.replace('/api', ''); // remove /api path to get root URL
                currentLeaveAttachmentUrl = `${hostUrl}/uploads/${filename}`;
                
                const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
                const downloadLink = document.getElementById('btn-download-attachment');
                if (downloadLink) {
                    downloadLink.href = currentLeaveAttachmentUrl;
                }
                
                if (['.jpg', '.jpeg', '.png'].includes(ext)) {
                    // Show Image
                    document.getElementById('preview-placeholder').style.display = 'none';
                    const img = document.getElementById('preview-image');
                    img.src = currentLeaveAttachmentUrl;
                    img.style.display = 'block';
                } else if (ext === '.pdf') {
                    // Show PDF
                    document.getElementById('preview-placeholder').style.display = 'none';
                    const iframe = document.getElementById('preview-pdf');
                    iframe.src = currentLeaveAttachmentUrl;
                    iframe.style.display = 'block';
                }
            }
        } else {
            const data = await response.json();
            alert(data.detail || "Error loading leave details.");
            adminLeaveDetailsModal.setAttribute('hidden', 'hidden');
        }
    } catch (err) {
        console.error(err);
        alert("Could not load leave request details.");
        adminLeaveDetailsModal.setAttribute('hidden', 'hidden');
    }
}

// Make openAdminLeaveModalFor accessible globally
window.openAdminLeaveModalFor = openAdminLeaveModalFor;

// Close Admin Leave Modal Button
if (closeAdminLeaveModalBtn && adminLeaveDetailsModal) {
    closeAdminLeaveModalBtn.addEventListener('click', () => {
        adminLeaveDetailsModal.setAttribute('hidden', 'hidden');
    });
}

// 6. Fullscreen Document View
if (btnFullscreenPreview && filePreviewModal) {
    btnFullscreenPreview.addEventListener('click', () => {
        const filename = currentLeaveAttachmentUrl.substring(currentLeaveAttachmentUrl.lastIndexOf('/') + 1);
        const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
        
        document.getElementById('fullscreen-preview-image').style.display = 'none';
        document.getElementById('fullscreen-preview-pdf').style.display = 'none';
        
        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
            const img = document.getElementById('fullscreen-preview-image');
            img.src = currentLeaveAttachmentUrl;
            img.style.display = 'block';
        } else if (ext === '.pdf') {
            const iframe = document.getElementById('fullscreen-preview-pdf');
            iframe.src = currentLeaveAttachmentUrl;
            iframe.style.display = 'block';
        }
        
        filePreviewModal.removeAttribute('hidden');
    });
}

if (closeFullscreenPreviewBtn && filePreviewModal) {
    closeFullscreenPreviewBtn.addEventListener('click', () => {
        filePreviewModal.setAttribute('hidden', 'hidden');
    });
}


// --- User Settings Dashboard JS Implementation ---

// 1. Toast Notification System
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px) scale(0.95)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// 2. Toggle Password Visibility Eye Toggler
function togglePasswordVisibility(id) {
    const el = document.getElementById(id);
    if (el) {
        el.type = el.type === 'password' ? 'text' : 'password';
    }
}
window.togglePasswordVisibility = togglePasswordVisibility;

// 3. Settings View Loading & Applying
let currentSettings = null;

async function fetchSettings() {
    const token = localStorage.getItem('jwt_token');
    if (!token) return;
    try {
        const response = await fetch(`${API_URL}/students/settings`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            currentSettings = await response.json();
            populateSettingsUI(currentSettings);
            applyUserSettings(currentSettings);
        }
    } catch (err) {
        console.error("Error fetching settings:", err);
    }
}

function applyUserSettings(settings) {
    if (!settings) return;
    
    // Theme Mode
    const htmlEl = document.documentElement;
    const theme = settings.theme || 'dark';
    if (theme === 'light') {
        htmlEl.classList.add('light-theme');
    } else if (theme === 'dark') {
        htmlEl.classList.remove('light-theme');
    } else {
        // System Theme Default
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            htmlEl.classList.remove('light-theme');
        } else {
            htmlEl.classList.add('light-theme');
        }
    }
    
    // Accent Color
    htmlEl.classList.remove('accent-purple', 'accent-blue', 'accent-emerald', 'accent-rose');
    htmlEl.classList.add(`accent-${settings.accent_color || 'purple'}`);
    
    // Layout Densities
    htmlEl.classList.remove('layout-compact', 'layout-comfortable', 'layout-spacious');
    htmlEl.classList.add(`layout-${settings.layout_size || 'comfortable'}`);
    
    // Reduce Motion / Animations
    if (settings.reduce_motion) {
        htmlEl.classList.add('reduce-motion');
    } else {
        htmlEl.classList.remove('reduce-motion');
    }
    
    // Sticky Navbar
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        if (settings.sticky_navbar) {
            navbar.style.position = 'sticky';
            navbar.style.top = '1rem';
            navbar.style.zIndex = '1000';
        } else {
            navbar.style.position = '';
            navbar.style.top = '';
            navbar.style.zIndex = '';
        }
    }
    
    // Compact Table View
    const table = document.getElementById('students-table');
    if (table) {
        if (settings.compact_table_view) {
            table.classList.add('compact-table');
        } else {
            table.classList.remove('compact-table');
        }
    }
}

function populateSettingsUI(settings) {
    if (!settings) return;
    
    // Radios
    const themeRadio = document.querySelector(`input[name="settings-theme"][value="${settings.theme}"]`);
    if (themeRadio) themeRadio.checked = true;
    
    const accentRadio = document.querySelector(`input[name="settings-accent"][value="${settings.accent_color}"]`);
    if (accentRadio) accentRadio.checked = true;
    
    const layoutRadio = document.querySelector(`input[name="settings-layout"][value="${settings.layout_size}"]`);
    if (layoutRadio) layoutRadio.checked = true;
    
    // Checkboxes
    document.getElementById('settings-notif-email').checked = settings.email_notifications;
    document.getElementById('settings-notif-leave').checked = settings.leave_approval_alerts;
    document.getElementById('settings-notif-student').checked = settings.student_update_alerts;
    document.getElementById('settings-notif-security').checked = settings.security_login_alerts;
    document.getElementById('settings-notif-dashboard').checked = settings.dashboard_notifications;
    
    document.getElementById('settings-pref-animations').checked = settings.animations_enabled;
    document.getElementById('settings-pref-motion').checked = settings.reduce_motion;
    document.getElementById('settings-pref-sticky').checked = settings.sticky_navbar;
    document.getElementById('settings-pref-compact-table').checked = settings.compact_table_view;
    document.getElementById('settings-pref-autosave').checked = settings.auto_save;
    document.getElementById('settings-pref-remember').checked = settings.remember_last_page;
}

// 4. Save Settings API Call
async function saveSettings(silent = false) {
    const token = localStorage.getItem('jwt_token');
    if (!token) return;
    
    const themeChecked = document.querySelector('input[name="settings-theme"]:checked');
    const accentChecked = document.querySelector('input[name="settings-accent"]:checked');
    const layoutChecked = document.querySelector('input[name="settings-layout"]:checked');
    
    const theme = themeChecked ? themeChecked.value : 'dark';
    const accent_color = accentChecked ? accentChecked.value : 'purple';
    const layout_size = layoutChecked ? layoutChecked.value : 'comfortable';
    
    const payload = {
        theme,
        accent_color,
        layout_size,
        animations_enabled: document.getElementById('settings-pref-animations').checked,
        reduce_motion: document.getElementById('settings-pref-motion').checked,
        sticky_navbar: document.getElementById('settings-pref-sticky').checked,
        compact_table_view: document.getElementById('settings-pref-compact-table').checked,
        auto_save: document.getElementById('settings-pref-autosave').checked,
        remember_last_page: document.getElementById('settings-pref-remember').checked,
        
        email_notifications: document.getElementById('settings-notif-email').checked,
        leave_approval_alerts: document.getElementById('settings-notif-leave').checked,
        student_update_alerts: document.getElementById('settings-notif-student').checked,
        security_login_alerts: document.getElementById('settings-notif-security').checked,
        dashboard_notifications: document.getElementById('settings-notif-dashboard').checked
    };
    
    try {
        const response = await fetch(`${API_URL}/students/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            currentSettings = payload;
            applyUserSettings(payload);
            if (!silent) {
                showToast("Settings saved successfully!");
            }
        } else {
            if (!silent) {
                showToast("Failed to save settings details.", "error");
            }
        }
    } catch (err) {
        console.error("Error saving settings:", err);
        if (!silent) {
            showToast("Server communication error.", "error");
        }
    }
}

// 5. Account Details Forms
const settingsProfileForm = document.getElementById('settings-profile-form');
if (settingsProfileForm) {
    settingsProfileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fullName = document.getElementById('settings-fullname').value;
        const email = document.getElementById('settings-email').value;
        const phone = document.getElementById('settings-phone').value;
        
        const token = localStorage.getItem('jwt_token');
        try {
            const response = await fetch(`${API_URL}/students/settings/profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ full_name: fullName, email, phone })
            });
            
            if (response.ok) {
                showToast("Profile information saved successfully!");
                fetchProfileDetails();
            } else {
                const data = await response.json();
                showToast(data.detail || "Failed to update profile.", "error");
            }
        } catch (err) {
            showToast("Server connection failed.", "error");
        }
    });
}

// 6. Avatar Upload / Remove handlers
const avatarInput = document.getElementById('avatar-upload-input');
const btnRemoveAvatar = document.getElementById('btn-remove-avatar');

if (avatarInput) {
    avatarInput.addEventListener('change', async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
            showToast("Only JPG, JPEG, and PNG files are allowed.", "error");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast("File size must be under 5MB limit.", "error");
            return;
        }
        
        const formData = new FormData();
        formData.append('file', file);
        
        const token = localStorage.getItem('jwt_token');
        try {
            const response = await fetch(`${API_URL}/students/settings/profile-picture`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            
            const data = await response.json();
            if (response.ok) {
                showToast("Profile image uploaded successfully!");
                fetchProfileDetails();
            } else {
                showToast(data.detail || "Profile upload failed.", "error");
            }
        } catch (err) {
            showToast("Server connection error.", "error");
        }
    });
}

if (btnRemoveAvatar) {
    btnRemoveAvatar.addEventListener('click', async () => {
        if (!confirm("Are you sure you want to remove your profile picture?")) return;
        
        const token = localStorage.getItem('jwt_token');
        try {
            const response = await fetch(`${API_URL}/students/settings/profile-picture`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                showToast("Profile photo removed.");
                fetchProfileDetails();
            } else {
                showToast("Failed to delete photo.", "error");
            }
        } catch (err) {
            showToast("Database communication error.", "error");
        }
    });
}

// 7. Password update validation
const newPassInput = document.getElementById('settings-new-pass');
if (newPassInput) {
    newPassInput.addEventListener('input', () => {
        const val = newPassInput.value;
        let score = 0;
        if (val.length >= 8) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[a-z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?`~]/.test(val)) score++;
        
        const bar = document.getElementById('password-strength-bar');
        const text = document.getElementById('password-strength-text');
        
        if (!bar || !text) return;
        
        if (val.length === 0) {
            bar.style.width = '0%';
            text.textContent = 'Strength: Weak';
            bar.style.backgroundColor = 'rgba(255,255,255,0.1)';
        } else if (score <= 2) {
            bar.style.width = '30%';
            text.textContent = 'Strength: Weak';
            bar.style.backgroundColor = '#EF4444';
        } else if (score <= 4) {
            bar.style.width = '65%';
            text.textContent = 'Strength: Medium';
            bar.style.backgroundColor = '#F59E0B';
        } else {
            bar.style.width = '100%';
            text.textContent = 'Strength: Strong';
            bar.style.backgroundColor = '#10B981';
        }
    });
}

const settingsPasswordForm = document.getElementById('settings-password-form');
if (settingsPasswordForm) {
    settingsPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currPass = document.getElementById('settings-curr-pass').value;
        const newPass = document.getElementById('settings-new-pass').value;
        const confirmPass = document.getElementById('settings-confirm-pass').value;
        
        if (newPass !== confirmPass) {
            showToast("Passwords do not match.", "error");
            return;
        }
        
        const token = localStorage.getItem('jwt_token');
        try {
            const response = await fetch(`${API_URL}/students/password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ current_password: currPass, new_password: newPass })
            });
            
            const data = await response.json();
            if (response.ok) {
                showToast("Password updated successfully!");
                settingsPasswordForm.reset();
                const bar = document.getElementById('password-strength-bar');
                const text = document.getElementById('password-strength-text');
                if (bar) bar.style.width = '0%';
                if (text) text.textContent = 'Strength: Weak';
            } else {
                showToast(data.detail || "Failed to change password.", "error");
            }
        } catch (err) {
            showToast("Server communication error.", "error");
        }
    });
}

// 8. Fetch user profile details
async function fetchProfileDetails() {
    const token = localStorage.getItem('jwt_token');
    if (!token) return;
    try {
        const response = await fetch(`${API_URL}/students/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const me = await response.json();
            
            const fnInput = document.getElementById('settings-fullname');
            if (fnInput) fnInput.value = me.full_name || '';
            
            const unInput = document.getElementById('settings-username');
            if (unInput) unInput.value = me.username || '';
            
            const emInput = document.getElementById('settings-email');
            if (emInput) emInput.value = me.email || '';
            
            const phInput = document.getElementById('settings-phone');
            if (phInput) phInput.value = me.phone || '';
            
            const avatarInitialsEl = document.getElementById('settings-avatar-placeholder');
            const avatarImgEl = document.getElementById('settings-avatar-img');
            
            const navAvatarInitialsEl = document.getElementById('avatar-initials');
            const navDropdownAvatarInitialsEl = document.getElementById('dropdown-avatar-initials');
            
            const hostUrl = API_URL.replace('/api', '');
            
            if (me.profile_picture) {
                const picUrl = `${hostUrl}/uploads/${me.profile_picture}`;
                
                if (navAvatarInitialsEl) {
                    navAvatarInitialsEl.textContent = '';
                    navAvatarInitialsEl.style.backgroundImage = `url('${picUrl}')`;
                    navAvatarInitialsEl.style.backgroundSize = 'cover';
                    navAvatarInitialsEl.style.backgroundPosition = 'center';
                }
                if (navDropdownAvatarInitialsEl) {
                    navDropdownAvatarInitialsEl.textContent = '';
                    navDropdownAvatarInitialsEl.style.backgroundImage = `url('${picUrl}')`;
                    navDropdownAvatarInitialsEl.style.backgroundSize = 'cover';
                    navDropdownAvatarInitialsEl.style.backgroundPosition = 'center';
                }
                
                if (avatarInitialsEl) avatarInitialsEl.style.display = 'none';
                if (avatarImgEl) {
                    avatarImgEl.src = picUrl;
                    avatarImgEl.style.display = 'block';
                }
            } else {
                const initials = getInitials(me.full_name || me.username);
                if (navAvatarInitialsEl) {
                    navAvatarInitialsEl.textContent = initials;
                    navAvatarInitialsEl.style.backgroundImage = '';
                }
                if (navDropdownAvatarInitialsEl) {
                    navDropdownAvatarInitialsEl.textContent = initials;
                    navDropdownAvatarInitialsEl.style.backgroundImage = '';
                }
                
                if (avatarInitialsEl) {
                    avatarInitialsEl.textContent = initials;
                    avatarInitialsEl.style.display = 'flex';
                }
                if (avatarImgEl) {
                    avatarImgEl.src = '';
                    avatarImgEl.style.display = 'none';
                }
            }
            
            renderRolePreferences(me.role);
            
            const adminSec = document.getElementById('admin-only-controls-section');
            if (adminSec) {
                adminSec.style.display = me.role === 'admin' ? 'block' : 'none';
            }
        }
    } catch (err) {
        console.error(err);
    }
}

// 9. Role-Specific preference blocks
function renderRolePreferences(role) {
    const container = document.getElementById('pref-role-specific-container');
    if (!container) return;
    
    container.innerHTML = '';
    if (role === 'admin') {
        container.innerHTML = `
            <h3 style="margin-bottom: 0.75rem; font-size: 1rem;">Admin Preferences</h3>
            <div class="settings-switch-list" style="display: flex; flex-direction: column; gap: 1rem;">
                <div class="settings-switch-item" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.15); padding: 1rem; border-radius: 8px; border: 1px solid var(--card-border);">
                    <div class="switch-info" style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <span class="switch-title" style="font-weight: 600; font-size: 0.95rem;">Audit Access Logs</span>
                        <span class="switch-desc" style="font-size: 0.8rem; color: var(--text-secondary);">Save access actions to logs history database.</span>
                    </div>
                    <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                        <input type="checkbox" id="admin-pref-audit" checked style="opacity: 0; width: 0; height: 0;">
                        <span class="slider round" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255,255,255,0.15); transition: .4s; border-radius: 24px;"></span>
                    </label>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <h3 style="margin-bottom: 0.75rem; font-size: 1rem;">Professor Leave Preferences</h3>
            <div class="settings-switch-list" style="display: flex; flex-direction: column; gap: 1rem;">
                <div class="settings-switch-item" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.15); padding: 1rem; border-radius: 8px; border: 1px solid var(--card-border);">
                    <div class="switch-info" style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <span class="switch-title" style="font-weight: 600; font-size: 0.95rem;">Auto-Email Students on Leave</span>
                        <span class="switch-desc" style="font-size: 0.8rem; color: var(--text-secondary);">Send status reports to your assigned class list when on leave.</span>
                    </div>
                    <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                        <input type="checkbox" id="prof-pref-autoemail" checked style="opacity: 0; width: 0; height: 0;">
                        <span class="slider round" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255,255,255,0.15); transition: .4s; border-radius: 24px;"></span>
                    </label>
                </div>
            </div>
        `;
    }
}

// 10. Sessions Management
async function fetchSessions() {
    const token = localStorage.getItem('jwt_token');
    if (!token) return;
    try {
        const response = await fetch(`${API_URL}/students/settings/sessions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const sessions = await response.json();
            renderSessionsList(sessions);
        }
    } catch (err) {
        console.error("Error fetching sessions:", err);
    }
}

function renderSessionsList(sessions) {
    const listContainer = document.getElementById('settings-session-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    sessions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'session-item';
        
        const isCurrentBadge = s.is_current ? '<span class="session-current-badge">Current Session</span>' : '';
        
        let icon = '💻';
        if (s.device.toLowerCase().includes('android') || s.device.toLowerCase().includes('ios')) {
            icon = '📱';
        }
        
        item.innerHTML = `
            <div style="display: flex; align-items: center;">
                <span class="session-icon" style="font-size: 1.5rem;">${icon}</span>
                <div class="session-info" style="display: flex; flex-direction: column; gap: 0.15rem; margin-left: 0.75rem; flex: 1;">
                    <span class="session-info-title" style="font-size: 0.9rem; font-weight: 600;">${s.device} - ${s.browser}</span>
                    <span class="session-info-meta" style="font-size: 0.75rem; color: var(--text-secondary);">IP: ${s.ip_address} | Last Active: ${new Date(s.last_active).toLocaleString()}</span>
                </div>
            </div>
            ${isCurrentBadge}
        `;
        listContainer.appendChild(item);
    });
}

const btnLogoutOthers = document.getElementById('btn-logout-others');
if (btnLogoutOthers) {
    btnLogoutOthers.addEventListener('click', async () => {
        if (!confirm("Are you sure you want to log out all other active sessions? All other browsers will be prompted to log in again.")) return;
        
        const token = localStorage.getItem('jwt_token');
        try {
            const response = await fetch(`${API_URL}/students/settings/sessions/logout-others`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                showToast("Logged out of all other sessions!");
                fetchSessions();
            } else {
                showToast("Failed to revoke other sessions.", "error");
            }
        } catch (err) {
            showToast("Network connection error.", "error");
        }
    });
}

// 11. Tab Switching & AutoSave setup
const tabBtns = document.querySelectorAll('.settings-tab-btn');
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        const targetPane = document.getElementById(`tab-pane-${targetTab}`);
        if (targetPane) targetPane.classList.add('active');
    });
});

const setupAutoSave = () => {
    const controls = document.querySelectorAll('#settings-section input[type="checkbox"], #settings-section input[type="radio"]');
    controls.forEach(control => {
        control.addEventListener('change', () => {
            const autoSaveEnabled = document.getElementById('settings-pref-autosave').checked;
            if (autoSaveEnabled) {
                saveSettings(true); // silent save
            }
        });
    });
    
    const autoSaveCheckbox = document.getElementById('settings-pref-autosave');
    if (autoSaveCheckbox) {
        autoSaveCheckbox.addEventListener('change', () => {
            saveSettings(false);
        });
    }
};

function navigateToStudentDirectory() {
    const username = getUsernameFromToken();
    const navDashboard = document.getElementById('nav-dashboard');
    const navProfessors = document.getElementById('nav-professors');
    const navSettings = document.getElementById('nav-settings');
    const navStudentDetails = document.getElementById('nav-student-details');
    const profSection = document.getElementById('professor-directory-section');
    const studSection = document.getElementById('student-directory-section');
    const settingsSection = document.getElementById('settings-section');
    const securitySection = document.getElementById('security-section');
    const backBtn = document.getElementById('back-to-dashboard-btn');

    if (username === 'admin') {
        if (selectedProfessor) {
            // Show the selected professor's student directory
            if (settingsSection) settingsSection.setAttribute('hidden', 'hidden');
            if (securitySection) securitySection.setAttribute('hidden', 'hidden');
            if (profSection) profSection.setAttribute('hidden', 'hidden');
            if (studSection) {
                studSection.removeAttribute('hidden');
                // Restore scroll position
                const scrollContainer = document.querySelector('.student-directory-scroll');
                if (scrollContainer) {
                    scrollContainer.scrollTop = studentDirectoryScrollTop;
                }
            }
            if (backBtn) backBtn.style.display = 'inline-block';

            // Navbar adjustments
            document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
            if (navStudentDetails) {
                navStudentDetails.style.display = 'inline-block';
                navStudentDetails.classList.add('active');
            }
            if (navSettings) navSettings.style.display = 'none';
        } else {
            // No selected professor, redirect to Professor Management dashboard first
            selectedProfessor = null;
            initializeDashboard();
        }
    } else {
        // Professor user - show their own student directory
        if (settingsSection) settingsSection.setAttribute('hidden', 'hidden');
        if (securitySection) securitySection.setAttribute('hidden', 'hidden');
        if (profSection) profSection.setAttribute('hidden', 'hidden');
        if (studSection) {
            studSection.removeAttribute('hidden');
            // Restore scroll position
            const scrollContainer = document.querySelector('.student-directory-scroll');
            if (scrollContainer) {
                scrollContainer.scrollTop = studentDirectoryScrollTop;
            }
        }
        if (backBtn) backBtn.style.display = 'none';

        // Navbar adjustments
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        if (navStudentDetails) {
            navStudentDetails.style.display = 'inline-block';
            navStudentDetails.classList.add('active');
        }
        if (navSettings) navSettings.style.display = 'none';
    }
}

// 12. Open settings handler
function openSettingsView() {
    const username = getUsernameFromToken();
    const navDashboard = document.getElementById('nav-dashboard');
    const navProfessors = document.getElementById('nav-professors');
    const navSettings = document.getElementById('nav-settings');
    const navStudentDetails = document.getElementById('nav-student-details');
    const profSection = document.getElementById('professor-directory-section');
    const studSection = document.getElementById('student-directory-section');
    const settingsSection = document.getElementById('settings-section');
    const backBtn = document.getElementById('back-to-dashboard-btn');
    
    // Save scroll position of student directory if currently visible
    const scrollContainer = document.querySelector('.student-directory-scroll');
    if (scrollContainer && studSection && !studSection.hasAttribute('hidden')) {
        studentDirectoryScrollTop = scrollContainer.scrollTop;
    }
    
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    
    if (navSettings) {
        navSettings.style.display = 'inline-block';
        navSettings.classList.add('active');
    }
    
    // Ensure Student Details nav link is shown on Settings page for navigation back (only for Professors)
    if (navStudentDetails) {
        if (username === 'admin') {
            navStudentDetails.style.display = 'none';
        } else {
            navStudentDetails.style.display = 'inline-block';
        }
    }
    
    if (profSection) profSection.setAttribute('hidden', 'hidden');
    if (studSection) studSection.setAttribute('hidden', 'hidden');
    if (settingsSection) settingsSection.removeAttribute('hidden');
    if (backBtn) backBtn.style.display = 'inline-block';
    
    fetchSettings();
    fetchProfileDetails();
    fetchSessions();
}

// Dropdown click listener
const dropdownSettingsBtn = document.getElementById('dropdown-settings-link');
if (dropdownSettingsBtn) {
    dropdownSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const profileDropdown = document.getElementById('profile-dropdown');
        if (profileDropdown) profileDropdown.setAttribute('hidden', 'hidden');
        openSettingsView();
    });
}

// Nav settings click listener
const navSettingsBtn = document.getElementById('nav-settings');
if (navSettingsBtn) {
    navSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openSettingsView();
    });
}

// Initialize setup
window.addEventListener('DOMContentLoaded', () => {
    setupAutoSave();
});

// --- Security Audit Dashboard Implementation ---

function openSecurityDashboard() {
    const navDashboard = document.getElementById('nav-dashboard');
    const navProfessors = document.getElementById('nav-professors');
    const navSettings = document.getElementById('nav-settings');
    const navStudentDetails = document.getElementById('nav-student-details');
    const navSecurity = document.getElementById('nav-security');
    const profSection = document.getElementById('professor-directory-section');
    const studSection = document.getElementById('student-directory-section');
    const settingsSection = document.getElementById('settings-section');
    const securitySection = document.getElementById('security-section');
    const backBtn = document.getElementById('back-to-dashboard-btn');
    
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    
    if (navSecurity) {
        navSecurity.style.display = 'inline-block';
        navSecurity.classList.add('active');
    }
    
    if (profSection) profSection.setAttribute('hidden', 'hidden');
    if (studSection) studSection.setAttribute('hidden', 'hidden');
    if (settingsSection) settingsSection.setAttribute('hidden', 'hidden');
    if (securitySection) securitySection.removeAttribute('hidden');
    if (backBtn) backBtn.style.display = 'inline-block';
    
    fetchSecurityLogs();
}

async function fetchSecurityLogs() {
    const token = localStorage.getItem('jwt_token');
    if (!token) return;
    try {
        const response = await fetch(`${API_URL}/students/security/logs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            renderSecurityDashboard(data);
        }
    } catch (err) {
        console.error("Error fetching security logs:", err);
    }
}

function renderSecurityDashboard(data) {
    // 1. Audit Stats
    const headersEl = document.getElementById('security-audit-headers');
    const corsEl = document.getElementById('security-audit-cors');
    const httpsEl = document.getElementById('security-audit-https');
    const portsEl = document.getElementById('security-audit-ports');
    
    if (headersEl && data.audit_stats) {
        headersEl.textContent = data.audit_stats.secure_headers_active ? "🔒 Active" : "⚠️ Inactive";
        headersEl.style.color = data.audit_stats.secure_headers_active ? "var(--success-color, #10b981)" : "var(--error-color, #ef4444)";
    }
    if (corsEl && data.audit_stats) {
        corsEl.textContent = data.audit_stats.cors_restricted ? "🛡️ Restricted" : "⚠️ Unrestricted";
        corsEl.style.color = data.audit_stats.cors_restricted ? "var(--success-color, #10b981)" : "var(--error-color, #ef4444)";
    }
    if (httpsEl && data.audit_stats) {
        httpsEl.textContent = data.audit_stats.https_redirect ? "🟢 Active" : "🟡 Disabled (Local Dev)";
        httpsEl.style.color = data.audit_stats.https_redirect ? "var(--success-color, #10b981)" : "var(--text-secondary)";
    }
    if (portsEl && data.audit_stats) {
        portsEl.textContent = data.audit_stats.open_ports_audit || "Clean";
        portsEl.style.color = "var(--success-color, #10b981)";
    }
    
    // 2. Logs Table
    const tbody = document.getElementById('security-logs-tbody');
    if (tbody && data.logs) {
        tbody.innerHTML = '';
        if (data.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1rem; color: var(--text-secondary);">No security logs recorded yet.</td></tr>';
        } else {
            data.logs.forEach(log => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--card-border)';
                if (log.is_suspicious) {
                    tr.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
                    tr.style.color = '#fca5a5';
                }
                const dateStr = new Date(log.timestamp).toLocaleString();
                const userStr = log.username || 'System/Anonymous';
                const suspiciousBadge = log.is_suspicious ? '<span style="color: var(--error-color, #ef4444); font-weight: bold;">[!] </span>' : '';
                tr.innerHTML = `
                    <td style="padding: 0.6rem; white-space: nowrap;">${dateStr}</td>
                    <td style="padding: 0.6rem; font-weight: 600;">${userStr}</td>
                    <td style="padding: 0.6rem;">${suspiciousBadge}${log.action}</td>
                    <td style="padding: 0.6rem;">${log.ip_address || '-'}</td>
                    <td style="padding: 0.6rem; white-space: nowrap;">${log.device || '-'} / ${log.browser || '-'}</td>
                    <td style="padding: 0.6rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.details || ''}">${log.details || '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }
    
    // 3. Active Sessions Count
    const countEl = document.getElementById('security-active-sessions-list');
    if (countEl) {
        countEl.innerHTML = `
            <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 8px; border: 1px solid var(--card-border); text-align: center;">
                <span style="font-size: 0.85rem; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Active User Connections</span>
                <strong style="font-size: 2rem; color: var(--primary-color);">${data.session_counts || 0}</strong>
            </div>
            <button id="security-logout-others-btn" class="btn danger-btn" style="width: 100%; margin-top: 0.5rem;">
                🔓 Terminate Other Faculty Sessions
            </button>
        `;
        const logoutOthersBtn = document.getElementById('security-logout-others-btn');
        if (logoutOthersBtn) {
            logoutOthersBtn.addEventListener('click', async () => {
                if (!confirm("Are you sure you want to log out all other active sessions globally?")) return;
                const token = localStorage.getItem('jwt_token');
                try {
                    const response = await fetch(`${API_URL}/students/settings/sessions/logout-others`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (response.ok) {
                        showToast("All other sessions logged out globally!");
                        fetchSecurityLogs();
                    } else {
                        showToast("Failed to revoke other sessions.", "error");
                    }
                } catch (err) {
                    showToast("Network connection error.", "error");
                }
            });
        }
    }
    
    // 4. Lockouts / Anomalies
    const lockoutsEl = document.getElementById('security-lockouts-list');
    if (lockoutsEl && data.active_lockouts) {
        lockoutsEl.innerHTML = '';
        const suspiciousLogs = data.logs ? data.logs.filter(l => l.is_suspicious) : [];
        
        if (data.active_lockouts.length === 0 && suspiciousLogs.length === 0) {
            lockoutsEl.innerHTML = '<div style="color: var(--success-color, #10b981); text-align: center; padding: 1rem;">No active lockouts or recent anomalies detected.</div>';
        } else {
            if (data.active_lockouts.length > 0) {
                data.active_lockouts.forEach(lock => {
                    const lockTime = new Date(lock.locked_until).toLocaleTimeString();
                    const div = document.createElement('div');
                    div.style.padding = '0.5rem 0.75rem';
                    div.style.background = 'rgba(239, 68, 68, 0.1)';
                    div.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                    div.style.borderRadius = '6px';
                    div.style.marginBottom = '0.5rem';
                    div.style.display = 'flex';
                    div.style.justifyContent = 'space-between';
                    div.style.alignItems = 'center';
                    div.innerHTML = `
                        <span>👤 <strong>${lock.username}</strong> is locked out</span>
                        <span style="font-size: 0.75rem; color: #fca5a5;">Until ${lockTime}</span>
                    `;
                    lockoutsEl.appendChild(div);
                });
            }
            // Display top suspicious events
            const recentSuspicious = suspiciousLogs.slice(0, 5);
            if (recentSuspicious.length > 0) {
                const header = document.createElement('div');
                header.style.fontWeight = 'bold';
                header.style.marginTop = '0.75rem';
                header.style.marginBottom = '0.25rem';
                header.textContent = 'Recent Suspicious Events:';
                lockoutsEl.appendChild(header);
                
                recentSuspicious.forEach(log => {
                    const div = document.createElement('div');
                    div.style.fontSize = '0.8rem';
                    div.style.padding = '0.35rem 0.5rem';
                    div.style.borderLeft = '3px solid var(--error-color, #ef4444)';
                    div.style.background = 'rgba(255,255,255,0.02)';
                    div.style.marginBottom = '0.35rem';
                    div.innerHTML = `
                        <strong>${log.username || 'Anonymous'}</strong>: ${log.action}
                        <div style="font-size: 0.7rem; color: var(--text-secondary);">${new Date(log.timestamp).toLocaleTimeString()} - IP: ${log.ip_address}</div>
                    `;
                    lockoutsEl.appendChild(div);
                });
            }
        }
    }
}

// Nav link click event listener
const navSecurityBtn = document.getElementById('nav-security');
if (navSecurityBtn) {
    navSecurityBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openSecurityDashboard();
    });
}

// Refresh button event listener
const refreshLogsBtn = document.getElementById('refresh-security-logs-btn');
if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', () => {
        fetchSecurityLogs();
    });
}

// --- Fetch Interceptor & Token Refresh Mechanism ---

const originalFetch = window.fetch;
window.fetch = async function (resource, options) {
    let response = await originalFetch(resource, options);
    
    if (response.status === 401) {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
            const resourceUrl = typeof resource === 'string' ? resource : resource.url;
            if (resourceUrl && resourceUrl.includes('/auth/refresh')) {
                return response;
            }
            
            try {
                const refreshResponse = await originalFetch(`${API_URL}/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken })
                });
                
                if (refreshResponse.ok) {
                    const refreshData = await refreshResponse.json();
                    localStorage.setItem('jwt_token', refreshData.access_token);
                    
                    const newOptions = options ? { ...options } : {};
                    if (newOptions.headers) {
                        if (newOptions.headers instanceof Headers) {
                            newOptions.headers.set('Authorization', `Bearer ${refreshData.access_token}`);
                        } else {
                            newOptions.headers = {
                                ...newOptions.headers,
                                'Authorization': `Bearer ${refreshData.access_token}`
                            };
                        }
                    }
                    return await originalFetch(resource, newOptions);
                } else {
                    localStorage.removeItem('jwt_token');
                    localStorage.removeItem('refresh_token');
                    window.location.href = 'index.html';
                }
            } catch (err) {
                console.error("Token refresh failed:", err);
            }
        }
    }
    
    return response;
};

// --- Inactivity Timeout (15 minutes) ---

let inactivityTimeout;

function resetInactivityTimer() {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(() => {
        const token = localStorage.getItem('jwt_token');
        if (token) {
            showToast("Logged out due to 15 minutes of inactivity.", "error");
            setTimeout(() => {
                localStorage.removeItem('jwt_token');
                localStorage.removeItem('refresh_token');
                window.location.href = 'index.html';
            }, 1500);
        }
    }, 15 * 60 * 1000);
}

const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
activityEvents.forEach(eventName => {
    document.addEventListener(eventName, resetInactivityTimer, true);
});

resetInactivityTimer();

