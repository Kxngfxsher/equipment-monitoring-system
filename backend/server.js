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
app.use(express.static(path.join(__dirname, '../frontend')));

// Create uploads directory if not exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer configuration for audio files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'audio-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Database connection
const db = new sqlite3.Database('./equipment_monitoring.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initDatabase();
  }
});

// Initialize database tables
function initDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'engineer')),
      full_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Shifts table
    db.run(`CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Reports table
    db.run(`CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      equipment_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('working', 'faulty', 'maintenance')),
      description TEXT,
      audio_file TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Create default admin user if not exists
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, full_name) 
            VALUES ('admin', ?, 'admin', 'Administrator')`, [hashedPassword]);
    
    // Create test engineer
    const engPassword = bcrypt.hashSync('eng123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, full_name) 
            VALUES ('engineer1', ?, 'engineer', 'Test Engineer')`, [engPassword]);
  });
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// Check admin role
function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ===== ROUTES =====

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      res.json({ 
        token, 
        user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name }
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get('SELECT id, username, role, full_name FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(user);
  });
});

// ===== SHIFTS =====

// Get all shifts (admin) or user's shifts (engineer)
app.get('/api/shifts', authenticateToken, (req, res) => {
  let query;
  let params = [];

  if (req.user.role === 'admin') {
    query = `SELECT s.*, u.username, u.full_name 
             FROM shifts s 
             JOIN users u ON s.user_id = u.id 
             ORDER BY s.start_time DESC`;
  } else {
    query = `SELECT s.*, u.username, u.full_name 
             FROM shifts s 
             JOIN users u ON s.user_id = u.id 
             WHERE s.user_id = ? 
             ORDER BY s.start_time DESC`;
    params = [req.user.id];
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create shift (admin only)
app.post('/api/shifts', authenticateToken, isAdmin, (req, res) => {
  const { user_id, start_time, end_time, description } = req.body;

  db.run(
    'INSERT INTO shifts (user_id, start_time, end_time, description) VALUES (?, ?, ?, ?)',
    [user_id, start_time, end_time, description],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create shift' });
      }
      res.json({ id: this.lastID, message: 'Shift created successfully' });
    }
  );
});

// Update shift (admin only)
app.put('/api/shifts/:id', authenticateToken, isAdmin, (req, res) => {
  const { user_id, start_time, end_time, description } = req.body;
  const { id } = req.params;

  db.run(
    'UPDATE shifts SET user_id = ?, start_time = ?, end_time = ?, description = ? WHERE id = ?',
    [user_id, start_time, end_time, description, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update shift' });
      }
      res.json({ message: 'Shift updated successfully' });
    }
  );
});

// Delete shift (admin only)
app.delete('/api/shifts/:id', authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM shifts WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete shift' });
    }
    res.json({ message: 'Shift deleted successfully' });
  });
});

// ===== REPORTS =====

// Get reports
app.get('/api/reports', authenticateToken, (req, res) => {
  let query;
  let params = [];

  if (req.user.role === 'admin') {
    query = `SELECT r.*, u.username, u.full_name 
             FROM reports r 
             JOIN users u ON r.user_id = u.id 
             ORDER BY r.created_at DESC`;
  } else {
    query = `SELECT r.*, u.username, u.full_name 
             FROM reports r 
             JOIN users u ON r.user_id = u.id 
             WHERE r.user_id = ? 
             ORDER BY r.created_at DESC`;
    params = [req.user.id];
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create text report
app.post('/api/reports', authenticateToken, (req, res) => {
  const { equipment_id, status, description } = req.body;

  db.run(
    'INSERT INTO reports (user_id, equipment_id, status, description) VALUES (?, ?, ?, ?)',
    [req.user.id, equipment_id, status, description],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create report' });
      }
      res.json({ id: this.lastID, message: 'Report created successfully' });
    }
  );
});

// Upload audio report
app.post('/api/reports/audio', authenticateToken, upload.single('audio'), (req, res) => {
  const { equipment_id, status, description } = req.body;
  const audioFile = req.file ? req.file.filename : null;

  db.run(
    'INSERT INTO reports (user_id, equipment_id, status, description, audio_file) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, equipment_id, status, description, audioFile],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create audio report' });
      }
      res.json({ id: this.lastID, message: 'Audio report created successfully', audio_file: audioFile });
    }
  );
});

// Get all users (admin only)
app.get('/api/users', authenticateToken, isAdmin, (req, res) => {
  db.all('SELECT id, username, role, full_name, created_at FROM users', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});
