# API Документация - Система контроля оборудования

## Новые возможности

### 1. **Просмотр голосовых отчетов**
- Открывается окно с полной информацией об отчете
- Возможность прослушивания аудио-записи
- Доступно для пользователей и администраторов

### 2. **Связь отчетов со сменами**
- Каждый отчет теперь обязательно связан со сменой
- При удалении смены удаляются все связанные отчеты

### 3. **Управление пользователями**
- Админ может добавлять новых пользователей
- У пользователей теперь есть имя и фамилия (кроме ника)
- Редактирование и удаление пользователей

### 4. **Управление оборудованием**
- Админ может добавлять новое оборудование
- Редактирование и удаление оборудования

### 5. **Задания на сменах**
- Отдельная вкладка с заданиями для каждой смены
- Возможность прикреплять файлы к заданиям
- Пользователи могут скачивать прикрепленные файлы

---

## Аутентификация

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "first_name": "Администратор",
    "last_name": "Системы",
    "full_name": "Администратор Системы"
  }
}
```

### Get Current User
```http
GET /api/auth/me
Authorization: Bearer {token}
```

---

## Управление пользователями (Только админ)

### Получить всех пользователей
```http
GET /api/users
Authorization: Bearer {token}
```

### Создать пользователя
```http
POST /api/users
Authorization: Bearer {token}
Content-Type: application/json

{
  "username": "engineer3",
  "password": "password123",
  "role": "engineer",
  "first_name": "Александр",
  "last_name": "Сидоров",
  "email": "sidorov@example.com"
}
```

### Обновить пользователя
```http
PUT /api/users/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "username": "engineer3",
  "role": "engineer",
  "first_name": "Александр",
  "last_name": "Сидоров",
  "email": "new.email@example.com"
}
```

### Удалить пользователя
```http
DELETE /api/users/{id}
Authorization: Bearer {token}
```

---

## Управление оборудованием

### Получить всё оборудование
```http
GET /api/equipment
Authorization: Bearer {token}
```

### Добавить оборудование (Только админ)
```http
POST /api/equipment
Authorization: Bearer {token}
Content-Type: application/json

{
  "equipment_id": "EQ-005",
  "name": "Турбина №1",
  "type": "Паровая турбина",
  "location": "Цех Г",
  "status": "working",
  "description": "Паровая турбина 50МВт"
}
```

### Обновить оборудование (Только админ)
```http
PUT /api/equipment/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "equipment_id": "EQ-005",
  "name": "Турбина №1",
  "type": "Паровая турбина",
  "location": "Цех Г",
  "status": "maintenance",
  "description": "На плановом ТО"
}
```

### Удалить оборудование (Только админ)
```http
DELETE /api/equipment/{id}
Authorization: Bearer {token}
```

---

## Смены

### Получить смены
```http
GET /api/shifts
Authorization: Bearer {token}
```
*Админ видит все смены, инженер - только свои*

### Получить смену по ID
```http
GET /api/shifts/{id}
Authorization: Bearer {token}
```

### Создать смену (Только админ)
```http
POST /api/shifts
Authorization: Bearer {token}
Content-Type: application/json

