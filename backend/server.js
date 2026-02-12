const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
const documentsDir = path.join(uploadsDir, 'documents');
if (!fs.existsSync(documentsDir)) fs.mkdirSync(documentsDir, { recursive: true });
const photosDir = path.join(__dirname, 'uploads/photos');
const tasksDir = path.join(__dirname, 'uploads/tasks');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });

app.use('/api/photos', express.static(photosDir, { setHeaders: (res) => res.set('Cache-Control', 'public, max-age=86400') }));
app.use('/api/audio', express.static(uploadsDir, { setHeaders: (res) => res.set('Cache-Control', 'public, max-age=86400') }));
app.use(express.static(path.join(__dirname, '../frontend')));

const db = new sqlite3.Database('./equipment_monitoring.db', (err) => {
  if (err) console.error('Error opening database:', err.message);
  else {
    console.log('Connected to SQLite database.');
    initDatabase();
  }
});

function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'engineer')), first_name TEXT, last_name TEXT,
      full_name TEXT, email TEXT, phone TEXT, position TEXT, user_status TEXT DEFAULT 'active',
      description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL, description TEXT, location TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS shift_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(shift_id, user_id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT, equipment_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      type TEXT, location TEXT, status TEXT DEFAULT 'working', description TEXT, is_deleted INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER NOT NULL UNIQUE, user_id INTEGER NOT NULL,
      priority TEXT DEFAULT 'normal', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS equipment_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL, equipment_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('working', 'faulty', 'maintenance')),
      description TEXT, photo_files TEXT, audio_file TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
      FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id)
    )`);

    // Папки документов
    db.run(`CREATE TABLE IF NOT EXISTS document_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // === Миграции (безопасные — ALTER TABLE с проверкой) ===
    db.run("ALTER TABLE users ADD COLUMN phone TEXT", () => {});
    db.run("ALTER TABLE users ADD COLUMN position TEXT", () => {});
    db.run("ALTER TABLE users ADD COLUMN user_status TEXT DEFAULT 'active'", () => {});
    db.run("ALTER TABLE equipment ADD COLUMN is_deleted INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE documents ADD COLUMN folder_id INTEGER REFERENCES document_folders(id) ON DELETE SET NULL", () => {});
    console.log('✅ Migrations checked');

        const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, first_name, last_name, full_name, description) 
            VALUES ('admin', ?, 'admin', 'Администратор', 'Системы', 'Администратор Системы', 'Главный администратор')`, [hashedPassword]);
    const engPassword = bcrypt.hashSync('eng123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, first_name, last_name, full_name, description) 
            VALUES ('engineer1', ?, 'engineer', 'Тест', 'Инженер', 'Тест Инженер', 'Тестовый инженер')`, [engPassword]);
  });
}

function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, first_name: user.first_name, last_name: user.last_name, full_name: user.full_name } });
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get('SELECT id, username, role, first_name, last_name, full_name FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(user);
  });
});

app.get('/api/users', authenticateToken, (req, res) => {
  db.all('SELECT id, username, role, first_name, last_name, full_name, email, phone, position, user_status, description, created_at FROM users ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/users', authenticateToken, isAdmin, (req, res) => {
  const { username, password, role, first_name, last_name, email, phone, position, user_status, description } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'Username, password and role are required' });
  const full_name = `${first_name || ''} ${last_name || ''}`.trim();
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (username, password, role, first_name, last_name, full_name, email, phone, position, user_status, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [username, hashedPassword, role, first_name, last_name, full_name, email, description],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
        return res.status(500).json({ error: 'Failed to create user' });
      }
      res.json({ id: this.lastID, message: 'User created successfully' });
    });
});

