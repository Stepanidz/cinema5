const db = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);

function escapeHtml(s='') { return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function fmtDate(iso) { return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(`${iso}T12:00:00`)); }
function fmtTime(t) { return t.slice(0,5); }
function status(t='', type='') { $('adminStatus').textContent=t; $('adminStatus').className=`status ${type}`; }

async function checkAdmin() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) { $('authView').classList.remove('hidden'); $('panelView').classList.add('hidden'); return; }

  const { data: admin } = await db.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!admin) {
    await db.auth.signOut();
    $('loginError').textContent = 'Эта учётная запись не является администратором.';
    return;
  }
  $('authView').classList.add('hidden'); $('panelView').classList.remove('hidden');
  loadBookings();
}

async function loadBookings() {
  status('Загрузка…');
  const { data, error } = await db.from('bookings').select('*, participants(id,name)').order('start_at',{ascending:false}).limit(200);
  if (error) return status(error.message,'error');

  if (!data?.length) {
    $('adminList').innerHTML='<div class="empty">Бронирований нет.</div>'; status(''); return;
  }

  $('adminList').innerHTML = data.map(s => `
    <article class="session ${s.type==='open'?'open':'closed'}">
      <div class="session-top">
        <div>
          <span class="badge ${s.type==='open'?'open':'closed'}">${s.type==='open'?'🟢 Открытый':'🔴 Закрытый'}</span>
          <div class="movie">${s.type==='open'?escapeHtml(s.movie_title||'Без названия'):'Зал занят'}</div>
          <div class="people">${fmtDate(s.booking_date)} · ${fmtTime(s.start_time)}–${fmtTime(s.end_time)} · организатор: ${escapeHtml(s.organizer)}</div>
        </div>
        <button class="secondary" data-delete="${s.id}">Удалить</button>
      </div>
      ${s.type==='open' ? `<div class="participants">${(s.participants||[]).map(p=>`<span class="person">${escapeHtml(p.name)} <button title="Удалить участника" data-person="${p.id}">×</button></span>`).join('') || '<span class="muted">Участников пока нет</span>'}</div>` : ''}
    </article>`).join('');

  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteBooking(b.dataset.delete));
  document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>deleteParticipant(b.dataset.person));
  status('');
}

async function deleteBooking(id) {
  if (!confirm('Удалить бронирование и всех участников?')) return;
  const { error } = await db.from('bookings').delete().eq('id',id);
  if (error) return status(error.message,'error');
  loadBookings();
}
async function deleteParticipant(id) {
  if (!confirm('Удалить участника?')) return;
  const { error } = await db.from('participants').delete().eq('id',id);
  if (error) return status(error.message,'error');
  loadBookings();
}

$('loginForm').onsubmit = async e => {
  e.preventDefault(); $('loginError').textContent='';
  const { error } = await db.auth.signInWithPassword({email:$('email').value.trim(), password:$('password').value});
  if (error) $('loginError').textContent=error.message;
  else checkAdmin();
};
$('logoutBtn').onclick = async()=>{ await db.auth.signOut(); checkAdmin(); };
db.auth.onAuthStateChange(() => checkAdmin());
checkAdmin();
