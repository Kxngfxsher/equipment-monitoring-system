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

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directories
const uploadsDir = path.join(__dirname, 'uploads');
const photosDir = path.join(__dirname, 'uploads/photos');
const tasksDir = path.join(__dirname, 'uploads/tasks');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });

// Статические папки для медиа-файлов (ИСПРАВЛЕНО - без аутентификации)
app.use('/api/photos', express.static(photosDir, {
  setHeaders: (res, filePath) => {
    res.set('Cache-Control', 'public, max-age=86400');
  }
}));
app.use('/api/audio', express.static(uploadsDir, {
  setHeaders: (res, filePath) => {
    res.set('Cache-Control', 'public, max-age=86400');
  }
}));

// Frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Multer configurations
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'audio-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, photosDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'photo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const taskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tasksDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'task-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const audioUpload = multer({ storage: audioStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const photoUpload = multer({ storage: photoStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const taskUpload = multer({ storage: taskStorage, limits: { fileSize: 50 * 1024 * 1024 } });

const reportUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'audio') cb(null, uploadsDir);
      else if (file.fieldname === 'photos') cb(null, photosDir);
      else cb(new Error('Invalid field'));
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const prefix = file.fieldname === 'audio' ? 'audio-' : 'photo-';
      cb(null, prefix + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audio' && file.mimetype.startsWith('audio/')) cb(null, true);
    else if (file.fieldname === 'photos' && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Invalid file type'));
  }
}).fields([{ name: 'audio', maxCount: 1 }, { name: 'photos', maxCount: 5 }]);