app.put('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
  const { username, password, role, first_name, last_name, email, phone, position, user_status, description } = req.body;
  const full_name = `${first_name || ''} ${last_name || ''}`.trim();
  let query, params;
  if (password) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    query = 'UPDATE users SET username = ?, password = ?, role = ?, first_name = ?, last_name = ?, full_name = ?, email = ?, description = ? WHERE id = ?';
    params = [username, hashedPassword, role, first_name, last_name, full_name, email, description, req.params.id];
  } else {
    query = 'UPDATE users SET username = ?, role = ?, first_name = ?, last_name = ?, full_name = ?, email = ?, description = ? WHERE id = ?';
    params = [username, role, first_name, last_name, full_name, email, description, req.params.id];
  }
  db.run(query, params, function(err) {
    if (err) return res.status(500).json({ error: 'Failed to update user' });
    res.json({ message: 'User updated successfully' });
  });
});

app.delete('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
  if (req.params.id == req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to delete user' });
    res.json({ message: 'User deleted successfully' });
  });
});

app.get('/api/equipment', authenticateToken, (req, res) => {
  db.all('SELECT * FROM equipment ORDER BY created_at ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.get('/api/equipment/latest-status', authenticateToken, (req, res) => {
  db.all(`SELECT e.equipment_id, e.name, e.type, e.location,
    COALESCE((SELECT er.status FROM equipment_reports er JOIN reports r ON er.report_id = r.id JOIN shifts s ON r.shift_id = s.id WHERE er.equipment_id = e.equipment_id AND date(s.start_time) <= date('now') ORDER BY s.start_time DESC LIMIT 1), 'working') as last_status
    FROM equipment e WHERE e.is_deleted = 0 ORDER BY e.created_at ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/equipment', authenticateToken, isAdmin, (req, res) => {
  const { equipment_id, name, type, location, status, description } = req.body;
  db.run('INSERT INTO equipment (equipment_id, name, type, location, status, description) VALUES (?, ?, ?, ?, ?, ?)',
    [equipment_id, name, type, location, status || 'working', description],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to create equipment' });
      res.json({ id: this.lastID, message: 'Equipment created successfully' });
    });
});

app.delete('/api/equipment/:id', authenticateToken, isAdmin, (req, res) => {
  db.run('UPDATE equipment SET is_deleted = 1 WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to delete equipment' });
    res.json({ message: 'Equipment archived successfully' });
  });
});


// История отчётов по оборудованию
app.get('/api/equipment/:equipmentId/history', authenticateToken, (req, res) => {
  const equipmentId = req.params.equipmentId;
  db.all(`SELECT er.*, r.shift_id, r.user_id, r.created_at as report_date,
    s.start_time, s.end_time,
    u.username, u.full_name
    FROM equipment_reports er
    JOIN reports r ON er.report_id = r.id
    JOIN shifts s ON r.shift_id = s.id
    JOIN users u ON r.user_id = u.id
    WHERE er.equipment_id = ?
    ORDER BY s.start_time DESC`, [equipmentId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    rows.forEach(row => { try { row.photo_files = JSON.parse(row.photo_files || '[]'); } catch(e) { row.photo_files = []; } });
    res.json(rows);
  });
});

// Получить оборудование включая удалённое (для админа)
app.get('/api/equipment/all-with-deleted', authenticateToken, isAdmin, (req, res) => {
  db.all('SELECT * FROM equipment ORDER BY is_deleted ASC, created_at ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});


// Восстановить оборудование из архива
app.patch('/api/equipment/:id/restore', authenticateToken, isAdmin, (req, res) => {
  db.run('UPDATE equipment SET is_deleted = 0 WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to restore equipment' });
    res.json({ message: 'Equipment restored successfully' });
  });
});

app.get('/api/shifts', authenticateToken, (req, res) => {
  // Все пользователи видят все смены, users через shift_users
  const query = `SELECT s.*, 
    (SELECT COUNT(*) FROM reports WHERE shift_id = s.id) as has_report
    FROM shifts s ORDER BY s.start_time DESC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    // Для каждой смены подгружаем назначенных пользователей
    const shiftIds = rows.map(r => r.id);
    if (shiftIds.length === 0) return res.json([]);
    const placeholders = shiftIds.map(() => '?').join(',');
    db.all(`SELECT su.shift_id, u.id, u.id as user_id, u.username, u.first_name, u.last_name, u.full_name 
      FROM shift_users su JOIN users u ON su.user_id = u.id 
      WHERE su.shift_id IN (${placeholders})`, shiftIds, (err2, userRows) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      const userMap = {};
      userRows.forEach(ur => {
        if (!userMap[ur.shift_id]) userMap[ur.shift_id] = [];
        userMap[ur.shift_id].push({ id: ur.user_id, username: ur.username, first_name: ur.first_name, last_name: ur.last_name, full_name: ur.full_name });
      });
      rows.forEach(row => {
        row.users = userMap[row.id] || [];
        // Обратная совместимость: user_id, username и т.д. от первого назначенного
        if (row.users.length > 0) {
          row.user_id = row.users[0].id;
          row.username = row.users[0].username;
          row.first_name = row.users[0].first_name;
          row.last_name = row.users[0].last_name;
          row.full_name = row.users[0].full_name;
        }
      });
      res.json(rows);
    });
  });
});

