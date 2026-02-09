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

// Create uploads directories if not exist
const uploadsDir = path.join(__dirname, 'uploads');
const tasksDir = path.join(__dirname, 'uploads/tasks');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
if (!fs.existsSync(tasksDir)) {
  fs.mkdirSync(tasksDir, { recursive: true });
}

// Multer configuration for audio files
const audioStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'audio-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const audioUpload = multer({ 
  storage: audioStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Multer configuration for task files
const taskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tasksDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'task-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const taskUpload = multer({ 
  storage: taskStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
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
      first_name TEXT,
      last_name TEXT,
      full_name TEXT,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Shifts table
    db.run(`CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      description TEXT,
      location TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Equipment table
    db.run(`CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT,
      location TEXT,
      status TEXT DEFAULT 'working' CHECK(status IN ('working', 'faulty', 'maintenance', 'retired')),
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Reports table (linked to shifts)
    db.run(`CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      equipment_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('working', 'faulty', 'maintenance')),
      description TEXT,
      audio_file TEXT,
      priority TEXT DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Shift tasks table
    db.run(`CREATE TABLE IF NOT EXISTS shift_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'pending',
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // Task files table
    db.run(`CREATE TABLE IF NOT EXISTS task_files (
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
    )`);

    // Create default admin user
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, first_name, last_name, full_name) 
            VALUES ('admin', ?, 'admin', 'Администратор', 'Системы', 'Администратор Системы')`, [hashedPassword]);
    
    // Create test engineer
    const engPassword = bcrypt.hashSync('eng123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, first_name, last_name, full_name) 
            VALUES ('engineer1', ?, 'engineer', 'Тест', 'Инженер', 'Тест Инженер')`, [engPassword]);
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

// ===== AUTH ROUTES =====

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
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role, 
          first_name: user.first_name,
          last_name: user.last_name,
          full_name: user.full_name 
        }
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get('SELECT id, username, role, first_name, last_name, full_name FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(user);
  });
});

// ===== USER MANAGEMENT (ADMIN) =====

// Get all users
app.get('/api/users', authenticateToken, isAdmin, (req, res) => {
  db.all('SELECT id, username, role, first_name, last_name, full_name, email, created_at FROM users', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create user
app.post('/api/users', authenticateToken, isAdmin, (req, res) => {
  const { username, password, role, first_name, last_name, email } = req.body;
  const full_name = `${first_name || ''} ${last_name || ''}`.trim();
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    'INSERT INTO users (username, password, role, first_name, last_name, full_name, email) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [username, hashedPassword, role, first_name, last_name, full_name, email],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create user' });
      }
      res.json({ id: this.lastID, message: 'User created successfully' });
    }
  );
});

// Update user
app.put('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
  const { username, role, first_name, last_name, email } = req.body;
  const { id } = req.params;
  const full_name = `${first_name || ''} ${last_name || ''}`.trim();

  db.run(
    'UPDATE users SET username = ?, role = ?, first_name = ?, last_name = ?, full_name = ?, email = ? WHERE id = ?',
    [username, role, first_name, last_name, full_name, email, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update user' });
      }
      res.json({ message: 'User updated successfully' });
    }
  );
});

// Delete user
app.delete('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete user' });
    }
    res.json({ message: 'User deleted successfully' });
  });
});

// ===== EQUIPMENT MANAGEMENT =====

// Get all equipment
app.get('/api/equipment', authenticateToken, (req, res) => {
  db.all('SELECT * FROM equipment ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create equipment (admin only)
app.post('/api/equipment', authenticateToken, isAdmin, (req, res) => {
  const { equipment_id, name, type, location, status, description } = req.body;

  db.run(
    'INSERT INTO equipment (equipment_id, name, type, location, status, description) VALUES (?, ?, ?, ?, ?, ?)',
    [equipment_id, name, type, location, status || 'working', description],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create equipment' });
      }
      res.json({ id: this.lastID, message: 'Equipment created successfully' });
    }
  );
});

// Update equipment (admin only)
app.put('/api/equipment/:id', authenticateToken, isAdmin, (req, res) => {
  const { equipment_id, name, type, location, status, description } = req.body;
  const { id } = req.params;

  db.run(
    'UPDATE equipment SET equipment_id = ?, name = ?, type = ?, location = ?, status = ?, description = ? WHERE id = ?',
    [equipment_id, name, type, location, status, description, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update equipment' });
      }
      res.json({ message: 'Equipment updated successfully' });
    }
  );
});

