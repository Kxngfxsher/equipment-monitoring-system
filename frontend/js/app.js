// API_URL определяется в config.js
let token = localStorage.getItem('token');
let currentUser = null;
let currentShiftId = null;
let allEquipment = [];
let allShiftsData = []; // храним все смены

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
        allShiftsData = await res.json();
        
        // Мои смены
        const myShifts = allShiftsData.filter(s => currentUser && s.users && s.users.some(u => u.id === currentUser.id));
        displayShiftsInContainer(myShifts, 'myShiftsContainer', true);
        
        // Все смены
        displayShiftsInContainer(allShiftsData, 'allShiftsContainer', false);
    } catch (error) {
        alert('Ошибка загрузки смен');
    }
}

function displayShiftsInContainer(shifts, containerId, isMyTab) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (shifts.length === 0) {
        container.innerHTML = '<div class="col-12"><div class="alert alert-info">Смен не найдено</div></div>';
        return;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const upcoming = [];
    const pending = [];
    const completed = [];

    shifts.forEach(shift => {
        const shiftDate = new Date(shift.start_time);
        shiftDate.setHours(0, 0, 0, 0);
        const hasReport = shift.has_report > 0;

        if (hasReport) {
            completed.push(shift);
        } else if (shiftDate > now) {
            upcoming.push(shift);
        } else {
            pending.push(shift);
        }
    });

    const prefix = isMyTab ? 'my' : 'all';
    let html = '';

    // 1. Предстоящие (развёрнуты)
    html += buildShiftSection(
        `${prefix}-upcoming`,
        `<i class="bi bi-calendar-event"></i> Предстоящие (${upcoming.length})`,
        upcoming, true, 'primary'
    );

    // 2. Ожидают отчёта (свёрнуты)
    html += buildShiftSection(
        `${prefix}-pending`,
        `<i class="bi bi-exclamation-triangle"></i> Ожидают отчёта (${pending.length})`,
        pending, false, 'warning'
    );

    // 3. Оформленные (свёрнуты)
    html += buildShiftSection(
        `${prefix}-completed`,
        `<i class="bi bi-check-circle"></i> Оформленные (${completed.length})`,
        completed, false, 'success'
    );

    container.innerHTML = html;
}