app.get('/api/shifts/:id', authenticateToken, (req, res) => {
  db.get(`SELECT s.* FROM shifts s WHERE s.id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Shift not found' });
    db.all(`SELECT u.id, u.id as user_id, u.username, u.first_name, u.last_name, u.full_name 
      FROM shift_users su JOIN users u ON su.user_id = u.id WHERE su.shift_id = ?`, [row.id], (err2, users) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      row.users = users;
      if (users.length > 0) {
        row.user_id = users[0].user_id;
        row.username = users[0].username;
        row.first_name = users[0].first_name;
        row.last_name = users[0].last_name;
        row.full_name = users[0].full_name;
      }
      res.json(row);
    });
  });
});

app.post('/api/shifts', authenticateToken, isAdmin, (req, res) => {
  const { user_ids, user_id, start_time, end_time, description, location } = req.body;
  // Поддерживаем и user_ids (массив) и user_id (одиночный) для обратной совместимости
  const assignedUsers = user_ids || (user_id ? [user_id] : []);
  if (assignedUsers.length === 0) return res.status(400).json({ error: 'Нужно назначить хотя бы одного пользователя' });
  db.run('INSERT INTO shifts (user_id, start_time, end_time, description, location) VALUES (?, ?, ?, ?, ?)',
    [assignedUsers[0], start_time, end_time, description, location],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to create shift' });
      const shiftId = this.lastID;
      const stmt = db.prepare('INSERT OR IGNORE INTO shift_users (shift_id, user_id) VALUES (?, ?)');
      assignedUsers.forEach(uid => stmt.run(shiftId, uid));
      stmt.finalize(() => {
        res.json({ id: shiftId, message: 'Shift created successfully' });
      });
    });
});

// Редактирование смены (админ)
app.put('/api/shifts/:id', authenticateToken, isAdmin, (req, res) => {
  const { user_ids, user_id, start_time, end_time, description, location } = req.body;
  const assignedUsers = user_ids || (user_id ? [user_id] : []);
  db.run('UPDATE shifts SET user_id = ?, start_time = ?, end_time = ?, description = ?, location = ? WHERE id = ?',
    [assignedUsers[0] || null, start_time, end_time, description, location, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to update shift' });
      if (this.changes === 0) return res.status(404).json({ error: 'Shift not found' });
      // Пересоздаём назначения
      db.run('DELETE FROM shift_users WHERE shift_id = ?', [req.params.id], (err2) => {
        if (err2) return res.status(500).json({ error: 'Failed to update shift users' });
        if (assignedUsers.length === 0) return res.json({ message: 'Shift updated successfully' });
        const stmt = db.prepare('INSERT OR IGNORE INTO shift_users (shift_id, user_id) VALUES (?, ?)');
        assignedUsers.forEach(uid => stmt.run(req.params.id, uid));
        stmt.finalize(() => {
          res.json({ message: 'Shift updated successfully' });
        });
      });
    });
});

app.delete('/api/shifts/:id', authenticateToken, isAdmin, (req, res) => {
  db.all('SELECT er.photo_files, er.audio_file FROM equipment_reports er JOIN reports r ON er.report_id = r.id WHERE r.shift_id = ?', [req.params.id], (err, items) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    // Удаляем назначения из shift_users (CASCADE должен сработать, но на всякий случай)
    db.run('DELETE FROM shift_users WHERE shift_id = ?', [req.params.id]);
    db.run('DELETE FROM shifts WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: 'Failed to delete shift' });
      items.forEach(item => {
        if (item.audio_file && fs.existsSync(path.join(uploadsDir, item.audio_file))) fs.unlinkSync(path.join(uploadsDir, item.audio_file));
        if (item.photo_files) {
          try {
            JSON.parse(item.photo_files).forEach(photo => {
              if (fs.existsSync(path.join(photosDir, photo))) fs.unlinkSync(path.join(photosDir, photo));
            });
          } catch (e) {}
        }
      });
      res.json({ message: 'Shift deleted successfully' });
    });
  });
});

app.post('/api/reports/v2/create', authenticateToken, (req, res) => {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, file.fieldname.startsWith('audio_') ? uploadsDir : photosDir),
      filename: (req, file, cb) => {
        const prefix = file.fieldname.startsWith('audio_') ? 'audio-' : 'photo-';
        cb(null, prefix + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
  }).any();

  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: 'Upload error: ' + err.message });
    try {
      const { shift_id, equipment_items } = req.body;
      if (!shift_id) return res.status(400).json({ error: 'shift_id is required' });
      if (!equipment_items) return res.status(400).json({ error: 'equipment_items is required' });

      const existing = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM reports WHERE shift_id = ?', [shift_id], (err, row) => err ? reject(err) : resolve(row));
      });
      if (existing) return res.status(400).json({ error: 'Отчёт уже существует для этой смены' });

      const shift = await new Promise((resolve, reject) => {
        db.get('SELECT start_time FROM shifts WHERE id = ?', [shift_id], (err, row) => err ? reject(err) : resolve(row));
      });
      if (!shift) return res.status(404).json({ error: 'Shift not found' });

      if (req.user.role !== 'admin') {
        const shiftDate = new Date(shift.start_time);
        const today = new Date();
        shiftDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        if (shiftDate > today) return res.status(403).json({ error: 'Нельзя создать отчёт для будущей смены' });
        // Проверяем через shift_users
        const isAssigned = await new Promise((resolve, reject) => {
          db.get('SELECT id FROM shift_users WHERE shift_id = ? AND user_id = ?', [shift_id, req.user.id], (err, row) => err ? reject(err) : resolve(row));
        });
        if (!isAssigned) return res.status(403).json({ error: 'Вы не назначены на эту смену' });
      }

      const items = JSON.parse(equipment_items);
      const reportId = await new Promise((resolve, reject) => {
        db.run('INSERT INTO reports (shift_id, user_id, priority) VALUES (?, ?, ?)', [shift_id, req.user.id, 'normal'],
          function(err) { err ? reject(err) : resolve(this.lastID); });
      });

      const filesByEquipment = {};
      if (req.files) {
        req.files.forEach(file => {
          const match = file.fieldname.match(/^(photos|audio)_(.+)$/);
          if (match) {
            const [, type, equipmentId] = match;
            if (!filesByEquipment[equipmentId]) filesByEquipment[equipmentId] = { photos: [], audio: null };
            if (type === 'photos') filesByEquipment[equipmentId].photos.push(file.filename);
            else if (type === 'audio') filesByEquipment[equipmentId].audio = file.filename;
          }
        });
      }

      await Promise.all(items.map(item => {
        const files = filesByEquipment[item.equipment_id] || { photos: [], audio: null };
        return new Promise((resolve, reject) => {
          db.run('INSERT INTO equipment_reports (report_id, equipment_id, status, description, photo_files, audio_file) VALUES (?, ?, ?, ?, ?, ?)',
            [reportId, item.equipment_id, item.status, item.description || '', JSON.stringify(files.photos), files.audio],
            function(err) { err ? reject(err) : resolve(this.lastID); });
        });
      }));

      res.json({ id: reportId, message: 'Отчёт успешно создан', equipment_count: items.length });
    } catch (error) {
      console.error('Error creating report:', error);
      res.status(500).json({ error: 'Failed to create report: ' + error.message });
    }
  });
});

app.get('/api/shifts/:id/report/v2', authenticateToken, (req, res) => {
  db.get('SELECT r.*, u.username, u.first_name, u.last_name, u.full_name FROM reports r JOIN users u ON r.user_id = u.id WHERE r.shift_id = ?',
    [req.params.id], (err, report) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!report) return res.status(404).json({ error: 'Report not found' });
      db.all(`SELECT er.*, e.name, e.type, e.location FROM equipment_reports er JOIN equipment e ON er.equipment_id = e.equipment_id WHERE er.report_id = ? ORDER BY e.created_at ASC`,
        [report.id], (err, equipmentItems) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          equipmentItems = equipmentItems.map(item => {
            try { item.photo_files = JSON.parse(item.photo_files || '[]'); } catch (e) { item.photo_files = []; }
            return item;
          });
          res.json({
            report_id: report.id, shift_id: report.shift_id,
            user: { id: report.user_id, username: report.username, first_name: report.first_name, last_name: report.last_name, full_name: report.full_name },
            priority: report.priority, created_at: report.created_at, equipment_items: equipmentItems
          });
        });
    });
});

// === ДОКУМЕНТАЦИЯ ===
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, documentsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});
const docUpload = multer({ storage: docStorage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

// ==================== ПАПКИ ДОКУМЕНТОВ ====================

// Список папок
app.get('/api/document-folders', authenticateToken, (req, res) => {
  db.all(`SELECT df.*, COUNT(d.id) as doc_count 
    FROM document_folders df LEFT JOIN documents d ON d.folder_id = df.id 
    GROUP BY df.id ORDER BY df.name`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    // Также считаем документы без папки
    db.get(`SELECT COUNT(*) as count FROM documents WHERE folder_id IS NULL`, [], (err2, row) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      res.json({ folders: rows, uncategorized_count: row.count });
    });
  });
});

// Создать папку (только админ)
app.post('/api/document-folders', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Название папки обязательно' });
  db.run(`INSERT INTO document_folders (name) VALUES (?)`, [name.trim()], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ id: this.lastID, name: name.trim(), message: 'Папка создана' });
  });
});

// Переименовать папку (только админ)
app.put('/api/document-folders/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Название папки обязательно' });
  db.run(`UPDATE document_folders SET name = ? WHERE id = ?`, [name.trim(), req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Папка не найдена' });
    res.json({ message: 'Папка переименована' });
  });
});

// Удалить папку (только админ) — документы перемещаются в корень
app.delete('/api/document-folders/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
  db.run(`UPDATE documents SET folder_id = NULL WHERE folder_id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    db.run(`DELETE FROM document_folders WHERE id = ?`, [req.params.id], function(err2) {
      if (err2) return res.status(500).json({ error: 'Database error' });
      if (this.changes === 0) return res.status(404).json({ error: 'Папка не найдена' });
      res.json({ message: 'Папка удалена, документы перемещены в корень' });
    });
  });
});

