const API_URL = 'http://localhost:3000';
let token = localStorage.getItem('token');
let currentUser = null;
let users = [];

if (!token) window.location.href = 'login.html';

document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentUser();
    if (currentUser.role !== 'admin') {
        alert('Доступ запрещен');
        window.location.href = 'index.html';
        return;
    }
    await loadUsers();
    setupEventListeners();
});

async function loadCurrentUser() {
    try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();
        currentUser = await res.json();
        document.getElementById('userInfo').textContent = `${currentUser.full_name || currentUser.username}`;
    } catch (error) {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    }
}

async function loadUsers() {
    try {
        const res = await fetch(`${API_URL}/api/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();
        users = await res.json();
        displayUsers();
    } catch (error) {
        alert('Ошибка загрузки пользователей');
    }
}

function displayUsers() {
    const container = document.getElementById('usersContainer');
    if (users.length === 0) {
        container.innerHTML = '<div class="col-12"><div class="alert alert-info">Пользователей не найдено</div></div>';
        return;
    }
    
    container.innerHTML = users.map(user => {
        const roleText = user.role === 'admin' ? 'Администратор' : 'Инженер';
        const roleBadge = user.role === 'admin' ? 'danger' : 'primary';
        const created = new Date(user.created_at).toLocaleDateString('ru-RU');
        const isSelf = user.id === currentUser.id;
        
        return `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card user-card h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title mb-0">
                                <i class="bi bi-person-circle"></i> ${user.full_name || user.username}
                            </h5>
                            <span class="badge bg-${roleBadge}">${roleText}</span>
                        </div>
                        
                        <p class="card-text text-muted mb-2">
                            <small><i class="bi bi-person-badge"></i> <strong>Логин:</strong> ${user.username}</small>
                        </p>
                        
                        ${user.email ? `<p class="card-text text-muted mb-2"><small><i class="bi bi-envelope"></i> ${user.email}</small></p>` : ''}
                        
                        ${user.description ? `<p class="card-text mb-2"><small>${user.description}</small></p>` : ''}
                        
                        <p class="card-text text-muted mb-3">
                            <small><i class="bi bi-calendar-plus"></i> Создан: ${created}</small>
                        </p>
                        
                        <div class="btn-group w-100" role="group">
                            <button class="btn btn-sm btn-outline-primary" onclick="editUser(${user.id})">
                                <i class="bi bi-pencil"></i> Редактировать
                            </button>
                            ${!isSelf ? `
                                <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id}, '${user.username}')">
                                    <i class="bi bi-trash"></i> Удалить
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openAddUserModal() {
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('userModalTitle').innerHTML = '<i class="bi bi-person-plus"></i> Добавить пользователя';
    document.getElementById('userPassword').required = true;
    document.getElementById('passwordHint').textContent = 'Минимум 6 символов';
    new bootstrap.Modal(document.getElementById('userModal')).show();
}

function editUser(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('userId').value = user.id;
    document.getElementById('userFirstName').value = user.first_name || '';
    document.getElementById('userLastName').value = user.last_name || '';
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userPassword').value = '';
    document.getElementById('userEmail').value = user.email || '';
    document.getElementById('userRole').value = user.role;
    document.getElementById('userDescription').value = user.description || '';
    
    document.getElementById('userModalTitle').innerHTML = '<i class="bi bi-pencil"></i> Редактировать пользователя';
    document.getElementById('userPassword').required = false;
    document.getElementById('passwordHint').textContent = 'Оставьте пустым, чтобы не менять';
    
    new bootstrap.Modal(document.getElementById('userModal')).show();
}

async function saveUser() {
    const userId = document.getElementById('userId').value;
    const firstName = document.getElementById('userFirstName').value.trim();
    const lastName = document.getElementById('userLastName').value.trim();
    const username = document.getElementById('userUsername').value.trim();
    const password = document.getElementById('userPassword').value;
    const email = document.getElementById('userEmail').value.trim();
    const role = document.getElementById('userRole').value;
    const description = document.getElementById('userDescription').value.trim();
    
    if (!firstName || !lastName || !username || !role) {
        alert('Заполните все обязательные поля');
        return;
    }
    
    if (!userId && !password) {
        alert('Укажите пароль');
        return;
    }
    
    if (password && password.length < 6) {
        alert('Пароль должен быть минимум 6 символов');
        return;
    }
    
    const data = {
        username,
        role,
        first_name: firstName,
        last_name: lastName,
        email,
        description
    };
    
    if (password) data.password = password;
    
    try {
        const url = userId ? `${API_URL}/api/users/${userId}` : `${API_URL}/api/users`;
        const method = userId ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await res.json();
        
        if (!res.ok) {
            throw new Error(result.error || 'Ошибка сохранения');
        }
        
        alert(userId ? 'Пользователь обновлён!' : 'Пользователь создан!');
        bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
        await loadUsers();
    } catch (error) {
        alert(`Ошибка: ${error.message}`);
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Удалить пользователя "${username}"?\n\nВсе смены и отчёты этого пользователя также будут удалены!`)) return;
    
    try {
        const res = await fetch(`${API_URL}/api/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Ошибка удаления');
        }
        
        alert('Пользователь удалён');
        await loadUsers();
    } catch (error) {
        alert(`Ошибка: ${error.message}`);
    }
}

function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    });
    
    document.getElementById('addUserBtn').addEventListener('click', openAddUserModal);
    document.getElementById('saveUserBtn').addEventListener('click', saveUser);
}