function buildShiftSection(id, title, shifts, expanded, color) {
    const cardsHtml = shifts.length === 0
        ? '<div class="col-12"><div class="alert alert-light text-muted">Нет смен в этой категории</div></div>'
        : shifts.map(shift => buildShiftCard(shift)).join('');

    return `
        <div class="col-12 mb-3">
            <div class="card border-${color}">
                <div class="card-header section-header bg-${color} ${color === 'warning' ? 'text-dark' : 'text-white'} d-flex justify-content-between align-items-center" 
                     data-bs-toggle="collapse" 
                     data-bs-target="#section-${id}"
                     aria-expanded="${expanded}">
                    <h5 class="mb-0">${title}</h5>
                    <i class="bi bi-chevron-${expanded ? 'up' : 'down'}"></i>
                </div>
                <div class="collapse ${expanded ? 'show' : ''}" id="section-${id}">
                    <div class="card-body">
                        <div class="row">${cardsHtml}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function buildShiftCard(shift) {
    const start = formatDate(shift.start_time);
    const end = formatDate(shift.end_time);
    const hasReport = shift.has_report > 0;
    const isMyShift = currentUser && shift.users && shift.users.some(u => u.id === currentUser.id);

    const usersNames = (shift.users && shift.users.length > 0) ? shift.users.map(u => u.full_name || u.username).join(', ') : (shift.full_name || shift.username);
    const ownerBadge = isMyShift
        ? '<span class="badge bg-primary me-1"><i class="bi bi-person-fill"></i> Моя</span>'
        : '<span class="badge bg-secondary me-1"><i class="bi bi-person"></i> ' + usersNames + '</span>';

    const reportBadge = hasReport
        ? '<span class="badge bg-success badge-report"><i class="bi bi-check-circle"></i> Отчёт есть</span>'
        : '<span class="badge bg-warning text-dark badge-report"><i class="bi bi-exclamation-circle"></i> Нет отчёта</span>';

    return `
        <div class="col-md-6 col-lg-4 mb-3">
            <div class="card shift-card ${hasReport ? 'has-report' : 'no-report'} ${isMyShift ? 'border-primary' : ''}" onclick="viewShift(${shift.id})" style="${isMyShift ? 'border-width: 2px;' : ''}">
                ${reportBadge}
                <div class="card-body">
                    <div class="mb-2">${ownerBadge}</div>
                    <h5 class="card-title"><i class="bi bi-person-badge"></i> ${usersNames}</h5>
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
    const isMyShift = currentUser && shift.users && shift.users.some(u => u.id === currentUser.id);
    const isAdmin = currentUser && currentUser.role === 'admin';

    document.getElementById('shiftDetails').innerHTML = `
        <div class="mb-3"><h6><i class="bi bi-person-badge"></i> Инженер:</h6><p>${(shift.users && shift.users.length > 0) ? shift.users.map(u => u.full_name || u.username).join(", ") : (shift.full_name || shift.username)}</p></div>
        <div class="mb-3"><h6><i class="bi bi-clock"></i> Время смены:</h6><p>Начало: ${start}<br>Конец: ${end}</p></div>
        ${shift.description ? `<div class="mb-3"><h6><i class="bi bi-info-circle"></i> Описание:</h6><p>${shift.description}</p></div>` : ''}
    `;

    const footer = document.getElementById('shiftModalFooter');
    if (isAdmin) {
        footer.innerHTML = `<button class="btn btn-danger" onclick="deleteShift(${shift.id})"><i class="bi bi-trash"></i> Удалить смену</button>`;
    } else {
        footer.innerHTML = '';
    }

    const reportSection = document.getElementById('reportSection');
    if (hasReport) {
        displayReportV2(report);
    } else {
        const canCreate = isAdmin || isMyShift;
        const shiftDate = new Date(shift.start_time);
        const today = new Date();
        shiftDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const isFuture = shiftDate > today;

        if (!canCreate) {
            reportSection.innerHTML = `<div class="alert alert-info"><i class="bi bi-info-circle"></i> Отчёт ещё не создан инженером</div>`;
        } else if (isFuture && !isAdmin) {
            reportSection.innerHTML = `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i> Нельзя создать отчёт для будущей смены. Дата смены: ${formatDate(shift.start_time)}</div>`;
        } else if (isFuture && isAdmin) {
            reportSection.innerHTML = `
                <div class="alert alert-info"><i class="bi bi-info-circle"></i> Будущая смена. Админ может создать отчёт заранее.</div>
                <button class="btn btn-success" onclick="openCreateReport()"><i class="bi bi-file-earmark-plus"></i> Создать отчёт</button>`;
        } else {
            reportSection.innerHTML = `
                <div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i> Отчёт ещё не создан</div>
                <button class="btn btn-success" onclick="openCreateReport()"><i class="bi bi-file-earmark-plus"></i> Создать отчёт</button>`;
        }
    }
}

function displayReportV2(report) {
    let html = `<div class="alert alert-success"><i class="bi bi-check-circle"></i> Отчёт создан ${formatDate(report.created_at)}</div>`;
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
                        <textarea class="form-control equipment-description" data-equipment-id="${eq.equipment_id}" rows="2" placeholder="Опишите состояние..." placeholder="Опишите состояние..."></textarea>
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
    const formData = new FormData();
    formData.append('shift_id', shiftId);
    const equipmentItems = [];

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
        alert('Отчёт успешно создан!');
        bootstrap.Modal.getInstance(document.getElementById('createReportModal')).hide();
        await loadShifts();
        await viewShift(shiftId);
    } catch (error) {
        alert(`Ошибка: ${error.message}`);
    }
}

async function deleteShift(shiftId) {
    if (!confirm('Удалить смену? Все отчёты и файлы будут удалены.')) return;
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
    const photoModalEl = document.getElementById('photoModal');
    let photoModal = bootstrap.Modal.getInstance(photoModalEl);
    if (!photoModal) {
        photoModal = new bootstrap.Modal(photoModalEl, { backdrop: false });
    }
    photoModal.show();
    // Поднимаем поверх всех модалок
    setTimeout(() => {
        photoModalEl.style.zIndex = '1090';
        // Затемняем фон
        let overlay = document.getElementById('photoOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'photoOverlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:1085';
            overlay.onclick = () => { photoModal.hide(); };
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'block';
    }, 10);
    // Убираем overlay при закрытии
    photoModalEl.addEventListener('hidden.bs.modal', function handler() {
        const overlay = document.getElementById('photoOverlay');
        if (overlay) overlay.style.display = 'none';
        photoModalEl.removeEventListener('hidden.bs.modal', handler);
    });
}

// === Оборудование ===
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
    const isAdminUser = currentUser && currentUser.role === 'admin';
    if (isAdminUser) {
        // Админ видит всё включая удалённое
        try {
            const res = await fetch(`${API_URL}/api/equipment/all-with-deleted`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) equipment = await res.json();
            else await loadEquipment();
        } catch(e) { await loadEquipment(); }
    } else {
        await loadEquipment();
    }
    displayEquipmentList();
    new bootstrap.Modal(document.getElementById('equipmentModal')).show();
}

