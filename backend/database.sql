-- Схема базы данных для системы контроля оборудования

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,  -- bcrypt хеш
    role TEXT NOT NULL CHECK(role IN ('admin', 'engineer')),
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица смен
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    description TEXT,
    location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Таблица оборудования
CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    location TEXT,
    status TEXT DEFAULT 'working' CHECK(status IN ('working', 'faulty', 'maintenance', 'retired')),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица отчётов (связанных со сменами)
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    equipment_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('working', 'faulty', 'maintenance')),
    description TEXT,
    audio_file TEXT,  -- путь к аудио файлу
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'critical')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Таблица заданий для смен
CREATE TABLE IF NOT EXISTS shift_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'critical')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Таблица файлов заданий
CREATE TABLE IF NOT EXISTS task_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    uploaded_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES shift_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time);
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_shift_id ON reports(shift_id);
CREATE INDEX IF NOT EXISTS idx_reports_equipment_id ON reports(equipment_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_shift_tasks_shift_id ON shift_tasks(shift_id);
CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON task_files(task_id);

-- Тестовые данные

-- Пользователи (пароли будут хешированы в приложении)
INSERT OR IGNORE INTO users (username, password, role, first_name, last_name, full_name, email) VALUES 
('admin', '$2a$10$abcdefghijklmnopqrstuv', 'admin', 'Администратор', 'Системы', 'Администратор Системы', 'admin@example.com'),
('engineer1', '$2a$10$abcdefghijklmnopqrstuv', 'engineer', 'Иван', 'Иванов', 'Иван Иванов', 'ivanov@example.com'),
('engineer2', '$2a$10$abcdefghijklmnopqrstuv', 'engineer', 'Пётр', 'Петров', 'Пётр Петров', 'petrov@example.com');

-- Оборудование
INSERT OR IGNORE INTO equipment (equipment_id, name, type, location, status, description) VALUES 
('EQ-001', 'Генератор №1', 'Генераторная установка', 'Цех А', 'working', 'Дизельный генератор 500кВт'),
('EQ-002', 'Компрессор №1', 'Воздушный компрессор', 'Цех Б', 'working', 'Винтовой компрессор 15бар'),
('EQ-003', 'Насос №5', 'Водяной насос', 'Насосная станция', 'maintenance', 'Центробежный насос 100м³/ч'),
('EQ-004', 'Станок ЧПУ', 'Токарный станок', 'Цех В', 'working', 'Токарный станок с ЧПУ');

-- Смены (примеры)
INSERT OR IGNORE INTO shifts (user_id, start_time, end_time, description) VALUES 
(2, datetime('now', '+1 day', 'start of day', '+8 hours'), datetime('now', '+1 day', 'start of day', '+16 hours'), 'Дневная смена'),
(3, datetime('now', '+1 day', 'start of day', '+16 hours'), datetime('now', '+2 day', 'start of day'), 'Ночная смена');