// Delete equipment (admin only)
app.delete('/api/equipment/:id', authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM equipment WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete equipment' });
    }
    res.json({ message: 'Equipment deleted successfully' });
  });
});

// ===== SHIFTS =====

// Get all shifts
app.get('/api/shifts', authenticateToken, (req, res) => {
  let query;
  let params = [];

  if (req.user.role === 'admin') {
    query = `SELECT s.*, u.username, u.first_name, u.last_name, u.full_name 
             FROM shifts s 
             JOIN users u ON s.user_id = u.id 
             ORDER BY s.start_time DESC`;
  } else {
    query = `SELECT s.*, u.username, u.first_name, u.last_name, u.full_name 
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

// Get shift by ID
app.get('/api/shifts/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get(
    `SELECT s.*, u.username, u.first_name, u.last_name, u.full_name 
     FROM shifts s 
     JOIN users u ON s.user_id = u.id 
     WHERE s.id = ?`,
    [id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!row) {
        return res.status(404).json({ error: 'Shift not found' });
      }
      res.json(row);
    }
  );
});

// Create shift (admin only)
app.post('/api/shifts', authenticateToken, isAdmin, (req, res) => {
  const { user_id, start_time, end_time, description, location } = req.body;

  db.run(
    'INSERT INTO shifts (user_id, start_time, end_time, description, location) VALUES (?, ?, ?, ?, ?)',
    [user_id, start_time, end_time, description, location],
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
  const { user_id, start_time, end_time, description, location } = req.body;
  const { id } = req.params;

  db.run(
    'UPDATE shifts SET user_id = ?, start_time = ?, end_time = ?, description = ?, location = ? WHERE id = ?',
    [user_id, start_time, end_time, description, location, id],
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

// ===== SHIFT TASKS =====

// Get tasks for a shift
app.get('/api/shifts/:id/tasks', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.all(
    `SELECT t.*, u.username as creator_name 
     FROM shift_tasks t 
     JOIN users u ON t.created_by = u.id 
     WHERE t.shift_id = ? 
     ORDER BY t.created_at DESC`,
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    }
  );
});

// Create task for shift (admin only)
app.post('/api/shifts/:id/tasks', authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;
  const { title, description, priority } = req.body;

  db.run(
    'INSERT INTO shift_tasks (shift_id, title, description, priority, created_by) VALUES (?, ?, ?, ?, ?)',
    [id, title, description, priority || 'normal', req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create task' });
      }
      res.json({ id: this.lastID, message: 'Task created successfully' });
    }
  );
});

// Update task
app.put('/api/tasks/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { title, description, priority, status } = req.body;

  db.run(
    'UPDATE shift_tasks SET title = ?, description = ?, priority = ?, status = ? WHERE id = ?',
    [title, description, priority, status, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update task' });
      }
      res.json({ message: 'Task updated successfully' });
    }
  );
});

// Delete task (admin only)
app.delete('/api/tasks/:id', authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM shift_tasks WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete task' });
    }
    res.json({ message: 'Task deleted successfully' });
  });
});

// ===== TASK FILES =====

// Get files for a task
app.get('/api/tasks/:id/files', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.all(
    `SELECT f.*, u.username as uploader_name 
     FROM task_files f 
     JOIN users u ON f.uploaded_by = u.id 
     WHERE f.task_id = ? 
     ORDER BY f.created_at DESC`,
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    }
  );
});

// Upload file to task
app.post('/api/tasks/:id/files', authenticateToken, taskUpload.single('file'), (req, res) => {
  const { id } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  db.run(
    'INSERT INTO task_files (task_id, file_name, file_path, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    [id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to save file info' });
      }
      res.json({ 
        id: this.lastID, 
        message: 'File uploaded successfully',
        file: {
          name: req.file.originalname,
          size: req.file.size,
          type: req.file.mimetype
        }
      });
    }
  );
});

// Download task file
app.get('/api/files/:filename', authenticateToken, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(tasksDir, filename);

  db.get('SELECT * FROM task_files WHERE file_path = ?', [filename], (err, file) => {
    if (err || !file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (fs.existsSync(filePath)) {
      res.download(filePath, file.file_name);
    } else {
      res.status(404).json({ error: 'File not found on server' });
    }
  });
});

// Delete file (admin only)
app.delete('/api/files/:id', authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM task_files WHERE id = ?', [id], (err, file) => {
    if (err || !file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(tasksDir, file.file_path);
    
    // Delete from database
    db.run('DELETE FROM task_files WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete file' });
      }

      // Delete physical file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.json({ message: 'File deleted successfully' });
    });
  });
});

// ===== REPORTS =====

// Get reports
app.get('/api/reports', authenticateToken, (req, res) => {
  let query;
  let params = [];

  if (req.user.role === 'admin') {
    query = `SELECT r.*, u.username, u.first_name, u.last_name, u.full_name, s.start_time as shift_start 
             FROM reports r 
             JOIN users u ON r.user_id = u.id 
             JOIN shifts s ON r.shift_id = s.id 
             ORDER BY r.created_at DESC`;
  } else {
    query = `SELECT r.*, u.username, u.first_name, u.last_name, u.full_name, s.start_time as shift_start 
             FROM reports r 
             JOIN users u ON r.user_id = u.id 
             JOIN shifts s ON r.shift_id = s.id 
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

// Get single report (with full details)
app.get('/api/reports/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get(
    `SELECT r.*, u.username, u.first_name, u.last_name, u.full_name, 
            s.start_time as shift_start, s.end_time as shift_end, s.description as shift_description,
            e.name as equipment_name, e.type as equipment_type, e.location as equipment_location
     FROM reports r 
     JOIN users u ON r.user_id = u.id 
     JOIN shifts s ON r.shift_id = s.id 
     LEFT JOIN equipment e ON r.equipment_id = e.equipment_id 
     WHERE r.id = ?`,
    [id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!row) {
        return res.status(404).json({ error: 'Report not found' });
      }
      res.json(row);
    }
  );
});

