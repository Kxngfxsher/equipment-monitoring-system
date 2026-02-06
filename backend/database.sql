-- Схема базы данных для системы контроля оборудования

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,  -- bcrypt хеш
    role TEXT NOT NULL CHECK(role IN ('admin', 'engineer')),
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица отчётов
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    equipment_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('working', 'faulty', 'maintenance')),
    description TEXT,
    audio_file TEXT,  -- путь к аудио файлу
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'critical')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time);
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_equipment_id ON reports(equipment_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

-- Тестовые данные

-- Пользователи (пароли будут хешированы в приложении)
INSERT OR IGNORE INTO users (username, password, role, full_name, email) VALUES 
('admin', '$2a$10$abcdefghijklmnopqrstuv', 'admin', 'Администратор Системы', 'admin@example.com'),
('engineer1', '$2a$10$abcdefghijklmnopqrstuv', 'engineer', 'Иванов Иван', 'ivanov@example.com'),
('engineer2', '$2a$10$abcdefghijklmnopqrstuv', 'engineer', 'Петров Пётр', 'petrov@example.com');

-- Оборудование
INSERT OR IGNORE INTO equipment (equipment_id, name, type, location, status) VALUES 
('EQ-001', 'Генератор №1', 'Генераторная установка', 'Цех А', 'working'),
('EQ-002', 'Компрессор №1', 'Воздушный компрессор', 'Цех Б', 'working'),
('EQ-003', 'Насос №5', 'Водяной насос', 'Насосная станция', 'maintenance'),
('EQ-004', 'Станок ЧПУ', 'Токарный станок', 'Цех В', 'working');

-- Смены (примеры)
INSERT OR IGNORE INTO shifts (user_id, start_time, end_time, description) VALUES 
(2, datetime('now', '+1 day', 'start of day', '+8 hours'), datetime('now', '+1 day', 'start of day', '+16 hours'), 'Дневная смена'),
(3, datetime('now', '+1 day', 'start of day', '+16 hours'), datetime('now', '+2 day', 'start of day'), 'Ночная смена');
