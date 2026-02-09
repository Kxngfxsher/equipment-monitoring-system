# Инструкции для v1.1.3 - ЧТО ИЗМЕНИТЬ В server.js

## ⚠️ ЭТО БОЛЬШОЕ ОБНОВЛЕНИЕ!

Из-за размера файла я не могу загрузить весь server.js сразу.
Вот ЧТО НУЖНО ДОБАВИТЬ в текущий server.js:

---

## 1️⃣ ДОБАВИТЬ ТАБЛИЦУ equipment_reports в initDatabase()

В функцию `initDatabase()` после создания таблицы `reports` добавьте:

```javascript
// ДОБАВИТЬ ЭТО ПОСЛЕ CREATE TABLE reports:
db.run(`CREATE TABLE IF NOT EXISTS equipment_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  equipment_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('working', 'faulty', 'maintenance')),
  description TEXT,
  photo_files TEXT,
  audio_file TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id)
)`);
```

---

## 2️⃣ ДОБАВИТЬ ENDPOINT: Получить последние статусы оборудования

Добавьте ЭТО ПОСЛЕ строки `app.get('/api/equipment', ...):`

```javascript
// Получить последние статусы всего оборудования
app.get('/api/equipment/latest-status', authenticateToken, (req, res) => {
  db.all(`
    SELECT 
      e.equipment_id,
      e.name,
      e.type,
      e.location,
      COALESCE(
        (SELECT er.status FROM equipment_reports er 
         WHERE er.equipment_id = e.equipment_id 
         ORDER BY er.created_at DESC LIMIT 1),
        'working'
      ) as last_status,
      COALESCE(
        (SELECT er.description FROM equipment_reports er 
         WHERE er.equipment_id = e.equipment_id 
         ORDER BY er.created_at DESC LIMIT 1),
        ''
      ) as last_description
    FROM equipment e
    ORDER BY e.created_at ASC
  `, [], (err, rows) => {
    if (err) {
      console.error('Error fetching equipment status:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});
```

---

## 3️⃣ ДОБАВИТЬ ENDPOINT: Создать отчёт v2 (со всем оборудованием)

Добавьте ЭТО ПОСЛЕ строки `app.post('/api/reports/media', ...):`

```javascript
// v1.1.3: Создать отчёт со всем оборудованием
app.post('/api/reports/v2/create', authenticateToken, (req, res) => {
  const uploadAny = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        if (file.fieldname.startsWith('audio_')) cb(null, uploadsDir);
        else if (file.fieldname.startsWith('photos_')) cb(null, photosDir);
        else cb(new Error('Invalid field'));
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const prefix = file.fieldname.startsWith('audio_') ? 'audio-' : 'photo-';
        cb(null, prefix + uniqueSuffix + path.extname(file.originalname));
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
  }).any();

  uploadAny(req, res, async (err) => {
    if (err) return res.status(400).json({ error: 'Upload error: ' + err.message });

    try {
      const { shift_id, equipment_items } = req.body;
      
      if (!shift_id) return res.status(400).json({ error: 'shift_id is required' });
      if (!equipment_items) return res.status(400).json({ error: 'equipment_items is required' });

      // Проверка существования отчёта
      const existing = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM reports WHERE shift_id = ?', [shift_id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (existing) return res.status(400).json({ error: 'Report already exists for this shift' });

      // Проверка смены
      const shift = await new Promise((resolve, reject) => {
        db.get('SELECT user_id, start_time FROM shifts WHERE id = ?', [shift_id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!shift) return res.status(404).json({ error: 'Shift not found' });

      // ПРОВЕРКА ДАТЫ: инженер может создать отчёт только если дата смены <= сегодня
      if (req.user.role !== 'admin') {
        const shiftDate = new Date(shift.start_time);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        shiftDate.setHours(0, 0, 0, 0);

        if (shiftDate > today) {
          return res.status(403).json({ error: 'Нельзя создать отчёт для будущей смены' });
        }

        if (shift.user_id !== req.user.id) {
          return res.status(403).json({ error: 'You can only create reports for your own shifts' });
        }
      }

      // Парсим данные оборудования
      const items = JSON.parse(equipment_items);

      // Создаём главный отчёт
      const reportId = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO reports (shift_id, user_id, priority) VALUES (?, ?, ?)',
          [shift_id, req.user.id, 'normal'],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      // Обработка файлов по оборудованию
      const filesByEquipment = {};
      if (req.files) {
        req.files.forEach(file => {
          const match = file.fieldname.match(/^(photos|audio)_(.+)$/);
          if (match) {
            const [, type, equipmentId] = match;
            if (!filesByEquipment[equipmentId]) {
              filesByEquipment[equipmentId] = { photos: [], audio: null };
            }
            if (type === 'photos') {
              filesByEquipment[equipmentId].photos.push(file.filename);
            } else if (type === 'audio') {
              filesByEquipment[equipmentId].audio = file.filename;
            }
          }
        });
      }

      // Создаём записи для каждого оборудования
      const insertPromises = items.map(item => {
        const files = filesByEquipment[item.equipment_id] || { photos: [], audio: null };
        const photosJson = JSON.stringify(files.photos);

        return new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO equipment_reports (report_id, equipment_id, status, description, photo_files, audio_file) VALUES (?, ?, ?, ?, ?, ?)',
            [reportId, item.equipment_id, item.status, item.description || '', photosJson, files.audio],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });
      });

      await Promise.all(insertPromises);

      res.json({ 
        id: reportId, 
        message: 'Report created successfully',
        equipment_count: items.length
      });

    } catch (error) {
      console.error('Error creating report:', error);
      res.status(500).json({ error: 'Failed to create report: ' + error.message });
    }
  });
});
```