// Create text report (requires shift_id)
app.post('/api/reports', authenticateToken, (req, res) => {
  const { shift_id, equipment_id, status, description, priority } = req.body;

  if (!shift_id) {
    return res.status(400).json({ error: 'shift_id is required' });
  }

  db.run(
    'INSERT INTO reports (shift_id, user_id, equipment_id, status, description, priority) VALUES (?, ?, ?, ?, ?, ?)',
    [shift_id, req.user.id, equipment_id, status, description, priority || 'normal'],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create report' });
      }
      res.json({ id: this.lastID, message: 'Report created successfully' });
    }
  );
});

// Upload audio report (requires shift_id)
app.post('/api/reports/audio', authenticateToken, audioUpload.single('audio'), (req, res) => {
  const { shift_id, equipment_id, status, description, priority } = req.body;
  const audioFile = req.file ? req.file.filename : null;

  if (!shift_id) {
    return res.status(400).json({ error: 'shift_id is required' });
  }

  db.run(
    'INSERT INTO reports (shift_id, user_id, equipment_id, status, description, audio_file, priority) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [shift_id, req.user.id, equipment_id, status, description, audioFile, priority || 'normal'],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create audio report' });
      }
      res.json({ 
        id: this.lastID, 
        message: 'Audio report created successfully', 
        audio_file: audioFile 
      });
    }
  );
});

// Get audio file
app.get('/api/audio/:filename', authenticateToken, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadsDir, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Audio file not found' });
  }
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