// Database
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
      id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      equipment_id TEXT, status TEXT NOT NULL, description TEXT, audio_file TEXT, photo_files TEXT,
      priority TEXT DEFAULT 'normal', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS shift_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER NOT NULL, title TEXT NOT NULL,
      description TEXT, priority TEXT DEFAULT 'normal', status TEXT DEFAULT 'pending', created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE, FOREIGN KEY (created_by) REFERENCES users(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS task_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, file_name TEXT NOT NULL,
      file_path TEXT NOT NULL, file_type TEXT, file_size INTEGER, uploaded_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES shift_tasks(id) ON DELETE CASCADE, FOREIGN KEY (uploaded_by) REFERENCES users(id)
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

// ===== AUTH =====
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

// ===== USERS =====
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

// ===== EQUIPMENT =====
app.get('/api/equipment', authenticateToken, (req, res) => {
  db.all('SELECT * FROM equipment ORDER BY created_at DESC', [], (err, rows) => {
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

// ===== SHIFTS =====
app.get('/api/shifts', authenticateToken, (req, res) => {
  let query = req.user.role === 'admin'
    ? `SELECT s.*, u.username, u.first_name, u.last_name, u.full_name, 
       (SELECT COUNT(*) FROM reports WHERE shift_id = s.id) as has_report 
       FROM shifts s JOIN users u ON s.user_id = u.id ORDER BY s.start_time DESC`
    : `SELECT s.*, u.username, u.first_name, u.last_name, u.full_name,
       (SELECT COUNT(*) FROM reports WHERE shift_id = s.id) as has_report
       FROM shifts s JOIN users u ON s.user_id = u.id WHERE s.user_id = ? ORDER BY s.start_time DESC`;
  let params = req.user.role === 'admin' ? [] : [req.user.id];
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.get('/api/shifts/:id', authenticateToken, (req, res) => {
  db.get(`SELECT s.*, u.username, u.first_name, u.last_name, u.full_name FROM shifts s 
          JOIN users u ON s.user_id = u.id WHERE s.id = ?`, [req.params.id], (err, row) => {
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
  db.all('SELECT audio_file, photo_files FROM reports WHERE shift_id = ?', [req.params.id], (err, reports) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    
    db.run('DELETE FROM shifts WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: 'Failed to delete shift' });
      
      reports.forEach(report => {
        if (report.audio_file) {
          const audioPath = path.join(uploadsDir, report.audio_file);
          if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        }
        if (report.photo_files) {
          try {
            const photos = JSON.parse(report.photo_files);
            photos.forEach(photo => {
              const photoPath = path.join(photosDir, photo);
              if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
            });
          } catch (e) { console.error('Error deleting photos:', e); }
        }
      });
      
      res.json({ message: 'Shift deleted successfully' });
    });
  });
});

// ===== REPORTS =====
app.get('/api/shifts/:id/report', authenticateToken, (req, res) => {
  db.get(`SELECT r.*, u.username, u.first_name, u.last_name, u.full_name,
          e.name as equipment_name, e.type as equipment_type, e.location as equipment_location
          FROM reports r JOIN users u ON r.user_id = u.id
          LEFT JOIN equipment e ON r.equipment_id = e.equipment_id
          WHERE r.shift_id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Report not found' });
    if (row.photo_files) {
      try {
        row.photo_files = JSON.parse(row.photo_files);
      } catch (e) {
        row.photo_files = [];
      }
    }
    res.json(row);
  });
});

app.post('/api/reports/media', authenticateToken, reportUpload, (req, res) => {
  const { shift_id, equipment_id, status, description, priority } = req.body;
  if (!shift_id) return res.status(400).json({ error: 'shift_id is required' });

  db.get('SELECT id FROM reports WHERE shift_id = ?', [shift_id], (err, existing) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (existing) return res.status(400).json({ error: 'Report already exists for this shift' });

    db.get('SELECT user_id FROM shifts WHERE id = ?', [shift_id], (err, shift) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!shift) return res.status(404).json({ error: 'Shift not found' });
      if (req.user.role !== 'admin' && shift.user_id !== req.user.id) {
        return res.status(403).json({ error: 'You can only create reports for your own shifts' });
      }

      const audioFile = req.files?.audio?.[0]?.filename || null;
      const photoFiles = req.files?.photos?.map(f => f.filename) || [];
      const photoFilesJson = JSON.stringify(photoFiles);

      db.run('INSERT INTO reports (shift_id, user_id, equipment_id, status, description, audio_file, photo_files, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [shift_id, req.user.id, equipment_id, status, description, audioFile, photoFilesJson, priority || 'normal'],
        function(err) {
          if (err) return res.status(500).json({ error: 'Failed to create report' });
          res.json({ id: this.lastID, message: 'Report created successfully', audio_file: audioFile, photo_files: photoFiles });
        });
    });
  });
});

app.put('/api/reports/:id', authenticateToken, isAdmin, (req, res) => {
  const { equipment_id, status, description, priority } = req.body;
  db.run('UPDATE reports SET equipment_id = ?, status = ?, description = ?, priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [equipment_id, status, description, priority, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to update report' });
      res.json({ message: 'Report updated successfully' });
    });
});

app.delete('/api/reports/:id', authenticateToken, isAdmin, (req, res) => {
  db.get('SELECT audio_file, photo_files FROM reports WHERE id = ?', [req.params.id], (err, report) => {
    if (err || !report) return res.status(404).json({ error: 'Report not found' });
    
    db.run('DELETE FROM reports WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: 'Failed to delete report' });
      
      if (report.audio_file) {
        const audioPath = path.join(uploadsDir, report.audio_file);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      }
      if (report.photo_files) {
        try {
          const photos = JSON.parse(report.photo_files);
          photos.forEach(photo => {
            const photoPath = path.join(photosDir, photo);
            if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
          });
        } catch (e) { console.error('Error deleting photos:', e); }
      }
      res.json({ message: 'Report deleted successfully' });
    });
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/login.html')));

app.listen(PORT, () => {
  console.log(`\n===========================================`);
  console.log(`  Server v1.1.2 is running`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Photos: /api/photos/*`);
  console.log(`  Audio: /api/audio/*`);
  console.log(`===========================================\n`);
});

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error('Error closing database:', err.message);
    console.log('Database connection closed.');
    process.exit(0);
  });
});
