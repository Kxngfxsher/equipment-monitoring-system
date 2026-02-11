const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
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
  else { console.log('Connected to SQLite database.');
  // Миграции users: phone, position, user_status
  db.run("ALTER TABLE users ADD COLUMN phone TEXT", (err) => {
    if (!err) console.log('✅ Migration: phone added to users');
  });
  db.run("ALTER TABLE users ADD COLUMN position TEXT", (err) => {
    if (!err) console.log('✅ Migration: position added to users');
  });
  db.run("ALTER TABLE users ADD COLUMN user_status TEXT DEFAULT 'active'", (err) => {
    if (!err) console.log('✅ Migration: user_status added to users');
  });
  // Миграция: добавляем is_deleted если нет
  db.run("ALTER TABLE equipment ADD COLUMN is_deleted INTEGER DEFAULT 0", (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Migration error:', err.message);
    } else if (!err) {
      console.log('✅ Migration: is_deleted column added to equipment');
    }
  }); initDatabase(); }
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
    db.run(`CREATE TABLE IF NOT EXISTS equipment_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL, equipment_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('working', 'faulty', 'maintenance')),
      description TEXT, photo_files TEXT, audio_file TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
      FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id)
    )`);

    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, first_name, last_name, full_name, description) 
            VALUES ('admin', ?, 'admin', 'Администратор', 'Системы', 'Администратор Системы', 'Главный администратор')`, [hashedPassword]);
    const engPassword = bcrypt.hashSync('eng123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, first_name, last_name, full_name, description) 
            VALUES ('engineer1', ?, 'engineer', 'Тест', 'Инженер', 'Тест Инженер', 'Тестовый инженер')`, [engPassword]);
  });
}

function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/login.html')));

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
