const API_URL = 'http://localhost:3000/api';
let currentUser = null;
let mediaRecorder = null;
let audioChunks = [];

// Check authentication
function checkAuth() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (!token || !userStr) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = JSON.parse(userStr);
    initApp();
}

// Initialize app
function initApp() {
    document.getElementById('userInfo').textContent = `${currentUser.full_name} (${currentUser.role === 'admin' ? 'Админ' : 'Инженер'})`;
    
    // Show admin elements
    if (currentUser.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    }
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'login.html';
    });
    
    // Navigation
    document.querySelectorAll('[data-section]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.dataset.section;
            showSection(section);
            
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    
    // Modal handlers
    setupModals();
    
    // Load initial data
    loadShifts();
}

// Show section
function showSection(section) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.getElementById(`${section}Section`).style.display = 'block';
    
    if (section === 'shifts') loadShifts();
    if (section === 'reports') loadReports();
    if (section === 'users') loadUsers();
}

// API request helper
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };
    
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });
    
    if (response.status === 401 || response.status === 403) {
        localStorage.clear();
        window.location.href = 'login.html';
        return;
    }
    
    return response.json();
}

// Load shifts
async function loadShifts() {
    const shifts = await apiRequest('/shifts');
    const container = document.getElementById('shiftsTable');
    
    if (!shifts || shifts.length === 0) {
        container.innerHTML = '<p>Нет смен</p>';
        return;
    }
    
    let html = '<table class="table table-striped"><thead><tr><th>Инженер</th><th>Начало</th><th>Конец</th><th>Описание</th>';
    if (currentUser.role === 'admin') html += '<th>Действия</th>';
    html += '</tr></thead><tbody>';
    
    shifts.forEach(shift => {
        html += `<tr>
            <td>${shift.full_name || shift.username}</td>
            <td>${new Date(shift.start_time).toLocaleString('ru-RU')}</td>
            <td>${new Date(shift.end_time).toLocaleString('ru-RU')}</td>
            <td>${shift.description || '-'}</td>`;
        if (currentUser.role === 'admin') {
            html += `<td><button class="btn btn-sm btn-danger" onclick="deleteShift(${shift.id})">Удалить</button></td>`;
        }
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Load reports
async function loadReports() {
    const reports = await apiRequest('/reports');
    const container = document.getElementById('reportsTable');
    
    if (!reports || reports.length === 0) {
        container.innerHTML = '<p>Нет отчётов</p>';
        return;
    }
    
    let html = '<table class="table table-striped"><thead><tr><th>Инженер</th><th>Оборудование</th><th>Статус</th><th>Описание</th><th>Аудио</th><th>Дата</th></tr></thead><tbody>';
    
    reports.forEach(report => {
        const statusClass = `status-${report.status}`;
        const statusText = {
            'working': 'Исправно',
            'faulty': 'Неисправно',
            'maintenance': 'Обслуживание'
        }[report.status];
        
        html += `<tr>
            <td>${report.full_name || report.username}</td>
            <td>${report.equipment_id}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>${report.description || '-'}</td>
            <td>${report.audio_file ? '✅ Есть' : '-'}</td>
            <td>${new Date(report.created_at).toLocaleString('ru-RU')}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Load users (admin only)
async function loadUsers() {
    const users = await apiRequest('/users');
    const container = document.getElementById('usersTable');
    
    if (!users || users.length === 0) {
        container.innerHTML = '<p>Нет пользователей</p>';
        return;
    }
    
    let html = '<table class="table table-striped"><thead><tr><th>ID</th><th>Логин</th><th>Имя</th><th>Роль</th><th>Дата создания</th></tr></thead><tbody>';
    
    users.forEach(user => {
        html += `<tr>
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.full_name || '-'}</td>
            <td>${user.role === 'admin' ? 'Администратор' : 'Инженер'}</td>
            <td>${new Date(user.created_at).toLocaleString('ru-RU')}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Setup modals
function setupModals() {
    // Add shift button
    document.getElementById('addShiftBtn')?.addEventListener('click', async () => {
        const users = await apiRequest('/users');
        const select = document.getElementById('shiftUserId');
        select.innerHTML = users.filter(u => u.role === 'engineer')
            .map(u => `<option value="${u.id}">${u.full_name || u.username}</option>`).join('');
        
        new bootstrap.Modal(document.getElementById('shiftModal')).show();
    });
    
    // Save shift
    document.getElementById('saveShiftBtn')?.addEventListener('click', async () => {
        const data = {
            user_id: document.getElementById('shiftUserId').value,
            start_time: document.getElementById('shiftStartTime').value,
            end_time: document.getElementById('shiftEndTime').value,
            description: document.getElementById('shiftDescription').value
        };
        
        await apiRequest('/shifts', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        bootstrap.Modal.getInstance(document.getElementById('shiftModal')).hide();
        loadShifts();
    });
    
    // Add report button
    document.getElementById('addReportBtn').addEventListener('click', () => {
        new bootstrap.Modal(document.getElementById('reportModal')).show();
    });
    
    // Save report
    document.getElementById('saveReportBtn').addEventListener('click', async () => {
        const data = {
            equipment_id: document.getElementById('equipmentId').value,
            status: document.getElementById('reportStatus').value,
            description: document.getElementById('reportDescription').value
        };
        
        await apiRequest('/reports', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        bootstrap.Modal.getInstance(document.getElementById('reportModal')).hide();
        loadReports();
    });
    
    // Audio report
    document.getElementById('addAudioReportBtn').addEventListener('click', () => {
        new bootstrap.Modal(document.getElementById('audioReportModal')).show();
    });
    
    // Recording
    document.getElementById('recordBtn').addEventListener('click', startRecording);
    document.getElementById('stopRecordBtn').addEventListener('click', stopRecording);
    
    // Save audio report
    document.getElementById('saveAudioReportBtn').addEventListener('click', saveAudioReport);
}

// Audio recording
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.addEventListener('dataavailable', event => {
            audioChunks.push(event.data);
        });
        
        mediaRecorder.start();
        document.getElementById('recordBtn').disabled = true;
        document.getElementById('stopRecordBtn').disabled = false;
        document.getElementById('recordingStatus').textContent = 'Запись...';
    } catch (error) {
        alert('Ошибка доступа к микрофону');
        console.error(error);
    }
}

function stopRecording() {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    document.getElementById('recordBtn').disabled = false;
    document.getElementById('stopRecordBtn').disabled = true;
    document.getElementById('recordingStatus').textContent = 'Запись завершена';
}

async function saveAudioReport() {
    if (audioChunks.length === 0) {
        alert('Сначала сделайте запись');
        return;
    }
    
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob, 'report.webm');
    formData.append('equipment_id', document.getElementById('audioEquipmentId').value);
    formData.append('status', document.getElementById('audioReportStatus').value);
    formData.append('description', document.getElementById('audioReportDescription').value);
    
    await apiRequest('/reports/audio', {
        method: 'POST',
        body: formData
    });
    
    bootstrap.Modal.getInstance(document.getElementById('audioReportModal')).hide();
    audioChunks = [];
    document.getElementById('recordingStatus').textContent = '';
    loadReports();
}

// Delete shift
window.deleteShift = async function(id) {
    if (confirm('Удалить смену?')) {
        await apiRequest(`/shifts/${id}`, { method: 'DELETE' });
        loadShifts();
    }
};

// Init on load
checkAuth();