// Переместить документ в папку (только админ)
app.put('/api/documents/:id/move', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
  const folderId = req.body.folder_id === null || req.body.folder_id === 0 ? null : req.body.folder_id;
  db.run(`UPDATE documents SET folder_id = ? WHERE id = ?`, [folderId, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Документ не найден' });
    res.json({ message: 'Документ перемещён' });
  });
});

// ==================== ДОКУМЕНТЫ ====================

// Список документов (все авторизованные) — с фильтром по папке
app.get('/api/documents', authenticateToken, (req, res) => {
  const folderId = req.query.folder_id;
  let sql = `SELECT d.*, u.username as uploaded_by_name 
    FROM documents d LEFT JOIN users u ON d.uploaded_by = u.id`;
  let params = [];
  
  if (folderId === 'null' || folderId === '0') {
    sql += ` WHERE d.folder_id IS NULL`;
  } else if (folderId) {
    sql += ` WHERE d.folder_id = ?`;
    params.push(folderId);
  }
  sql += ` ORDER BY d.created_at DESC`;
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// Загрузка файла (только админ)
app.post('/api/documents', authenticateToken, docUpload.single('file'), (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только администратор может загружать файлы' });
  if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });
  
  const folderId = req.body.folder_id || null;
  db.run(`INSERT INTO documents (filename, original_name, mime_type, size, uploaded_by, folder_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id, folderId],
    function(err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ id: this.lastID, message: 'Файл загружен', filename: req.file.filename, original_name: req.file.originalname });
    });
});

// Скачивание/просмотр файла (все авторизованные)
app.get('/api/documents/:id/download', authenticateToken, (req, res) => {
  db.get('SELECT * FROM documents WHERE id = ?', [req.params.id], (err, doc) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!doc) return res.status(404).json({ error: 'Файл не найден' });
    const filePath = path.join(documentsDir, doc.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден на диске' });
    res.download(filePath, doc.original_name);
  });
});

// Предпросмотр файла (все авторизованные)
app.get('/api/documents/:id/preview', authenticateToken, (req, res) => {
  db.get('SELECT * FROM documents WHERE id = ?', [req.params.id], (err, doc) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!doc) return res.status(404).json({ error: 'Файл не найден' });
    const filePath = path.join(documentsDir, doc.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден на диске' });
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name)}"`);
    fs.createReadStream(filePath).pipe(res);
  });
});