function displayEquipmentList() {
    const container = document.getElementById('equipmentList');
    const isAdminUser = currentUser && currentUser.role === 'admin';
    
    // Скрываем/показываем кнопку добавления
    const addBtn = document.getElementById('addEquipmentBtn');
    if (addBtn) addBtn.style.display = isAdminUser ? '' : 'none';
    
    if (equipment.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Оборудование не добавлено</div>';
        return;
    }

    const active = equipment.filter(eq => !eq.is_deleted);
    const archived = isAdminUser ? equipment.filter(eq => eq.is_deleted) : [];

    let html = `
        <ul class="nav nav-tabs mb-3" role="tablist">
            <li class="nav-item">
                <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#eqActiveTab">
                    <i class="bi bi-check-circle"></i> Активное <span class="badge bg-primary">${active.length}</span>
                </button>
            </li>
            ${archived.length > 0 ? `
            <li class="nav-item">
                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#eqArchivedTab">
                    <i class="bi bi-archive"></i> Архив <span class="badge bg-secondary">${archived.length}</span>
                </button>
            </li>` : ''}
        </ul>
        <div class="tab-content">
            <div class="tab-pane fade show active" id="eqActiveTab">
                ${active.length > 0 ? buildEquipmentTable(active, false) : '<div class="alert alert-info">Нет активного оборудования</div>'}
            </div>
            ${archived.length > 0 ? `
            <div class="tab-pane fade" id="eqArchivedTab">
                ${buildEquipmentTable(archived, true)}
            </div>` : ''}
        </div>
    `;

    container.innerHTML = html;
}

function buildEquipmentTable(items, isArchive) {
    const isAdminUser = currentUser && currentUser.role === 'admin';
    return `
        <div class="table-responsive">
        <table class="table table-striped table-hover">
            <thead class="table-dark"><tr><th>ID</th><th>Название</th><th>Тип</th><th>Расположение</th><th>Действия</th></tr></thead>
            <tbody>
                ${items.map(eq => `
                    <tr class="${isArchive ? 'table-secondary text-muted' : ''}">
                        <td><code>${eq.equipment_id}</code></td>
                        <td>
                            ${eq.name}
                            ${isArchive ? ' <span class="badge bg-secondary">Удалено</span>' : ''}
                        </td>
                        <td>${eq.type || '-'}</td>
                        <td>${eq.location || '-'}</td>
                        <td>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-info" onclick="viewEquipmentHistory('${eq.equipment_id}', '${eq.name}')" title="История">
                                    <i class="bi bi-clock-history"></i>
                                </button>
                                ${isAdminUser ? (isArchive ? `
                                    <button class="btn btn-outline-success" onclick="restoreEquipment(${eq.id})" title="Восстановить">
                                        <i class="bi bi-arrow-counterclockwise"></i>
                                    </button>
                                ` : `
                                    <button class="btn btn-outline-danger" onclick="deleteEquipment(${eq.id})" title="В архив">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                `) : ''}
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        </div>
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
    if (!equipmentId || !name) { alert('Заполните ID и название'); return; }
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
        alert('Оборудование перемещено в архив');
        await loadEquipment();
        displayEquipmentList();
        displayEquipmentList();
    } catch (error) {
        alert('Ошибка удаления');
    }
}

