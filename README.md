# Кинозал общежития — GitHub Pages + Supabase

Статический сайт на HTML/CSS/JavaScript. GitHub Pages публикует frontend, Supabase хранит бронирования и участников.

## 1. Создать Supabase

1. Создайте бесплатный проект в Supabase.
2. Откройте SQL Editor.
3. Выполните `supabase/schema.sql`.
4. В Authentication → Users создайте пользователя-администратора с email и паролем.
5. Скопируйте UUID пользователя.
6. В `supabase/schema.sql` замените UUID в последней INSERT-команде и выполните её отдельно.

## 2. Настроить сайт

Откройте `js/config.js` и вставьте:
- URL проекта Supabase;
- Publishable key (или legacy anon key).

Никогда не вставляйте `service_role`/secret key в этот файл.

## 3. Проверить локально

Из папки проекта:

```bash
python3 -m http.server 8000
```

Откройте `http://localhost:8000`.

## 4. Загрузить в GitHub

Создайте публичный репозиторий, например `cinema-dorm`.
Загрузите в него содержимое этой папки.

## 5. Включить GitHub Pages

GitHub → Repository → Settings → Pages → Build and deployment → Source:
`Deploy from a branch`.

Branch: `main`, folder: `/ (root)`.

После публикации адрес будет примерно:
`https://ВАШ-ЛОГИН.github.io/cinema-dorm/`

## Важно про безопасность

Это учебный/небольшой общежитский проект. Публичный frontend использует Supabase publishable/anon key, который допустимо находиться в браузере при правильно настроенных RLS policies. Secret/service_role key никогда не помещайте в JavaScript.

## Автоматическое удаление старых бронирований

В проекте предусмотрена очистка через Supabase Cron. После включения `pg_cron` в Supabase блок в `supabase/schema.sql` создаёт функцию `cleanup_old_bookings()` и задачу `cinema-cleanup-old-bookings`, которая запускается каждый час и удаляет бронирования, закончившиеся более 24 часов назад. Участники удаляются автоматически через `ON DELETE CASCADE`.

Если Supabase не разрешит создать Cron из SQL, включите Cron в Dashboard: Integrations → Cron, затем создайте job с расписанием `0 * * * *` и SQL `select public.cleanup_old_bookings()`.

На главной странице прошедшие сеансы сразу скрываются, даже до физического удаления из БД.

## Форматы

- дата: `24.09.2026`
- время: `18:00–21:30`
- интерфейс: русский
- адаптивный дизайн для телефона
