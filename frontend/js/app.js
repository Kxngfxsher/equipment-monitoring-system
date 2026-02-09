// API_URL определяется в config.js
let token = localStorage.getItem('token');
let currentUser = null;
let currentShiftId = null;
let allEquipment = [];

if (!token) window.location.href = 'login.html';

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentUser();
    await loadShifts();
    await loadEquipment();
    setupEventListeners();
});

async function loadCurrentUser() {
    try {
        const res = await fetch(`${API_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } });
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
        const res = await fetch(`${API_URL}/api/shifts`, { headers: { 'Authorization': `Bearer ${token}` } });
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
        const start = formatDate(shift.start_time);
        const end = formatDate(shift.end_time);
        const hasReport = shift.has_report > 0;
        return `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card shift-card ${hasReport ? 'has-report' : 'no-report'}" onclick="viewShift(${shift.id})">
                    ${hasReport ? '<span class="badge bg-success badge-report"><i class="bi bi-check-circle"></i> Отчет есть</span>' : '<span class="badge bg-warning badge-report"><i class="bi bi-exclamation-circle"></i> Нет отчета</span>'}
                    <div class="card-body">
                        <h5 class="card-title"><i class="bi bi-person-badge"></i> ${shift.full_name || shift.username}</h5>
                        <p class="card-text"><small class="text-muted"><i class="bi bi-clock"></i> ${start}<br><i class="bi bi-clock-fill"></i> ${end}</small></p>
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
            fetch(`${API_URL}/api/shifts/${shiftId}/report/v2`, { headers: { 'Authorization': `Bearer ${token}` } })
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
    const start = formatDate(shift.start_time);
    const end = formatDate(shift.end_time);
    document.getElementById('shiftDetails').innerHTML = `
        <div class="mb-3"><h6><i class="bi bi-person-badge"></i> Инженер:</h6><p>${shift.full_name || shift.username}</p></div>
        <div class="mb-3"><h6><i class="bi bi-clock"></i> Время смены:</h6><p>Начало: ${start}<br>Конец: ${end}</p></div>
        ${shift.description ? `<div class="mb-3"><h6><i class="bi bi-info-circle"></i> Описание:</h6><p>${shift.description}</p></div>` : ''}
    `;
    const footer = document.getElementById('shiftModalFooter');
    if (currentUser.role === 'admin') {
        footer.innerHTML = `<button class="btn btn-danger" onclick="deleteShift(${shift.id})"><i class="bi bi-trash"></i> Удалить смену</button>`;
    } else {
        footer.innerHTML = '';
    }
    const reportSection = document.getElementById('reportSection');
    if (hasReport) {
        displayReportV2(report);
    } else {
        const canCreate = currentUser.role === 'admin' || shift.user_id === currentUser.id;
        const shiftDate = new Date(shift.start_time);
        const today = new Date();
        shiftDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const isFuture = shiftDate > today;
        reportSection.innerHTML = canCreate
            ? (isFuture && currentUser.role !== 'admin'
                ? `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i> Нельзя создать отчёт для будущей смены</div>`
                : `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i> Отчет еще не создан</div>
                   <button class="btn btn-success" onclick="openCreateReport()"><i class="bi bi-file-earmark-plus"></i> Создать отчет</button>`)
            : `<div class="alert alert-info"><i class="bi bi-info-circle"></i> Отчет еще не создан инженером</div>`;
    }
}

function displayReportV2(report) {
    let html = `<div class="alert alert-success"><i class="bi bi-check-circle"></i> Отчет создан ${formatDate(report.created_at)}</div>`;
    if (report.equipment_items && report.equipment_items.length > 0) {
        html += `<h6><i class="bi bi-tools"></i> Оборудование (${report.equipment_items.length}):</h6>`;
        report.equipment_items.forEach(item => {
            const statusBadge = item.status === 'working' ? 'success' : item.status === 'faulty' ? 'danger' : 'warning';
            const statusText = item.status === 'working' ? 'Исправно' : item.status === 'faulty' ? 'Неисправно' : 'Обслуживание';
            html += `
                <div class="card mb-3">
                    <div class="card-body">
                        <h6 class="card-title">${item.name} <span class="badge bg-${statusBadge}">${statusText}</span></h6>
                        <p class="card-text"><small class="text-muted">${item.equipment_id} • ${item.type || ''} • ${item.location || ''}</small></p>
                        ${item.description ? `<p class="card-text">${item.description}</p>` : ''}
                        ${item.audio_file ? `<audio controls class="w-100 mt-2" src="${API_URL}/api/audio/${item.audio_file}"></audio>` : ''}
                        ${item.photo_files && item.photo_files.length > 0 ? `
                            <div class="photo-gallery mt-2">
                                ${item.photo_files.map(photo => `<img src="${API_URL}/api/photos/${photo}" alt="Photo" onclick="viewPhoto('${API_URL}/api/photos/${photo}')" onerror="this.style.display='none'">`).join('')}
                            </div>` : ''}
                    </div>
                </div>
            `;
        });
    }
    document.getElementById('reportSection').innerHTML = html;
}

async function openCreateReport() {
    try {
        const res = await fetch(`${API_URL}/api/equipment/latest-status`, { headers: { 'Authorization': `Bearer ${token}` } });
        allEquipment = await res.json();
        if (allEquipment.length === 0) {
            alert('Нет оборудования в системе');
            return;
        }
        document.getElementById('reportShiftId').value = currentShiftId;
        renderEquipmentCards();
        bootstrap.Modal.getInstance(document.getElementById('shiftModal')).hide();
        new bootstrap.Modal(document.getElementById('createReportModal')).show();
    } catch (error) {
        alert('Ошибка загрузки оборудования');
    }
}

function renderEquipmentCards() {
    const container = document.getElementById('equipmentCardsContainer');
    container.innerHTML = allEquipment.map((eq, index) => {
        const statusOptions = ['working', 'faulty', 'maintenance'];
        const statusNames = { working: 'Исправно', faulty: 'Неисправно', maintenance: 'Требует обслуживания' };
        return `
            <div class="card mb-3 equipment-card" data-equipment-id="${eq.equipment_id}">
                <div class="card-body">
                    <h6 class="card-title"><i class="bi bi-tools"></i> ${eq.name}</h6>
                    <p class="text-muted small">${eq.equipment_id} • ${eq.type || ''} • ${eq.location || ''}</p>
                    <div class="mb-2">
                        <label class="form-label"><i class="bi bi-circle-fill"></i> Статус</label>
                        <select class="form-control equipment-status" data-equipment-id="${eq.equipment_id}">
                            ${statusOptions.map(status => `<option value="${status}" ${status === eq.last_status ? 'selected' : ''}>${statusNames[status]}</option>`).join('')}
                        </select>
                    </div>
                    <div class="mb-2">
                        <label class="form-label"><i class="bi bi-text-left"></i> Описание</label>
                        <textarea class="form-control equipment-description" data-equipment-id="${eq.equipment_id}" rows="2" placeholder="Опишите состояние...">${eq.last_description || ''}</textarea>
                    </div>
                    <div class="mb-2">
                        <label class="form-label"><i class="bi bi-image-fill"></i> Фото (до 5 шт)</label>
                        <input type="file" class="form-control equipment-photos" data-equipment-id="${eq.equipment_id}" accept="image/*" multiple>
                    </div>
                    <div class="mb-2">
                        <label class="form-label"><i class="bi bi-mic-fill"></i> Аудио</label>
                        <input type="file" class="form-control equipment-audio" data-equipment-id="${eq.equipment_id}" accept="audio/*">
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function createReportV2() {
    const shiftId = document.getElementById('reportShiftId').value;
    const equipmentItems = [];
    const formData = new FormData();
    formData.append('shift_id', shiftId);
    
    allEquipment.forEach(eq => {
        const status = document.querySelector(`.equipment-status[data-equipment-id="${eq.equipment_id}"]`).value;
        const description = document.querySelector(`.equipment-description[data-equipment-id="${eq.equipment_id}"]`).value;
        const photos = document.querySelector(`.equipment-photos[data-equipment-id="${eq.equipment_id}"]`).files;
        const audio = document.querySelector(`.equipment-audio[data-equipment-id="${eq.equipment_id}"]`).files[0];
        
        if (photos.length > 5) {
            alert(`${eq.name}: максимум 5 фото`);
            return;
        }
        
        equipmentItems.push({ equipment_id: eq.equipment_id, status, description });
        
        Array.from(photos).forEach(photo => formData.append(`photos_${eq.equipment_id}`, photo));
        if (audio) formData.append(`audio_${eq.equipment_id}`, audio);
    });
    
    if (equipmentItems.length === 0) {
        alert('Нет оборудования для отчёта');
        return;
    }
    
    formData.append('equipment_items', JSON.stringify(equipmentItems));
    
    try {
        const res = await fetch(`${API_URL}/api/reports/v2/create`, {
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
        await loadShifts();
        await viewShift(shiftId);
    } catch (error) {
        alert(`Ошибка: ${error.message}`);
    }
}

async function deleteShift(shiftId) {
    if (!confirm('Удалить смену? Все отчеты и файлы будут удалены.')) return;
    try {
        await fetch(`${API_URL}/api/shifts/${shiftId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        alert('Смена удалена');
        bootstrap.Modal.getInstance(document.getElementById('shiftModal')).hide();
        await loadShifts();
    } catch (error) {
        alert('Ошибка удаления смены');
    }
}

function viewPhoto(photoUrl) {
    document.getElementById('photoModalImage').src = photoUrl;
    new bootstrap.Modal(document.getElementById('photoModal')).show();
}

let equipment = [];
async function loadEquipment() {
    try {
        const res = await fetch(`${API_URL}/api/equipment`, { headers: { 'Authorization': `Bearer ${token}` } });
        equipment = await res.json();
    } catch (error) {
        console.error('Error loading equipment:', error);
    }
}

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
            <thead><tr><th>ID</th><th>Название</th><th>Тип</th><th>Расположение</th><th>Действия</th></tr></thead>
            <tbody>
                ${equipment.map(eq => `
                    <tr>
                        <td>${eq.equipment_id}</td>
                        <td>${eq.name}</td>
                        <td>${eq.type || '-'}</td>
                        <td>${eq.location || '-'}</td>
                        <td><button class="btn btn-sm btn-danger" onclick="deleteEquipment(${eq.id})"><i class="bi bi-trash"></i></button></td>
                    </tr>
                `).join('')}
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
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ equipment_id: equipmentId, name, type, location, description })
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
        await fetch(`${API_URL}/api/equipment/${equipmentId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
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
        const res = await fetch(`${API_URL}/api/users`, { headers: { 'Authorization': `Bearer ${token}` } });
        users = await res.json();
        const select = document.getElementById('shiftUserId');
        const engineers = users.filter(u => u.role === 'engineer');
        select.innerHTML = engineers.map(u => `<option value="${u.id}">${u.full_name || u.username}</option>`).join('');
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function openUsersModal() {
    await loadUsers();
    displayUsersList();
    new bootstrap.Modal(document.getElementById('usersModal')).show();
}

function displayUsersList() {
    const container = document.getElementById('usersList');
    if (users.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Пользователей нет</div>';
        return;
    }
    container.innerHTML = `
        <table class="table table-striped">
            <thead><tr><th>Логин</th><th>Имя</th><th>Роль</th><th>Email</th><th>Описание</th><th>Действия</th></tr></thead>
            <tbody>
                ${users.map(user => {
                    const roleBadge = user.role === 'admin' ? 'danger' : 'primary';
                    const roleText = user.role === 'admin' ? 'Админ' : 'Инженер';
                    const canDelete = user.id !== currentUser.id;
                    return `
                        <tr>
                            <td>${user.username}</td>
                            <td>${user.full_name || '-'}</td>
                            <td><span class="badge bg-${roleBadge}">${roleText}</span></td>
                            <td>${user.email || '-'}</td>
                            <td>${user.description || '-'}</td>
                            <td>${canDelete ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})"><i class="bi bi-trash"></i></button>` : '<span class="text-muted">Текущий</span>'}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function openAddUser() {
    document.getElementById('userForm').reset();
    new bootstrap.Modal(document.getElementById('addUserModal')).show();
}

async function saveUser() {
    const username = document.getElementById('userUsername').value;
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;
    const firstName = document.getElementById('userFirstName').value;
    const lastName = document.getElementById('userLastName').value;
    const email = document.getElementById('userEmail').value;
    const description = document.getElementById('userDescription').value;
    if (!username || !password) {
        alert('Заполните логин и пароль');
        return;
    }
    try {
        const res = await fetch(`${API_URL}/api/users`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role, first_name: firstName, last_name: lastName, email, description })
        });
        if (!res.ok) throw new Error('Ошибка создания пользователя');
        alert('Пользователь создан!');
        bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
        await loadUsers();
        displayUsersList();
    } catch (error) {
        alert(`Ошибка: ${error.message}`);
    }
}

async function deleteUser(userId) {
    if (!confirm('Удалить пользователя? Все его смены и отчеты будут удалены.')) return;
    try {
        await fetch(`${API_URL}/api/users/${userId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        alert('Пользователь удален');
        await loadUsers();
        displayUsersList();
    } catch (error) {
        alert('Ошибка удаления пользователя');
    }
}

function setSchedule(type) {
    const dateInput = document.getElementById('shiftDate').value;
    if (!dateInput && type !== 'custom') {
        alert('Сначала выберите дату');
        return;
    }
    const timeFields = document.getElementById('timeFieldsContainer');
    if (type === 'custom') {
        timeFields.style.display = 'block';
        document.querySelectorAll('.schedule-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        return;
    }
    const date = new Date(dateInput);
    let startTime, endTime;
    if (type === '5/2') {
        startTime = new Date(date);
        startTime.setHours(8, 0, 0);
        endTime = new Date(date);
        endTime.setHours(17, 0, 0);
    } else if (type === '2/2') {
        startTime = new Date(date);
        startTime.setHours(10, 0, 0);
        endTime = new Date(date);
        endTime.setHours(22, 0, 0);
    }
    const formatDateTimeLocal = (dt) => {
        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        const hours = String(dt.getHours()).padStart(2, '0');
        const minutes = String(dt.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    document.getElementById('shiftStartTime').value = formatDateTimeLocal(startTime);
    document.getElementById('shiftEndTime').value = formatDateTimeLocal(endTime);
    timeFields.style.display = 'block';
    document.querySelectorAll('.schedule-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

async function createShift() {
    const userId = document.getElementById('shiftUserId').value;
    const startTime = document.getElementById('shiftStartTime').value;
    const endTime = document.getElementById('shiftEndTime').value;
    const description = document.getElementById('shiftDescription').value;
    if (!userId || !startTime || !endTime) {
        alert('Заполните все обязательные поля (инженер, время)');
        return;
    }
    try {
        await fetch(`${API_URL}/api/shifts`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, start_time: startTime, end_time: endTime, description })
        });
        alert('Смена создана');
        bootstrap.Modal.getInstance(document.getElementById('addShiftModal')).hide();
        document.getElementById('shiftForm').reset();
        document.getElementById('timeFieldsContainer').style.display = 'none';
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
    document.getElementById('saveReportBtn').addEventListener('click', createReportV2);
    document.getElementById('addShiftBtn')?.addEventListener('click', () => {
        new bootstrap.Modal(document.getElementById('addShiftModal')).show();
    });
    document.getElementById('saveShiftBtn')?.addEventListener('click', createShift);
    document.getElementById('manageEquipmentBtn')?.addEventListener('click', openEquipmentModal);
    document.getElementById('addEquipmentBtn')?.addEventListener('click', openAddEquipment);
    document.getElementById('saveEquipmentBtn')?.addEventListener('click', saveEquipment);
    document.getElementById('manageUsersBtn')?.addEventListener('click', openUsersModal);
    document.getElementById('addUserBtn')?.addEventListener('click', openAddUser);
    document.getElementById('saveUserBtn')?.addEventListener('click', saveUser);
}
