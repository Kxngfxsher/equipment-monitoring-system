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
  else { console.log('Connected to SQLite database.'); initDatabase(); }
});

function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'engineer')), first_name TEXT, last_name TEXT,
      full_name TEXT, email TEXT, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL, description TEXT, location TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT, equipment_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      type TEXT, location TEXT, status TEXT DEFAULT 'working', description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  db.all('SELECT id, username, role, first_name, last_name, full_name, email, description, created_at FROM users ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/users', authenticateToken, isAdmin, (req, res) => {
  const { username, password, role, first_name, last_name, email, description } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'Username, password and role are required' });
  const full_name = `${first_name || ''} ${last_name || ''}`.trim();
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (username, password, role, first_name, last_name, full_name, email, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
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
  const { username, password, role, first_name, last_name, email, description } = req.body;
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
    COALESCE((SELECT er.status FROM equipment_reports er WHERE er.equipment_id = e.equipment_id ORDER BY er.created_at DESC LIMIT 1), 'working') as last_status,
    COALESCE((SELECT er.description FROM equipment_reports er WHERE er.equipment_id = e.equipment_id ORDER BY er.created_at DESC LIMIT 1), '') as last_description
    FROM equipment e ORDER BY e.created_at ASC`, [], (err, rows) => {
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
  db.run('DELETE FROM equipment WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to delete equipment' });
    res.json({ message: 'Equipment deleted successfully' });
  });
});

app.get('/api/shifts', authenticateToken, (req, res) => {
  // Все пользователи видят все смены
  const query = `SELECT s.*, u.username, u.first_name, u.last_name, u.full_name, 
    (SELECT COUNT(*) FROM reports WHERE shift_id = s.id) as has_report 
    FROM shifts s JOIN users u ON s.user_id = u.id 
    ORDER BY s.start_time DESC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.get('/api/shifts/:id', authenticateToken, (req, res) => {
  db.get(`SELECT s.*, u.username, u.first_name, u.last_name, u.full_name FROM shifts s JOIN users u ON s.user_id = u.id WHERE s.id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Shift not found' });
    res.json(row);
  });
});

app.post('/api/shifts', authenticateToken, isAdmin, (req, res) => {
  const { user_id, start_time, end_time, description, location } = req.body;
  db.run('INSERT INTO shifts (user_id, start_time, end_time, description, location) VALUES (?, ?, ?, ?, ?)',
    [user_id, start_time, end_time, description, location],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to create shift' });
      res.json({ id: this.lastID, message: 'Shift created successfully' });
    });
});

app.delete('/api/shifts/:id', authenticateToken, isAdmin, (req, res) => {
  db.all('SELECT er.photo_files, er.audio_file FROM equipment_reports er JOIN reports r ON er.report_id = r.id WHERE r.shift_id = ?', [req.params.id], (err, items) => {
    if (err) return res.status(500).json({ error: 'Database error' });
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
        db.get('SELECT user_id, start_time FROM shifts WHERE id = ?', [shift_id], (err, row) => err ? reject(err) : resolve(row));
      });
      if (!shift) return res.status(404).json({ error: 'Shift not found' });

      if (req.user.role !== 'admin') {
        const shiftDate = new Date(shift.start_time);
        const today = new Date();
        shiftDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        if (shiftDate > today) return res.status(403).json({ error: 'Нельзя создать отчёт для будущей смены' });
        if (shift.user_id !== req.user.id) return res.status(403).json({ error: 'You can only create reports for your own shifts' });
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
