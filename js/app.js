const db = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const state = { date: localDateString(new Date()), sessions: [], selectedSession: null };

const $ = (id) => document.getElementById(id);

function localDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fmtDate(iso) {
  return new Intl.DateTimeFormat('ru-RU', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }).format(new Date(`${iso}T12:00:00`));
}
function fmtTime(t) { return t.slice(0,5); }
function escapeHtml(s='') {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function setStatus(text='', type='') {
  const el = $('status'); el.textContent = text; el.className = `status ${type}`;
}
function isToday() { return state.date === localDateString(new Date()); }

async function cleanupExpired() {
  // Удаление старше 24 часов выполняется запросом из браузера при посещении сайта.
  // Это не фоновой серверный процесс, но для GitHub Pages этого достаточно.
  const cutoff = new Date(Date.now() - 24*60*60*1000).toISOString();
  await db.from('bookings').delete().lt('end_at', cutoff);
}

async function loadSchedule() {
  setStatus('Загрузка…');
  await cleanupExpired();

  const { data, error } = await db
    .from('bookings')
    .select('*, participants(id, name)')
    .eq('booking_date', state.date)
    .order('start_time', { ascending:true });

  if (error) { setStatus('Не удалось загрузить расписание: ' + error.message, 'error'); return; }
  state.sessions = data || [];
  renderSchedule();
  setStatus('');
}

function sessionState(s) {
  const start = new Date(s.start_at);
  const end = new Date(s.end_at);
  const now = new Date();
  if (now >= start && now < end) return 'now';
  return now >= end ? 'finished' : 'future';
}

function renderSchedule() {
  $('currentDate').textContent = fmtDate(state.date);
  $('dateHint').textContent = isToday() ? 'Сегодня' : 'Выбранная дата';

  const visible = state.sessions.filter(s => sessionState(s) !== 'finished');
  if (!visible.length) {
    $('schedule').innerHTML = `<div class="empty">На эту дату пока нет бронирований.<br><br>Зал свободен — можно создать сеанс.</div>`;
    return;
  }

  $('schedule').innerHTML = visible.map(s => {
    const now = sessionState(s) === 'now';
    const open = s.type === 'open';
    const count = s.participants?.length || 0;
    const full = open && count >= s.capacity;
    return `
      <article class="session ${open ? 'open' : 'closed'} ${now ? 'now' : ''}">
        <div class="session-top">
          <div>
            <span class="badge ${open ? 'open':'closed'}">${open ? '🟢 Открытый' : '🔴 Закрытый'}</span>
            ${now ? '<span class="badge now">Сейчас идёт</span>' : ''}
            ${open ? `<div class="movie">${escapeHtml(s.movie_title || 'Без названия')}</div>` : '<div class="movie">Зал занят</div>'}
            ${open && s.description ? `<p class="session-desc">${escapeHtml(s.description)}</p>` : ''}
          </div>
          <div class="time">${fmtTime(s.start_time)}–${fmtTime(s.end_time)}</div>
        </div>
        <div class="session-footer">
          <div class="people">${open ? `👥 ${count} / ${s.capacity} · организатор: ${escapeHtml(s.organizer)}` : `🔒 Зал занят · ${escapeHtml(s.organizer)}`}</div>
          ${open ? `<div class="actions"><button class="secondary" data-view="${s.id}">Подробнее</button>${full || now ? '' : `<button class="primary" data-join="${s.id}">Записаться</button>`}</div>` : ''}
        </div>
      </article>`;
  }).join('');

  document.querySelectorAll('[data-join]').forEach(b => b.onclick = () => openJoin(b.dataset.join));
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openJoin(b.dataset.view, true));
}

function openBooking() {
  $('bookingDate').value = state.date;
  $('bookingError').textContent = '';
  $('bookingModal').classList.remove('hidden');
}
function closeModal(id) { $(id).classList.add('hidden'); }
function openJoin(id, readonly=false) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;
  state.selectedSession = s;
  $('joinInfo').innerHTML = `<strong>${escapeHtml(s.movie_title || 'Открытый сеанс')}</strong><br>${fmtDate(s.booking_date)} · ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}<br>👥 ${s.participants?.length || 0} / ${s.capacity}`;
  $('joinError').textContent = '';
  $('participantName').value = '';
  $('participantName').disabled = readonly;
  $('joinForm button').disabled = readonly;
  $('joinModal').classList.remove('hidden');
}

async function createBooking(e) {
  e.preventDefault();
  const type = document.querySelector('input[name="type"]:checked').value;
  const date = $('bookingDate').value, start = $('startTime').value, end = $('endTime').value;
  const title = $('movieTitle').value.trim(), description = $('description').value.trim();
  const capacity = Number($('capacity').value), organizer = $('organizer').value.trim();
  $('bookingError').textContent = '';

  if (end <= start) return $('bookingError').textContent = 'Время окончания должно быть позже начала.';
  if (type === 'open' && !title) return $('bookingError').textContent = 'Для открытого сеанса укажите фильм.';

  const startAt = `${date}T${start}:00`;
  let endDate = date;
  if (end < start) endDate = localDateString(new Date(new Date(`${date}T${start}:00`).getTime()+86400000));
  const endAt = `${endDate}T${end}:00`;

  const { data: conflict } = await db.from('bookings').select('id').lt('start_at', endAt).gt('end_at', startAt).limit(1);
  if (conflict?.length) return $('bookingError').textContent = 'Это время уже занято. Выберите другой промежуток.';

  const { error } = await db.from('bookings').insert({
    booking_date: date, start_time: start, end_time: end, start_at: startAt, end_at: endAt,
    type, movie_title: type === 'open' ? title : null, description: type === 'open' ? description : null,
    capacity: type === 'open' ? capacity : 0, organizer
  });
  if (error) return $('bookingError').textContent = error.message;

  closeModal('bookingModal');
  await loadSchedule();
}

async function joinSession(e) {
  e.preventDefault();
  const s = state.selectedSession;
  const name = $('participantName').value.trim();
  if (!s || !name) return;
  $('joinError').textContent = '';
  if ((s.participants?.length || 0) >= s.capacity) return $('joinError').textContent = 'Свободных мест больше нет.';

  const { error } = await db.from('participants').insert({ booking_id:s.id, name });
  if (error) return $('joinError').textContent = error.message;

  closeModal('joinModal');
  await loadSchedule();
}

document.addEventListener('DOMContentLoaded', () => {
  $('currentDate').textContent = fmtDate(state.date);
  $('prevDay').onclick = () => { const d=new Date(`${state.date}T12:00:00`); d.setDate(d.getDate()-1); state.date=localDateString(d); loadSchedule(); };
  $('nextDay').onclick = () => { const d=new Date(`${state.date}T12:00:00`); d.setDate(d.getDate()+1); state.date=localDateString(d); loadSchedule(); };
  $('todayBtn').onclick = () => { state.date=localDateString(new Date()); loadSchedule(); };
  $('openBooking').onclick = openBooking;
  $('closeBooking').onclick = () => closeModal('bookingModal');
  $('closeJoin').onclick = () => closeModal('joinModal');
  $('bookingForm').onsubmit = createBooking;
  $('joinForm').onsubmit = joinSession;
  document.querySelectorAll('input[name="type"]').forEach(r => r.onchange = () => $('openFields').classList.toggle('hidden', r.value !== 'open' || !r.checked));
  loadSchedule();
});
