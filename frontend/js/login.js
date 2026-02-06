const API_URL = 'http://localhost:3000/api';

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('errorMessage');
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.href = 'index.html';
        } else {
            errorDiv.style.display = 'block';
            errorDiv.querySelector('.alert').textContent = data.error || 'Ошибка авторизации';
        }
    } catch (error) {
        errorDiv.style.display = 'block';
        errorDiv.querySelector('.alert').textContent = 'Ошибка подключения к серверу';
        console.error('Login error:', error);
    }
});