{
  "user_id": 2,
  "start_time": "2026-02-10 08:00:00",
  "end_time": "2026-02-10 16:00:00",
  "description": "Дневная смена",
  "location": "Цех А"
}
```

### Обновить смену (Только админ)
```http
PUT /api/shifts/{id}
Authorization: Bearer {token}
Content-Type: application/json
```

### Удалить смену (Только админ)
```http
DELETE /api/shifts/{id}
Authorization: Bearer {token}
```
*При удалении смены удаляются все связанные отчеты и задания!*

---

## Задания на сменах

### Получить задания для смены
```http
GET /api/shifts/{id}/tasks
Authorization: Bearer {token}
```

### Создать задание (Только админ)
```http
POST /api/shifts/{id}/tasks
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Проверка генератора",
  "description": "Проверить уровень масла и температуру",
  "priority": "high"
}
```

### Обновить задание
```http
PUT /api/tasks/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Проверка генератора",
  "description": "Проверка завершена",
  "priority": "high",
  "status": "completed"
}
```

### Удалить задание (Только админ)
```http
DELETE /api/tasks/{id}
Authorization: Bearer {token}
```

---

## Файлы заданий

### Получить файлы задания
```http
GET /api/tasks/{id}/files
Authorization: Bearer {token}
```

### Загрузить файл к заданию
```http
POST /api/tasks/{id}/files
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: [binary data]
```

**Response:**
```json
{
  "id": 1,
  "message": "File uploaded successfully",
  "file": {
    "name": "instruction.pdf",
    "size": 1024000,
    "type": "application/pdf"
  }
}
```

### Скачать файл
```http
GET /api/files/{filename}
Authorization: Bearer {token}
```

### Удалить файл (Только админ)
```http
DELETE /api/files/{id}
Authorization: Bearer {token}
```

---

## Отчеты

### Получить все отчеты
```http
GET /api/reports
Authorization: Bearer {token}
```
*Админ видит все отчеты, инженер - только свои*

### Получить отчет по ID (с полной информацией)
```http
GET /api/reports/{id}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "id": 1,
  "shift_id": 5,
  "user_id": 2,
  "username": "engineer1",
  "first_name": "Иван",
  "last_name": "Иванов",
  "full_name": "Иван Иванов",
  "equipment_id": "EQ-001",
  "equipment_name": "Генератор №1",
  "equipment_type": "Генераторная установка",
  "equipment_location": "Цех А",
  "status": "working",
  "description": "Оборудование работает нормально",
  "audio_file": "audio-1234567890-123456789.mp3",
  "priority": "normal",
  "shift_start": "2026-02-10 08:00:00",
  "shift_end": "2026-02-10 16:00:00",
  "shift_description": "Дневная смена",
  "created_at": "2026-02-10 14:30:00"
}
```

### Создать текстовый отчёт
```http
POST /api/reports
Authorization: Bearer {token}
Content-Type: application/json

{
  "shift_id": 5,
  "equipment_id": "EQ-001",
  "status": "working",
  "description": "Оборудование работает нормально",
  "priority": "normal"
}
```
**Важно: shift_id теперь обязателен!**

### Загрузить голосовой отчёт
```http
POST /api/reports/audio
Authorization: Bearer {token}
Content-Type: multipart/form-data

shift_id: 5
equipment_id: EQ-001
status: working
description: Голосовой отчет
priority: normal
audio: [audio file]
```
**Важно: shift_id теперь обязателен!**

### Прослушать аудио-файл
```http
GET /api/audio/{filename}
Authorization: Bearer {token}
```

---

## Статусы и приоритеты

### Статусы оборудования/отчетов:
- `working` - Работает
- `faulty` - Неисправно
- `maintenance` - На обслуживании
- `retired` - Списано (только для оборудования)

### Приоритеты:
- `low` - Низкий
- `normal` - Обычный
- `high` - Высокий
- `critical` - Критический

### Статусы заданий:
- `pending` - Ожидает
- `in_progress` - В работе
- `completed` - Завершено
- `cancelled` - Отменено

### Роли пользователей:
- `admin` - Администратор
- `engineer` - Инженер

---

## Ограничения файлов

- **Аудио-файлы**: максимум 10MB
- **Файлы заданий**: максимум 50MB

---

## Примеры использования

### Создание смены с заданиями

1. Админ создает смену:
```bash
curl -X POST http://localhost:3000/api/shifts \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 2,
    "start_time": "2026-02-10 08:00:00",
    "end_time": "2026-02-10 16:00:00",
    "description": "Дневная смена"
  }'
```

2. Админ добавляет задание к смене:
```bash
curl -X POST http://localhost:3000/api/shifts/5/tasks \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Проверка генератора",
    "description": "Проверить уровень масла",
    "priority": "high"
  }'
```

3. Админ прикрепляет файл инструкции:
```bash
curl -X POST http://localhost:3000/api/tasks/1/files \
  -H "Authorization: Bearer {token}" \
  -F "file=@instruction.pdf"
```

4. Инженер скачивает файл:
```bash
curl -X GET http://localhost:3000/api/files/task-1234567890-123456789.pdf \
  -H "Authorization: Bearer {token}" \
  -o instruction.pdf
```

5. Инженер создает отчет:
```bash
curl -X POST http://localhost:3000/api/reports/audio \
  -H "Authorization: Bearer {token}" \
  -F "shift_id=5" \
  -F "equipment_id=EQ-001" \
  -F "status=working" \
  -F "description=Проверка выполнена" \
  -F "audio=@report.mp3"
```

6. Админ просматривает отчет:
```bash
curl -X GET http://localhost:3000/api/reports/1 \
  -H "Authorization: Bearer {token}"
```