// Удаление документа (только админ)
app.delete('/api/documents/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только администратор может удалять файлы' });
  db.get('SELECT * FROM documents WHERE id = ?', [req.params.id], (err, doc) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!doc) return res.status(404).json({ error: 'Файл не найден' });
    const filePath = path.join(documentsDir, doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.run('DELETE FROM documents WHERE id = ?', [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      res.json({ message: 'Файл удалён' });
    });
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/login.html')));


// === ГЕНЕРАЦИЯ PDF-ОТЧЁТА ПО ОБОРУДОВАНИЮ ЗА ПЕРИОД ===
app.get('/api/equipment/:equipId/report', authenticateToken, (req, res) => {
  const equipmentId = req.params.equipId;
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Параметры from и to обязательны' });
  }

  // Получаем информацию об оборудовании по equipment_id (текстовый код)
  db.get('SELECT * FROM equipment WHERE equipment_id = ?', [equipmentId], (err, equipment) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!equipment) return res.status(404).json({ error: 'Оборудование не найдено' });

    // Получаем записи из equipment_reports за период
    const sql = `
      SELECT er.status, er.description as comment, er.photo_files, er.audio_file,
             er.report_id, er.created_at,
             r.shift_id, r.user_id,
             s.start_time, s.end_time, s.description as shift_desc,
             u.username, u.full_name
      FROM equipment_reports er
      JOIN reports r ON er.report_id = r.id
      JOIN shifts s ON r.shift_id = s.id
      JOIN users u ON r.user_id = u.id
      WHERE er.equipment_id = ?
        AND date(s.start_time) >= ? AND date(s.start_time) <= ?
      ORDER BY s.start_time DESC, er.created_at DESC
    `;

    db.all(sql, [equipmentId, from, to], (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // Адаптируем поля для generatePDF
      rows.forEach(row => {
        row.shift_date = row.start_time ? row.start_time.split('T')[0] : null;
        row.shift_type = null; // У нас нет shift_type — будем показывать время
        row.shift_time = row.start_time && row.end_time
          ? row.start_time.substring(11, 16) + '–' + row.end_time.substring(11, 16)
          : '';
        row.media = [];
        // Парсим фото
        if (row.photo_files) {
          try {
            const photos = JSON.parse(row.photo_files);
            photos.forEach(p => row.media.push({ media_type: 'photo', file_path: 'uploads/photos/' + p }));
          } catch(e) {}
        }
        // Аудио
        if (row.audio_file) {
          row.media.push({ media_type: 'audio', file_path: row.audio_file.startsWith('uploads') ? row.audio_file : 'uploads/photos/' + row.audio_file });
        }
      });

      generatePDF(res, equipment, rows, from, to);
    });
  });
});