// === Пользователи ===
let users = [];
async function loadUsers() {
    try {
        const res = await fetch(`${API_URL}/api/users`, { headers: { 'Authorization': `Bearer ${token}` } });
        users = await res.json();
        const select = document.getElementById('shiftUserId');
        if (select) {
            const engineers = users.filter(u => u.role === 'engineer');
            select.innerHTML = engineers.map(u => `<option value="${u.id}">${u.full_name || u.username}</option>`).join('');
            select.setAttribute('multiple', 'true');
            select.setAttribute('size', Math.min(engineers.length, 5));
        }
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
        <div class="table-responsive">
        <table class="table table-striped table-hover">
            <thead class="table-dark">
                <tr>
                    <th>Имя Фамилия</th>
                    <th>Логин</th>
                    <th>Роль</th>
                    <th>Должность</th>
                    <th>Статус</th>
                    <th>Телефон</th>
                    <th>Email</th>
                    <th>Примечание</th>
                    <th>Действия</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(user => {
                    const roleBadge = user.role === 'admin' ? 'danger' : 'primary';
                    const roleText = user.role === 'admin' ? 'Админ' : 'Инженер';
                    const statusBadge = user.user_status === 'active' || !user.user_status ? 'success' : 'secondary';
                    const statusText = user.user_status === 'active' || !user.user_status ? 'Работает' : 'Не работает';
                    const canDelete = user.id !== currentUser.id;
                    const userJson = JSON.stringify(user).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                    return `<tr class="${user.user_status === 'inactive' ? 'table-secondary' : ''}">
                        <td><strong>${user.full_name || '-'}</strong></td>
                        <td><code>${user.username}</code></td>
                        <td><span class="badge bg-${roleBadge}">${roleText}</span></td>
                        <td>${user.position || '-'}</td>
                        <td><span class="badge bg-${statusBadge}">${statusText}</span></td>
                        <td>${user.phone || '-'}</td>
                        <td>${user.email || '-'}</td>
                        <td>${user.description || '-'}</td>
                        <td>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-warning" onclick="openEditUser(${user.id})" title="Редактировать">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                ${canDelete ? '<button class="btn btn-outline-danger" onclick="deleteUser(' + user.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>' : ''}
                            </div>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        </div>
    `;
}

function openAddUser() {
    document.getElementById('editUserId').value = '';
    document.getElementById('userForm').reset();
    document.getElementById('userModalTitle').innerHTML = '<i class="bi bi-person-plus"></i> Добавить пользователя';
    document.getElementById('userUsername').disabled = false;
    document.getElementById('userPassword').required = true;
    document.getElementById('userPasswordLabel').textContent = 'Пароль *';
    document.getElementById('passwordHint').style.display = 'none';
    const usersModal = bootstrap.Modal.getInstance(document.getElementById('usersModal'));
    if (usersModal) usersModal.hide();
    setTimeout(() => new bootstrap.Modal(document.getElementById('addUserModal')).show(), 300);
}

async function saveUser() {
    const editId = document.getElementById('editUserId').value;
    const userData = {
        username: document.getElementById('userUsername').value,
        password: document.getElementById('userPassword').value,
        role: document.getElementById('userRole').value,
        first_name: document.getElementById('userFirstName').value,
        last_name: document.getElementById('userLastName').value,
        email: document.getElementById('userEmail').value,
        phone: document.getElementById('userPhone').value,
        position: document.getElementById('userPosition').value,
        user_status: document.getElementById('userStatus').value,
        description: document.getElementById('userDescription').value
    };

    try {
        let res;
        if (editId) {
            res = await fetch(`${API_URL}/api/users/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(userData)
            });
        } else {
            if (!userData.password) { alert('Пароль обязателен для нового пользователя'); return; }
            res = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(userData)
            });
        }

        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Ошибка'); }
        bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
        alert(editId ? 'Пользователь обновлён!' : 'Пользователь создан!');
        await loadUsers();
        displayUsersList();
        setTimeout(() => new bootstrap.Modal(document.getElementById('usersModal')).show(), 300);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

async function deleteUser(userId) {
    if (!confirm('Удалить пользователя?')) return;
    try {
        await fetch(`${API_URL}/api/users/${userId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        alert('Пользователь удалён');
        await loadUsers();
        displayUsersList();
    } catch (error) {
        alert('Ошибка удаления');
    }
}

// === Создание смен ===
async function saveShift() {
    const userId = document.getElementById('shiftUserId').value;
    const startTime = document.getElementById('shiftStartTime').value;
    const endTime = document.getElementById('shiftEndTime').value;
    const description = document.getElementById('shiftDescription').value;

    if (!userId) { alert('Выберите инженера'); return; }
    if (!startTime || !endTime) { alert('Выберите дату и график (5/2, 2/2 или свободный)'); return; }

    if (new Date(endTime) <= new Date(startTime)) {
        alert('Конец смены должен быть позже начала');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/shifts`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_ids: Array.from(document.getElementById('shiftUserId').selectedOptions).map(o => parseInt(o.value)), start_time: startTime, end_time: endTime, description })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка создания');
        }
        alert('Смена создана!');
        bootstrap.Modal.getInstance(document.getElementById('addShiftModal')).hide();
        document.getElementById('timeFieldsContainer').style.display = 'none';
        document.querySelectorAll('.schedule-btn').forEach(btn => btn.classList.remove('active'));
        await loadShifts();
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

// === Event Listeners ===
function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    });

    const addShiftBtn = document.getElementById('addShiftBtn');
    if (addShiftBtn) {
        addShiftBtn.addEventListener('click', () => {
            document.getElementById('shiftForm').reset();
            new bootstrap.Modal(document.getElementById('addShiftModal')).show();
        });
    }

    const saveShiftBtn = document.getElementById('saveShiftBtn');
    if (saveShiftBtn) saveShiftBtn.addEventListener('click', saveShift);

    const equipmentBtn = document.getElementById('manageEquipmentBtn');
    if (equipmentBtn) equipmentBtn.addEventListener('click', openEquipmentModal);

    const docsBtn = document.getElementById('manageDocsBtn');
    if (docsBtn) docsBtn.addEventListener('click', openDocumentsModal);

    const docUploadBtn = document.getElementById('docUploadBtn');
    if (docUploadBtn) docUploadBtn.addEventListener('click', uploadDocuments);

    const addEquipmentBtn = document.getElementById('addEquipmentBtn');
    if (addEquipmentBtn) addEquipmentBtn.addEventListener('click', openAddEquipment);

    const saveEquipmentBtn = document.getElementById('saveEquipmentBtn');
    if (saveEquipmentBtn) saveEquipmentBtn.addEventListener('click', saveEquipment);

    const usersBtn = document.getElementById('manageUsersBtn');
    if (usersBtn) usersBtn.addEventListener('click', openUsersModal);

    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) addUserBtn.addEventListener('click', openAddUser);

    const saveUserBtn = document.getElementById('saveUserBtn');
    if (saveUserBtn) saveUserBtn.addEventListener('click', saveUser);

    const createReportBtn = document.getElementById('saveReportBtn');
    if (createReportBtn) { createReportBtn.addEventListener('click', createReportV2); console.log('✅ saveReportBtn подключён'); }
}

// === Графики смен ===
function setSchedule(type) {
    const dateInput = document.getElementById('shiftDate');
    const startInput = document.getElementById('shiftStartTime');
    const endInput = document.getElementById('shiftEndTime');
    const timeContainer = document.getElementById('timeFieldsContainer');
    const date = dateInput.value;

    // Убираем активность со всех кнопок
    document.querySelectorAll('.schedule-btn').forEach(btn => btn.classList.remove('active'));
    // Подсвечиваем нажатую
    event.target.closest('.schedule-btn').classList.add('active');

    if (!date && type !== 'custom') {
        alert('Сначала выберите дату смены');
        return;
    }

    if (type === '5/2') {
        startInput.value = date + 'T08:00';
        endInput.value = date + 'T17:00';
        timeContainer.style.display = 'block';
    } else if (type === '2/2') {
        startInput.value = date + 'T10:00';
        endInput.value = date + 'T22:00';
        timeContainer.style.display = 'block';
    } else if (type === 'custom') {
        startInput.value = '';
        endInput.value = '';
        timeContainer.style.display = 'block';
    }
}

// === История оборудования ===
async function viewEquipmentHistory(equipmentId, equipmentName) {
    // Сохраняем для генерации PDF
    window._currentHistoryEquipmentId = equipmentId;
    window._currentHistoryEquipmentName = equipmentName;

    // Устанавливаем даты по умолчанию (текущий месяц)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    setTimeout(() => {
        const fromEl = document.getElementById('reportDateFrom');
        const toEl = document.getElementById('reportDateTo');
        if (fromEl && !fromEl.value) fromEl.value = firstDay;
        if (toEl && !toEl.value) toEl.value = today;
    }, 100);

    try {
        const res = await fetch(`${API_URL}/api/equipment/${equipmentId}/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const history = await res.json();

        document.getElementById('historyEquipmentName').innerHTML = 
            `<i class="bi bi-tools"></i> ${equipmentName} <code>(${equipmentId})</code>`;

        const container = document.getElementById('equipmentHistoryContainer');

        if (history.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Нет записей по этому оборудованию</div>';
        } else {
            // Группируем по месяцам
            const months = {};
            const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
            history.forEach(item => {
                const d = new Date(item.start_time);
                const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
                const label = monthNames[d.getMonth()] + ' ' + d.getFullYear();
                if (!months[key]) months[key] = { label, items: [] };
                months[key].items.push(item);
            });

            const sortedKeys = Object.keys(months).sort().reverse();
            let html = '';
            sortedKeys.forEach((key, idx) => {
                const group = months[key];
                const collapseId = 'histMonth_' + key.replace('-','_');
                const isFirst = idx === 0;
                html += `
                    <div class="mb-2">
                        <button class="btn btn-outline-secondary w-100 d-flex justify-content-between align-items-center" 
                                type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                            <span><i class="bi bi-calendar3"></i> ${group.label}</span>
                            <span class="badge bg-primary rounded-pill">${group.items.length}</span>
                        </button>
                        <div class="collapse ${isFirst ? 'show' : ''}" id="${collapseId}">
                            <div class="mt-2">
                                ${group.items.map(item => {
                                    const statusBadge = item.status === 'working' ? 'success' : item.status === 'faulty' ? 'danger' : 'warning';
                                    const statusText = item.status === 'working' ? 'Исправно' : item.status === 'faulty' ? 'Неисправно' : 'Обслуживание';
                                    const date = formatDate(item.report_date);
                                    const shiftDate = formatDate(item.start_time);
                                    const photos = Array.isArray(item.photo_files) ? item.photo_files : [];
                                    return `
                                        <div class="card mb-2 border-start border-4 border-${statusBadge}">
                                            <div class="card-body py-2 px-3">
                                                <div class="d-flex justify-content-between align-items-center">
                                                    <span class="badge bg-${statusBadge}">${statusText}</span>
                                                    <small class="text-muted">${date}</small>
                                                </div>
                                                <small class="text-muted d-block mt-1">
                                                    <i class="bi bi-person"></i> ${item.full_name || item.username} &bull;
                                                    <i class="bi bi-calendar"></i> Смена: ${shiftDate}
                                                </small>
                                                ${item.description ? '<p class="mb-0 mt-1 small">' + item.description + '</p>' : ''}
                                                ${photos.length > 0 ? `
                                                    <div class="d-flex flex-wrap gap-1 mt-2">
                                                        ${photos.map(photo => `
                                                            <img src="${API_URL}/api/photos/${photo}" 
                                                                 class="rounded border" 
                                                                 style="width:80px;height:80px;object-fit:cover;cursor:pointer" 
                                                                 onclick="viewPhoto('${API_URL}/api/photos/${photo}')"
                                                                 onerror="this.style.display='none'"
                                                                 alt="Фото">
                                                        `).join('')}
                                                    </div>
                                                ` : ''}
                                                ${item.audio_file ? '<audio controls class="w-100 mt-1" style="height:32px" src="' + API_URL + '/api/audio/' + item.audio_file + '"></audio>' : ''}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        }
        // Прячем модалку оборудования, показываем историю
        const eqModal = bootstrap.Modal.getInstance(document.getElementById('equipmentModal'));
        if (eqModal) eqModal.hide();
        
        setTimeout(() => {
            new bootstrap.Modal(document.getElementById('equipmentHistoryModal')).show();
        }, 300);
    } catch (error) {
        alert('Ошибка загрузки истории');
        console.error(error);
    }
}

// === Генерация PDF-отчёта по оборудованию ===
async function generateEquipmentReport() {
    const equipmentId = window._currentHistoryEquipmentId;
    if (!equipmentId) {
        alert('Ошибка: оборудование не выбрано');
        return;
    }

    const from = document.getElementById('reportDateFrom').value;
    const to = document.getElementById('reportDateTo').value;

    if (!from || !to) {
        alert('Укажите период (даты "от" и "до")');
        return;
    }

    if (from > to) {
        alert('Дата "от" не может быть позже даты "до"');
        return;
    }

    const btn = document.getElementById('generateReportBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Формирование...';

    try {
        const res = await fetch(
            `${API_URL}/api/equipment/${equipmentId}/report?from=${from}&to=${to}`, 
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Ошибка сервера' }));
            throw new Error(err.error || 'Ошибка генерации отчёта');
        }

        // Скачиваем PDF
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const name = window._currentHistoryEquipmentName || 'equipment';
        a.download = `Отчёт_${name}_${from}_${to}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        alert('Ошибка: ' + error.message);
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// === Восстановление оборудования из архива ===
async function restoreEquipment(id) {
    if (!confirm('Восстановить оборудование? Оно снова появится в отчётах.')) return;
    try {
        const res = await fetch(`${API_URL}/api/equipment/${id}/restore`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Ошибка восстановления');
        alert('Оборудование восстановлено!');
        await loadEquipment();
        displayEquipmentList();
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

// === Редактирование пользователя ===
function openEditUser(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    document.getElementById('editUserId').value = user.id;
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userUsername').disabled = true;
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').required = false;
    document.getElementById('userPasswordLabel').textContent = 'Пароль';
    document.getElementById('passwordHint').style.display = 'block';
    document.getElementById('userRole').value = user.role;
    document.getElementById('userFirstName').value = user.first_name || '';
    document.getElementById('userLastName').value = user.last_name || '';
    document.getElementById('userEmail').value = user.email || '';
    document.getElementById('userPhone').value = user.phone || '';
    document.getElementById('userPosition').value = user.position || '';
    document.getElementById('userStatus').value = user.user_status || 'active';
    document.getElementById('userDescription').value = user.description || '';
    document.getElementById('userModalTitle').innerHTML = '<i class="bi bi-pencil"></i> Редактировать: ' + (user.full_name || user.username);

    const usersModal = bootstrap.Modal.getInstance(document.getElementById('usersModal'));
    if (usersModal) usersModal.hide();
    setTimeout(() => new bootstrap.Modal(document.getElementById('addUserModal')).show(), 300);
}

// === Редактирование пользователя ===
// === Редактирование оборудования ===
function openEditEquipment(eq) {
    document.getElementById('editEqId').value = eq.id;
    document.getElementById('editEqEquipmentId').value = eq.equipment_id;
    document.getElementById('editEqName').value = eq.name;
    document.getElementById('editEqType').value = eq.type || '';
    document.getElementById('editEqLocation').value = eq.location || '';

    const eqModal = bootstrap.Modal.getInstance(document.getElementById('equipmentModal'));
    if (eqModal) eqModal.hide();
    setTimeout(() => new bootstrap.Modal(document.getElementById('editEquipmentModal')).show(), 300);
}

document.getElementById('saveEditEquipmentBtn').addEventListener('click', async () => {
    const id = document.getElementById('editEqId').value;
    const data = {
        equipment_id: document.getElementById('editEqEquipmentId').value,
        name: document.getElementById('editEqName').value,
        type: document.getElementById('editEqType').value,
        location: document.getElementById('editEqLocation').value
    };

    try {
        const res = await fetch(`${API_URL}/api/equipment/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Ошибка сохранения');
        bootstrap.Modal.getInstance(document.getElementById('editEquipmentModal')).hide();
        alert('Оборудование обновлено!');
        await loadEquipment();
        displayEquipmentList();
        setTimeout(() => new bootstrap.Modal(document.getElementById('equipmentModal')).show(), 300);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
});

// === ДОКУМЕНТАЦИЯ ===

async function openDocumentsModal() {
    const isAdminUser = currentUser && currentUser.role === 'admin';
    const uploadSection = document.getElementById('docUploadSection');
    if (uploadSection) uploadSection.style.display = isAdminUser ? 'block' : 'none';
    await loadDocuments();
    new bootstrap.Modal(document.getElementById('documentsModal')).show();
}

async function loadDocuments() {
    const container = document.getElementById('documentsList');
    try {
        const res = await fetch(`${API_URL}/api/documents`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('Ошибка загрузки');
        const docs = await res.json();
        displayDocuments(docs);
    } catch(e) {
        container.innerHTML = '<div class="alert alert-danger">Ошибка загрузки документов</div>';
    }
}

function displayDocuments(docs) {
    const container = document.getElementById('documentsList');
    const isAdminUser = currentUser && currentUser.role === 'admin';
    
    if (docs.length === 0) {
        container.innerHTML = '<div class="alert alert-info"><i class="bi bi-info-circle"></i> Документы не загружены</div>';
        return;
    }

    const getFileIcon = (mime) => {
        if (!mime) return 'bi-file-earmark';
        if (mime.startsWith('image/')) return 'bi-file-earmark-image text-success';
        if (mime.startsWith('video/')) return 'bi-file-earmark-play text-danger';
        if (mime.startsWith('audio/')) return 'bi-file-earmark-music text-warning';
        if (mime.includes('pdf')) return 'bi-file-earmark-pdf text-danger';
        if (mime.includes('word') || mime.includes('document')) return 'bi-file-earmark-word text-primary';
        if (mime.includes('sheet') || mime.includes('excel')) return 'bi-file-earmark-excel text-success';
        if (mime.includes('presentation') || mime.includes('powerpoint')) return 'bi-file-earmark-ppt text-warning';
        if (mime.includes('zip') || mime.includes('rar') || mime.includes('archive')) return 'bi-file-earmark-zip text-secondary';
        if (mime.includes('text')) return 'bi-file-earmark-text text-info';
        return 'bi-file-earmark';
    };

    const formatSize = (bytes) => {
        if (!bytes) return '-';
        if (bytes < 1024) return bytes + ' Б';
        if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' КБ';
        return (bytes/(1024*1024)).toFixed(1) + ' МБ';
    };

    const canPreview = (mime) => {
        if (!mime) return false;
        return mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/') || mime.includes('pdf');
    };

    container.innerHTML = `
        <div class="table-responsive">
        <table class="table table-hover">
            <thead class="table-dark">
                <tr>
                    <th style="width:40px"></th>
                    <th>Имя файла</th>
                    <th>Размер</th>
                    <th>Загрузил</th>
                    <th>Дата</th>
                    <th>Действия</th>
                </tr>
            </thead>
            <tbody>
                ${docs.map(doc => `
                    <tr>
                        <td><i class="bi ${getFileIcon(doc.mime_type)} fs-5"></i></td>
                        <td class="text-break">${doc.original_name}</td>
                        <td class="text-nowrap">${formatSize(doc.size)}</td>
                        <td>${doc.uploaded_by_name || '-'}</td>
                        <td class="text-nowrap">${new Date(doc.created_at).toLocaleDateString('ru-RU')}</td>
                        <td>
                            <div class="btn-group btn-group-sm">
                                ${canPreview(doc.mime_type) ? `
                                    <button class="btn btn-outline-info" onclick="previewDocument(${doc.id}, '${doc.original_name.replace(/'/g, "\\'")}', '${doc.mime_type}')" title="Просмотр">
                                        <i class="bi bi-eye"></i>
                                    </button>
                                ` : ''}
                                <button class="btn btn-outline-primary" onclick="downloadDocument(${doc.id})" title="Скачать">
                                    <i class="bi bi-download"></i>
                                </button>
                                ${isAdminUser ? `
                                    <button class="btn btn-outline-danger" onclick="deleteDocument(${doc.id}, '${doc.original_name.replace(/'/g, "\\'")}')" title="Удалить">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        </div>
    `;
}

async function uploadDocuments() {
    const input = document.getElementById('docFileInput');
    if (!input.files.length) return alert('Выберите файл(ы)');
    
    const progressDiv = document.getElementById('docUploadProgress');
    const progressBar = progressDiv?.querySelector('.progress-bar');
    progressDiv.style.display = 'block';
    
    let uploaded = 0;
    const total = input.files.length;
    
    for (const file of input.files) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch(`${API_URL}/api/documents`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            if (!res.ok) {
                const err = await res.json();
                alert('Ошибка загрузки ' + file.name + ': ' + err.error);
            }
        } catch(e) {
            alert('Ошибка загрузки ' + file.name);
        }
        uploaded++;
        if (progressBar) progressBar.style.width = Math.round(uploaded/total*100) + '%';
    }
    
    input.value = '';
    progressDiv.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
    await loadDocuments();
}

async function downloadDocument(id) {
    try {
        const res = await fetch(`${API_URL}/api/documents/${id}/download`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Ошибка');
        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition');
        let filename = 'file';
        if (disposition) {
            const match = disposition.match(/filename[^;=\n]*=(["\']*)(.*?)\1(;|$)/);
            if (match) filename = decodeURIComponent(match[2]);
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch(e) { alert('Ошибка скачивания'); }
}

function previewDocument(id, name, mimeType) {
    const title = document.getElementById('docPreviewTitle');
    const body = document.getElementById('docPreviewBody');
    const downloadLink = document.getElementById('docPreviewDownload');
    
    title.textContent = name;
    downloadLink.onclick = (e) => { e.preventDefault(); downloadDocument(id); };
    
    const url = `${API_URL}/api/documents/${id}/preview?token=${token}`;
    
    if (mimeType.startsWith('image/')) {
        body.innerHTML = `<img src="${url}" class="img-fluid rounded" alt="${name}" style="max-height:70vh;">`;
    } else if (mimeType.startsWith('video/')) {
        body.innerHTML = `<video controls class="w-100" style="max-height:70vh;"><source src="${url}" type="${mimeType}">Видео не поддерживается</video>`;
    } else if (mimeType.startsWith('audio/')) {
        body.innerHTML = `<div class="py-5"><i class="bi bi-music-note-beamed display-1 text-warning"></i><br><br><audio controls class="w-100"><source src="${url}" type="${mimeType}">Аудио не поддерживается</audio></div>`;
    } else if (mimeType.includes('pdf')) {
        body.innerHTML = `<iframe src="${url}" class="w-100" style="height:70vh; border:none;"></iframe>`;
    } else {
        body.innerHTML = `<div class="py-5"><i class="bi bi-file-earmark display-1"></i><p class="mt-3">Предпросмотр недоступен</p></div>`;
    }
    
    new bootstrap.Modal(document.getElementById('docPreviewModal')).show();
}

async function deleteDocument(id, name) {
    if (!confirm('Удалить файл "' + name + '"?')) return;
    try {
        const res = await fetch(`${API_URL}/api/documents/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const err = await res.json();
            alert(err.error);
            return;
        }
        await loadDocuments();
    } catch(e) { alert('Ошибка удаления'); }
}
