// Миграция v1.1.3: Создание таблицы equipment_reports для множественных записей оборудования в отчёте
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./equipment_monitoring.db');

console.log('🔄 Начинаем миграцию v1.1.3...');

db.serialize(() => {
    // Проверяем существует ли таблица equipment_reports
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='equipment_reports'", [], (err, row) => {
        if (err) {
            console.error('❌ Ошибка проверки таблицы:', err);
            db.close();
            return;
        }
        
        if (row) {
            console.log('✅ Таблица equipment_reports уже существует');
            db.close();
            return;
        }
        
        console.log('➕ Создаём таблицу equipment_reports...');
        
        // Создаём новую таблицу для записей оборудования в отчётах
        db.run(`CREATE TABLE equipment_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            equipment_id TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('working', 'faulty', 'maintenance')),
            description TEXT,
            photo_files TEXT,
            audio_file TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
            FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id) ON DELETE CASCADE
        )`, (err) => {
            if (err) {
                console.error('❌ Ошибка создания таблицы:', err);
                db.close();
                return;
            }
            
            console.log('✅ Таблица equipment_reports создана!');
            
            // Мигрируем данные из старой структуры reports в новую equipment_reports
            console.log('🔄 Мигрируем старые отчёты...');
            
            db.all('SELECT * FROM reports WHERE equipment_id IS NOT NULL', [], (err, oldReports) => {
                if (err) {
                    console.error('❌ Ошибка чтения старых отчётов:', err);
                    db.close();
                    return;
                }
                
                if (oldReports.length === 0) {
                    console.log('ℹ️  Нет старых отчётов для миграции');
                    console.log('✅ Миграция v1.1.3 завершена!');
                    db.close();
                    return;
                }
                
                let migrated = 0;
                const total = oldReports.length;
                
                oldReports.forEach((report, index) => {
                    db.run(`INSERT INTO equipment_reports 
                            (report_id, equipment_id, status, description, photo_files, audio_file) 
                            VALUES (?, ?, ?, ?, ?, ?)`,
                        [report.id, report.equipment_id, report.status, report.description, 
                         report.photo_files, report.audio_file],
                        (err) => {
                            if (err) {
                                console.error(`❌ Ошибка миграции отчёта ${report.id}:`, err);
                            } else {
                                migrated++;
                            }
                            
                            // Последний отчёт
                            if (index === total - 1) {
                                console.log(`✅ Мигрировано отчётов: ${migrated}/${total}`);
                                console.log('✅ Миграция v1.1.3 завершена!');
                                console.log('');
                                console.log('⚠️  ВАЖНО: Теперь можно удалить колонки из reports:');
                                console.log('   - equipment_id');
                                console.log('   - photo_files');
                                console.log('   - audio_file');
                                console.log('');
                                console.log('   Но это необязательно - они просто не будут использоваться');
                                db.close();
                            }
                        }
                    );
                });
            });
        });
    });
});