function generatePDF(res, equipment, rows, fromDate, toDate) {
  const fontsDir = path.join(__dirname, 'fonts');
  const fontRegular = path.join(fontsDir, 'Roboto-Regular.ttf');
  const fontBold = path.join(fontsDir, 'Roboto-Bold.ttf');

  const doc = new PDFDocument({ 
    size: 'A4', 
    margin: 40,
    bufferPages: true,
    info: {
      Title: 'Отчёт по оборудованию: ' + equipment.name,
      Author: 'Equipment Monitoring System',
      CreationDate: new Date()
    }
  });

  // Стрим напрямую в response
  res.setHeader('Content-Type', 'application/pdf');
  const filename = encodeURIComponent('Отчёт_' + equipment.name + '_' + fromDate + '_' + toDate + '.pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  doc.pipe(res);

  // Регистрируем шрифты
  doc.registerFont('Regular', fontRegular);
  doc.registerFont('Bold', fontBold);

  const formatDate = (d) => {
    if (!d) return '-';
    const parts = d.split('-');
    if (parts.length === 3) return parts[2] + '.' + parts[1] + '.' + parts[0];
    return d;
  };

  const shiftTypeName = (t) => {
    const types = { day: 'Дневная', night: 'Ночная', morning: 'Утренняя', evening: 'Вечерняя' };
    return types[t] || t || '-';
  };

  const statusLabel = (s) => {
    const statuses = { 
      working: 'Исправно', 
      faulty: 'Неисправно',
      maintenance: 'На обслуживании'
    };
    return statuses[s] || s || '-';
  };

  const pageWidth = doc.page.width - 80;

  // === ШАПКА ===
  doc.font('Bold').fontSize(18).fillColor('#1a237e')
     .text('ОТЧЁТ ПО ОБОРУДОВАНИЮ', { align: 'center' });
  doc.moveDown(0.3);

  doc.font('Bold').fontSize(14).fillColor('#333')
     .text(equipment.name, { align: 'center' });
  doc.moveDown(0.2);

  if (equipment.location) {
    doc.font('Regular').fontSize(10).fillColor('#666')
       .text('Расположение: ' + equipment.location, { align: 'center' });
  }
  doc.moveDown(0.3);

  doc.font('Regular').fontSize(10).fillColor('#666')
     .text('Период: ' + formatDate(fromDate) + ' — ' + formatDate(toDate), { align: 'center' });
  doc.moveDown(0.2);

  doc.font('Regular').fontSize(9).fillColor('#999')
     .text('Сформирован: ' + new Date().toLocaleString('ru-RU'), { align: 'center' });
  doc.moveDown(0.5);

  // Разделитель
  doc.moveTo(40, doc.y).lineTo(40 + pageWidth, doc.y).strokeColor('#1a237e').lineWidth(2).stroke();
  doc.moveDown(0.5);

  // === СВОДКА ===
  doc.font('Bold').fontSize(12).fillColor('#333')
     .text('Сводная информация');
  doc.moveDown(0.3);

  const totalRecords = rows.length;
  const statusCounts = {};
  rows.forEach(r => {
    const label = statusLabel(r.status);
    statusCounts[label] = (statusCounts[label] || 0) + 1;
  });

  doc.font('Regular').fontSize(10).fillColor('#333');
  doc.text('Всего записей: ' + totalRecords);
  Object.entries(statusCounts).forEach(([status, count]) => {
    doc.text('  - ' + status + ': ' + count);
  });
  doc.moveDown(0.5);

  // Тонкий разделитель
  doc.moveTo(40, doc.y).lineTo(40 + pageWidth, doc.y).strokeColor('#ccc').lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  // === ЗАПИСИ ===
  if (rows.length === 0) {
    doc.font('Regular').fontSize(11).fillColor('#999')
       .text('За указанный период записи отсутствуют.', { align: 'center' });
  } else {
    doc.font('Bold').fontSize(12).fillColor('#333')
       .text('Детализация по сменам');
    doc.moveDown(0.5);

    rows.forEach((row, index) => {
      // Проверяем нужна ли новая страница
      if (doc.y > doc.page.height - 200) {
        doc.addPage();
      }

      // Статус цветом
      let statusColor = '#4caf50';
      if (row.status === 'faulty') statusColor = '#f44336';
      if (row.status === 'maintenance') statusColor = '#ff9800';

      // Заголовок записи
      doc.font('Bold').fontSize(10).fillColor(statusColor)
         .text(statusLabel(row.status), { continued: true });
      doc.font('Regular').fontSize(10).fillColor('#333')
         .text('    ' + formatDate(row.shift_date) + ' | ' + (row.shift_time || '-') + ' | ' + (row.full_name || row.username));
      doc.moveDown(0.2);

      // Комментарий
      if (row.comment) {
        doc.font('Regular').fontSize(9).fillColor('#555')
           .text('Комментарий: ' + row.comment, { indent: 15 });
        doc.moveDown(0.2);
      }

      // Медиа
      if (row.media && row.media.length > 0) {
        row.media.forEach(m => {
          if (m.media_type === 'photo' && m.file_path) {
            const photoPath = path.join(__dirname, m.file_path);
            try {
              const fs = require('fs');
              if (fs.existsSync(photoPath)) {
                if (doc.y > doc.page.height - 250) {
                  doc.addPage();
                }
                doc.image(photoPath, doc.x + 15, doc.y, { 
                  fit: [200, 150], 
                  align: 'left'
                });
                doc.moveDown(0.3);
                // Сдвигаем Y вниз после картинки
                doc.y = doc.y + 150;
              }
            } catch(imgErr) {
              doc.font('Regular').fontSize(8).fillColor('#999')
                 .text('[Фото: файл недоступен]', { indent: 15 });
            }
          } else if (m.media_type === 'audio') {
            doc.font('Regular').fontSize(8).fillColor('#999')
               .text('[Прикреплён аудиофайл]', { indent: 15 });
            doc.moveDown(0.1);
          }
        });
      }

      // Разделитель между записями
      if (index < rows.length - 1) {
        doc.moveDown(0.3);
        doc.moveTo(55, doc.y).lineTo(40 + pageWidth - 15, doc.y)
           .strokeColor('#e0e0e0').lineWidth(0.5).stroke();
        doc.moveDown(0.4);
      }
    });
  }

  // === НИЖНИЙ КОЛОНТИТУЛ ===
  doc.moveDown(1);
  doc.moveTo(40, doc.y).lineTo(40 + pageWidth, doc.y).strokeColor('#1a237e').lineWidth(1).stroke();
  doc.moveDown(0.3);
  doc.font('Regular').fontSize(8).fillColor('#999')
     .text('Equipment Monitoring System | Автоматически сгенерированный отчёт', { align: 'center' });

  doc.end();
}

app.listen(PORT, () => {
  console.log(`\n===========================================`);
  console.log(`  Server v1.1.3 is running`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  📦 Отчёт = ВСЁ оборудование сразу`);
  console.log(`  📅 Проверка даты для инженеров`);
  console.log(`===========================================\n`);
});

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error('Error closing database:', err.message);
    console.log('Database connection closed.');
    process.exit(0);
  });
});
