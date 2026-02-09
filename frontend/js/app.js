const API_URL = 'http://localhost:3000';
let token = localStorage.getItem('token');
let currentUser = null;
let currentShiftId = null;

if (!token) window.location.href = 'login.html';

// Init
document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentUser();
    await loadShifts();
    await loadEquipment();
    setupEventListeners();
});

async function loadCurrentUser() {
    try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();
        currentUser = await res.json();
        document.getElementById('userInfo').textContent = `${currentUser.full_name || currentUser.username} (${currentUser.role === 'admin' ? 'Админ' : 'Инженер'})`;
        if (currentUser.role === 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'inline-block');
            await loadUsers();
        }
    } catch (error) {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    }
}

async function loadShifts() {
    try {
        const res = await fetch(`${API_URL}/api/shifts`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const shifts = await res.json();
        displayShifts(shifts);
    } catch (error) {
        alert('Ошибка загрузки смен');
    }
}

function displayShifts(shifts) {
    const container = document.getElementById('shiftsContainer');
    if (shifts.length === 0) {
        container.innerHTML = '<div class="col-12"><div class="alert alert-info">Смен не найдено</div></div>';
        return;
    }
    container.innerHTML = shifts.map(shift => {
        const start = new Date(shift.start_time).toLocaleString('ru-RU');
        const end = new Date(shift.end_time).toLocaleString('ru-RU');
        const hasReport = shift.has_report > 0;
        return `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card shift-card ${hasReport ? 'has-report' : 'no-report'}" onclick="viewShift(${shift.id})">
                    ${hasReport ? '<span class="badge bg-success badge-report"><i class="bi bi-check-circle"></i> Отчет есть</span>' : '<span class="badge bg-warning badge-report"><i class="bi bi-exclamation-circle"></i> Нет отчета</span>'}
                    <div class="card-body">
                        <h5 class="card-title"><i class="bi bi-person-badge"></i> ${shift.full_name || shift.username}</h5>
                        <p class="card-text">
                            <small class="text-muted">
                                <i class="bi bi-clock"></i> ${start}<br>
                                <i class="bi bi-clock-fill"></i> ${end}
                            </small>
                        </p>
                        ${shift.description ? `<p class="card-text"><i class="bi bi-info-circle"></i> ${shift.description}</p>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function viewShift(shiftId) {
    currentShiftId = shiftId;
    try {
        const [shiftRes, reportRes] = await Promise.all([
            fetch(`${API_URL}/api/shifts/${shiftId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_URL}/api/shifts/${shiftId}/report`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        
        const shift = await shiftRes.json();
        const hasReport = reportRes.ok;
        const report = hasReport ? await reportRes.json() : null;
        
        displayShiftDetails(shift, report, hasReport);
        new bootstrap.Modal(document.getElementById('shiftModal')).show();
    } catch (error) {
        alert('Ошибка загрузки данных');
    }
}

function displayShiftDetails(shift, report, hasReport) {
    const start = new Date(shift.start_time).toLocaleString('ru-RU');
    const end = new Date(shift.end_time).toLocaleString('ru-RU');
    
    document.getElementById('shiftDetails').innerHTML = `
        <div class="mb-3">
            <h6><i class="bi bi-person-badge"></i> Инженер:</h6>
            <p>${shift.full_name || shift.username}</p>
        </div>
        <div class="mb-3">
            <h6><i class="bi bi-clock"></i> Время смены:</h6>
            <p>Начало: ${start}<br>Конец: ${end}</p>
        </div>
        ${shift.description ? `<div class="mb-3"><h6><i class="bi bi-info-circle"></i> Описание:</h6><p>${shift.description}</p></div>` : ''}
    `;
    
    const reportSection = document.getElementById('reportSection');
    if (hasReport) {
        displayReport(report);
    } else {
        const canCreate = currentUser.role === 'admin' || shift.user_id === currentUser.id;
        reportSection.innerHTML = canCreate
            ? `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i> Отчет еще не создан</div>
               <button class="btn btn-success" onclick="openCreateReport()"><i class="bi bi-file-earmark-plus"></i> Создать отчет</button>`
            : `<div class="alert alert-info"><i class="bi bi-info-circle"></i> Отчет еще не создан инженером</div>`;
    }
}

function displayReport(report) {
    const statusBadge = report.status === 'working' ? 'success' : report.status === 'faulty' ? 'danger' : 'warning';
    const statusText = report.status === 'working' ? 'Исправно' : report.status === 'faulty' ? 'Неисправно' : 'Обслуживание';
    
    let html = `
        <div class="alert alert-success"><i class="bi bi-check-circle"></i> Отчет создан ${new Date(report.created_at).toLocaleString('ru-RU')}</div>
        <div class="mb-3">
            <h6><i class="bi bi-tools"></i> Оборудование:</h6>
            <p>${report.equipment_name || report.equipment_id} <span class="badge bg-${statusBadge}">${statusText}</span></p>
        </div>
        <div class="mb-3">
            <h6><i class="bi bi-text-left"></i> Описание:</h6>
            <p>${report.description}</p>
        </div>
    `;
    
    if (report.audio_file) {
        html += `
            <div class="mb-3">
                <h6><i class="bi bi-mic-fill"></i> Аудио отчет:</h6>
                <audio controls class="w-100" src="${API_URL}/api/audio/${report.audio_file}"></audio>
            </div>
        `;
    }
    
    if (report.photo_files && report.photo_files.length > 0) {
        html += `
            <div class="mb-3">
                <h6><i class="bi bi-image-fill"></i> Фотографии (${report.photo_files.length}):</h6>
                <div class="photo-gallery">
                    ${report.photo_files.map(photo => 
                        `<img src="${API_URL}/api/photos/${photo}" alt="Photo" onclick="viewPhoto('${API_URL}/api/photos/${photo}')">`
                    ).join('')}
                </div>
            </div>
        `;
    }
    
    if (currentUser.role === 'admin') {
        html += `<button class="btn btn-danger mt-2" onclick="deleteReport(${report.id})"><i class="bi bi-trash"></i> Удалить отчет</button>`;
    }
    
    document.getElementById('reportSection').innerHTML = html;
}

function openCreateReport() {
    document.getElementById('reportShiftId').value = currentShiftId;
    bootstrap.Modal.getInstance(document.getElementById('shiftModal')).hide();
    new bootstrap.Modal(document.getElementById('createReportModal')).show();
}

async function createReport() {
    const shiftId = document.getElementById('reportShiftId').value;
    const equipmentId = document.getElementById('reportEquipment').value;
    const status = document.getElementById('reportStatus').value;
    const description = document.getElementById('reportDescription').value;
    const audioFile = document.getElementById('reportAudio').files[0];
    const photoFiles = Array.from(document.getElementById('reportPhotos').files);
    
    if (!equipmentId || !status || !description) {
        alert('Заполните все обязательные поля');
        return;
    }
    
    if (photoFiles.length > 5) {
        alert('Можно загрузить максимум 5 фотографий');
        return;
    }
    
    const formData = new FormData();
    formData.append('shift_id', shiftId);
    formData.append('equipment_id', equipmentId);
    formData.append('status', status);
    formData.append('description', description);
    if (audioFile) formData.append('audio', audioFile);
    photoFiles.forEach(photo => formData.append('photos', photo));
    
    try {
        const res = await fetch(`${API_URL}/api/reports/media`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error);
        }
        
        alert('Отчет успешно создан!');
        bootstrap.Modal.getInstance(document.getElementById('createReportModal')).hide();
        document.getElementById('reportForm').reset();
        await loadShifts();
        await viewShift(shiftId);
    } catch (error) {
        alert(`Ошибка: ${error.message}`);
    }
}

async function deleteReport(reportId) {
    if (!confirm('Удалить отчет?')) return;
    
    try {
        await fetch(`${API_URL}/api/reports/${reportId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        alert('Отчет удален');
        bootstrap.Modal.getInstance(document.getElementById('shiftModal')).hide();
        await loadShifts();
    } catch (error) {
        alert('Ошибка удаления');
    }
}

function viewPhoto(photoUrl) {
    document.getElementById('photoModalImage').src = photoUrl;
    new bootstrap.Modal(document.getElementById('photoModal')).show();
}

let equipment = [];
async function loadEquipment() {
    try {
        const res = await fetch(`${API_URL}/api/equipment`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        equipment = await res.json();
        const select = document.getElementById('reportEquipment');
        select.innerHTML = '<option value="">Выберите...</option>' + 
            equipment.map(eq => `<option value="${eq.equipment_id}">${eq.name} (${eq.equipment_id})</option>`).join('');
    } catch (error) {
        console.error('Error loading equipment:', error);
    }
}

// Equipment Management
async function openEquipmentModal() {
    await loadEquipment();
    displayEquipmentList();
    new bootstrap.Modal(document.getElementById('equipmentModal')).show();
}

function displayEquipmentList() {
    const container = document.getElementById('equipmentList');
    if (equipment.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Оборудование не добавлено</div>';
        return;
    }
    
    container.innerHTML = `
        <table class="table table-striped">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Название</th>
                    <th>Тип</th>
                    <th>Расположение</th>
                    <th>Статус</th>
                    <th>Действия</th>
                </tr>
            </thead>
            <tbody>
                ${equipment.map(eq => {
                    const statusBadge = eq.status === 'working' ? 'success' : eq.status === 'faulty' ? 'danger' : eq.status === 'maintenance' ? 'warning' : 'secondary';
                    const statusText = eq.status === 'working' ? 'Работает' : eq.status === 'faulty' ? 'Неисправно' : eq.status === 'maintenance' ? 'Обслуживание' : 'Снято';
                    return `
                        <tr>
                            <td>${eq.equipment_id}</td>
                            <td>${eq.name}</td>
                            <td>${eq.type || '-'}</td>
                            <td>${eq.location || '-'}</td>
                            <td><span class="badge bg-${statusBadge}">${statusText}</span></td>
                            <td>
                                <button class="btn btn-sm btn-danger" onclick="deleteEquipment(${eq.id})">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function openAddEquipment() {
    document.getElementById('equipmentForm').reset();
    new bootstrap.Modal(document.getElementById('addEquipmentModal')).show();
}

async function saveEquipment() {
    const equipmentId = document.getElementById('equipmentId').value;
    const name = document.getElementById('equipmentName').value;
    const type = document.getElementById('equipmentType').value;
    const location = document.getElementById('equipmentLocation').value;
    const description = document.getElementById('equipmentDescription').value;
    
    if (!equipmentId || !name) {
        alert('Заполните ID и название');
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/api/equipment`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                equipment_id: equipmentId,
                name,
                type,
                location,
                description
            })
        });
        
        if (!res.ok) throw new Error('Ошибка создания');
        
        alert('Оборудование добавлено!');
        bootstrap.Modal.getInstance(document.getElementById('addEquipmentModal')).hide();
        await loadEquipment();
        displayEquipmentList();
    } catch (error) {
        alert(`Ошибка: ${error.message}`);
    }
}

async function deleteEquipment(equipmentId) {
    if (!confirm('Удалить оборудование?')) return;
    
    try {
        await fetch(`${API_URL}/api/equipment/${equipmentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        alert('Оборудование удалено');
        await loadEquipment();
        displayEquipmentList();
    } catch (error) {
        alert('Ошибка удаления');
    }
}

let users = [];
async function loadUsers() {
    try {
        const res = await fetch(`${API_URL}/api/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        users = await res.json();
        const select = document.getElementById('shiftUserId');
        const engineers = users.filter(u => u.role === 'engineer');
        select.innerHTML = engineers.map(u => `<option value="${u.id}">${u.full_name || u.username}</option>`).join('');
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function createShift() {
    const userId = document.getElementById('shiftUserId').value;
    const startTime = document.getElementById('shiftStartTime').value;
    const endTime = document.getElementById('shiftEndTime').value;
    const description = document.getElementById('shiftDescription').value;
    
    if (!userId || !startTime || !endTime) {
        alert('Заполните все поля');
        return;
    }
    
    try {
        await fetch(`${API_URL}/api/shifts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                start_time: startTime,
                end_time: endTime,
                description
            })
        });
        alert('Смена создана');
        bootstrap.Modal.getInstance(document.getElementById('addShiftModal')).hide();
        document.getElementById('shiftForm').reset();
        await loadShifts();
    } catch (error) {
        alert('Ошибка создания смены');
    }
}

function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    });
    
    document.getElementById('saveReportBtn').addEventListener('click', createReport);
    
    document.getElementById('addShiftBtn')?.addEventListener('click', () => {
        new bootstrap.Modal(document.getElementById('addShiftModal')).show();
    });
    
    document.getElementById('saveShiftBtn')?.addEventListener('click', createShift);
    
    // Equipment management
    document.getElementById('manageEquipmentBtn')?.addEventListener('click', openEquipmentModal);
    document.getElementById('addEquipmentBtn')?.addEventListener('click', openAddEquipment);
    document.getElementById('saveEquipmentBtn')?.addEventListener('click', saveEquipment);
}
