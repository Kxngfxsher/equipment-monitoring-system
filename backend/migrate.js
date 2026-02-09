// Миграция БД для добавления колонки description в таблицу users
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./equipment_monitoring.db');

console.log('🔄 Начинаем миграцию базы данных...');

db.serialize(() => {
    // Проверяем существует ли колонка description
    db.all("PRAGMA table_info(users)", [], (err, columns) => {
        if (err) {
            console.error('❌ Ошибка проверки структуры таблицы:', err);
            return;
        }
        
        const hasDescription = columns.some(col => col.name === 'description');
        
        if (hasDescription) {
            console.log('✅ Колонка description уже существует');
            db.close();
            return;
        }
        
        console.log('➕ Добавляем колонку description...');
        
        db.run('ALTER TABLE users ADD COLUMN description TEXT', (err) => {
            if (err) {
                console.error('❌ Ошибка добавления колонки:', err);
            } else {
                console.log('✅ Колонка description успешно добавлена!');
                console.log('✅ Миграция завершена!');
            }
            db.close();
        });
    });
});
