# Version History

## v1.1.0 - 2026-02-09

### Features
- ✅ Отчеты привязаны к сменам (один отчет на смену)
- ✅ Поддержка фотографий (до 5 шт) в отчетах
- ✅ Голосовые отчеты + фото в одном отчете
- ✅ Права доступа: инженер создает → только просмотр, админ → полный контроль
- ✅ Карточки смен с индикаторами (зеленая/желтая граница)
- ✅ Модальные окна для смен и отчетов
- ✅ Галерея фотографий с увеличением
- ✅ Аудио-плеер для прослушивания записей
- ✅ Управление оборудованием для админа

### Technical
- Backend: Node.js + Express + SQLite
- Frontend: Bootstrap 5 + Bootstrap Icons
- Photo storage: `/uploads/photos/`
- Audio storage: `/uploads/`
- Max photos: 5 per report
- Max photo size: 5MB each
- Max audio size: 10MB

### API Endpoints
- `GET /api/shifts/:id/report` - Get report by shift ID
- `POST /api/reports/media` - Create report with audio + photos
- `PUT /api/reports/:id` - Update report (admin only)
- `DELETE /api/reports/:id` - Delete report (admin only)
- `GET /api/photos/:filename` - Get photo
- `GET /api/audio/:filename` - Get audio

---

## v1.0.0 - 2026-02-08

### Initial Release
- Basic shift management
- User authentication
- Text reports
- Audio reports