---

## 4️⃣ ДОБАВИТЬ ENDPOINT: Получить отчёт v2 (со всем оборудованием)

Добавьте ЭТО ПОСЛЕ строки `app.get('/api/shifts/:id/report', ...):`

```javascript
// v1.1.3: Получить отчёт со всем оборудованием
app.get('/api/shifts/:id/report/v2', authenticateToken, (req, res) => {
  // Получаем основной отчёт
  db.get(
    'SELECT r.*, u.username, u.first_name, u.last_name, u.full_name FROM reports r JOIN users u ON r.user_id = u.id WHERE r.shift_id = ?',
    [req.params.id],
    (err, report) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!report) return res.status(404).json({ error: 'Report not found' });

      // Получаем все записи оборудования
      db.all(
        `SELECT er.*, e.name, e.type, e.location 
         FROM equipment_reports er 
         JOIN equipment e ON er.equipment_id = e.equipment_id 
         WHERE er.report_id = ? 
         ORDER BY e.created_at ASC`,
        [report.id],
        (err, equipmentItems) => {
          if (err) return res.status(500).json({ error: 'Database error' });

          // Парсим фото для каждого оборудования
          equipmentItems = equipmentItems.map(item => {
            try {
              item.photo_files = JSON.parse(item.photo_files || '[]');
            } catch (e) {
              item.photo_files = [];
            }
            return item;
          });

          res.json({
            report_id: report.id,
            shift_id: report.shift_id,
            user: {
              id: report.user_id,
              username: report.username,
              first_name: report.first_name,
              last_name: report.last_name,
              full_name: report.full_name
            },
            priority: report.priority,
            created_at: report.created_at,
            equipment_items: equipmentItems
          });
        }
      );
    }
  );
});
```

---

## 5️⃣ ИЗМЕНИТЬ ВЕРСИЮ СЕРВЕРА

Найдите строку:
```javascript
console.log(`  Server v1.1.2 is running`);
```

Измените на:
```javascript
console.log(`  Server v1.1.3 is running`);
```

---

## ✅ ГОТОВО!

После добавления этих изменений:

1. Сохраните server.js
2. Перезапустите сервер: `node server.js`
3. Проверьте что написано `Server v1.1.3 is running`

**ДАЙТЕ МНЕ ЗНАТЬ КОГДА ДОБАВИТЕ - Я ПРОДОЛЖУ С FRONTEND!**
