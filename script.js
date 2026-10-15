'use strict';

/* FitTrack — JavaScript murni, tanpa backend.
   Data tersimpan secara lokal di browser melalui localStorage. */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const STORAGE = {
  workouts: 'fittrack_v1_workouts',
  plans: 'fittrack_v1_plans',
  routes: 'fittrack_v1_routes',
  photos: 'fittrack_v1_photos'
};
const SPORTS = {
  run: { name: 'Lari', symbol: '↗', className: 'run' },
  bike: { name: 'Bersepeda', symbol: '◉', className: 'bike' },
  walk: { name: 'Jalan Kaki', symbol: '⌁', className: 'walk' },
  workout: { name: 'Latihan', symbol: '✦', className: 'run' }
};
const VIEWS = ['dashboard', 'activity', 'schedule', 'routes', 'camera', 'stats'];
const VIEW_NAMES = { dashboard: 'Beranda', activity: 'Aktivitas Saya', schedule: 'Jadwal', routes: 'Rute & GPS', camera: 'Kamera & Galeri', stats: 'Statistik' };
const readItems = (key) => {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data : [];
  } catch { return []; }
};
const writeItems = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { notify('Penyimpanan browser penuh atau diblokir. Data belum tersimpan.'); return false; }
};
const id = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const pad = (value) => String(value).padStart(2, '0');
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dateFromKey = (key) => new Date(`${key}T12:00:00`);
const formatDate = (date) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
const formatDay = (date) => new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(date);
const formatTime = (seconds) => `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds % 3600 / 60))}:${pad(Math.floor(seconds % 60))}`;
const shortTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}j ${minutes % 60}mnt`;
  if (minutes > 0) return `${minutes}mnt`;
  return seconds > 0 ? `${Math.floor(seconds)}dtk` : '0mnt';
};
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sportOf = (key) => SPORTS[key] || SPORTS.workout;
let workouts = readItems(STORAGE.workouts);
let plans = readItems(STORAGE.plans);
let savedRoutes = readItems(STORAGE.routes);
let photos = readItems(STORAGE.photos);
let currentView = 'dashboard';
let toastTimer;

function notify(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3700);
}
function emptyState(iconId, title, message) {
  return `<div class="empty-state"><svg class="icon"><use href="#${iconId}"></use></svg><strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span></div>`;
}
function sportSymbol(sport) {
  const s = sportOf(sport);
  return `<span class="sport-symbol ${s.className}">${s.symbol}</span>`;
}

/* --- Navigation --- */
function navigate(view, updateHash = true) {
  if (!VIEWS.includes(view)) view = 'dashboard';
  if (currentView === 'camera' && view !== 'camera') stopCamera();
  currentView = view;
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  $$('[data-nav]').forEach((button) => button.classList.toggle('active', button.dataset.nav === view));
  $('#current-page-label').textContent = VIEW_NAMES[view];
  if (updateHash && location.hash !== `#${view}`) location.hash = view;
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (view === 'routes') requestAnimationFrame(initMap);
  if (view === 'schedule') renderCalendar();
  if (view === 'stats') renderStats();
  if (view === 'activity') renderHistory();
}
$$('[data-nav]').forEach((button) => button.addEventListener('click', (e) => {
  e.preventDefault();
  navigate(button.dataset.nav);
}));
window.addEventListener('hashchange', () => navigate(location.hash.slice(1), false));

/* --- Overview and statistics --- */
function getStats() {
  const totalSeconds = workouts.reduce((sum, w) => sum + (Number(w.durationSec) || 0), 0);
  const totalDistance = workouts.reduce((sum, w) => sum + (Number(w.distanceKm) || 0), 0);
  return { count: workouts.length, totalSeconds, totalDistance };
}
function getStreak() {
  const completed = new Set(workouts.map((w) => localDateKey(new Date(w.date))));
  const date = new Date();
  if (!completed.has(localDateKey(date))) date.setDate(date.getDate() - 1);
  let streak = 0;
  while (completed.has(localDateKey(date))) {
    streak += 1;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}
function weeklyData() {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() - (6 - i));
    const dayKey = localDateKey(day);
    const seconds = workouts.filter((w) => localDateKey(new Date(w.date)) === dayKey)
      .reduce((total, w) => total + (Number(w.durationSec) || 0), 0);
    return { day, seconds };
  });
}
function renderChart(containerId) {
  const data = weeklyData();
  const maxMinutes = Math.max(10, ...data.map((x) => x.seconds / 60));
  const target = document.getElementById(containerId);
  target.innerHTML = '';
  data.forEach((entry, index) => {
    const height = entry.seconds ? Math.max(3, (entry.seconds / 60 / maxMinutes) * 100) : 2;
    const col = document.createElement('div');
    col.className = `bar-col ${index === 6 ? 'today' : ''}`;
    col.title = `${formatDay(entry.day)}: ${Math.round(entry.seconds / 60)} menit`;
    col.innerHTML = `<div class="bar-track"><div class="bar-fill" style="height:${height}%"></div></div><span class="bar-label">${formatDay(entry.day)}</span>`;
    target.appendChild(col);
  });
  return Math.round(data.reduce((n, d) => n + d.seconds, 0) / 60);
}
function renderOverview() {
  const s = getStats();
  $('#dash-total').textContent = s.count;
  $('#dash-distance').textContent = s.totalDistance.toFixed(1);
  $('#dash-duration').textContent = shortTime(s.totalSeconds);
  $('#dash-streak').textContent = getStreak();
  $('#weekly-total').textContent = `${renderChart('dashboard-chart')} menit dalam 7 hari`;
  renderUpcoming();
}
function renderStats() {
  const s = getStats();
  $('#stats-count').textContent = s.count;
  $('#stats-distance').textContent = s.totalDistance.toFixed(1);
  $('#stats-time').textContent = shortTime(s.totalSeconds);
  $('#stats-average').textContent = shortTime(s.count ? Math.round(s.totalSeconds / s.count) : 0);
  $('#stats-headline').textContent = s.count ? `${s.count} sesi selesai. Pertahankan semangatmu!` : 'Perjalananmu dimulai dari satu aktivitas.';
  $('#stats-subtitle').textContent = s.count ? `Kamu sudah aktif selama ${shortTime(s.totalSeconds)}. Setiap sesi berarti.` : 'Catat aktivitas pertama untuk melihat statistikmu.';
  renderChart('stats-chart');
  const breakdown = $('#sport-breakdown');
  if (!s.count) {
    breakdown.innerHTML = emptyState('i-chart', 'Belum ada aktivitas', 'Jenis olahraga favoritmu akan muncul di sini.');
  } else {
    breakdown.innerHTML = Object.entries(SPORTS).map(([key, sport]) => {
      const count = workouts.filter((w) => w.sport === key).length;
      if (!count) return '';
      return `<div class="breakdown-item"><div class="breakdown-heading"><span>${sport.name}</span><small>${count} aktivitas</small></div><div class="breakdown-track"><div class="breakdown-fill" style="width:${count / s.count * 100}%"></div></div></div>`;
    }).join('');
  }
}
function refreshStatistics() { renderOverview(); renderStats(); renderHistory(); }

$$('[data-quick-sport]').forEach((btn) => btn.addEventListener('click', () => {
  chooseSport(btn.dataset.quickSport);
  navigate('activity');
}));

/* --- Stopwatch / completed workouts --- */
let selectedSport = 'run';
let timerElapsedMs = 0;
let timerStartedAt = 0;
let timerRunning = false;
let timerInterval = null;
const elapsed = () => timerElapsedMs + (timerRunning ? Date.now() - timerStartedAt : 0);
function chooseSport(sport) {
  if (!SPORTS[sport]) return;
  if (timerRunning || timerElapsedMs > 0) {
    notify('Simpan atau atur ulang sesi sebelum mengganti jenis olahraga.');
    return;
  }
  selectedSport = sport;
  $$('.sport-choice').forEach((button) => button.classList.toggle('selected', button.dataset.sport === sport));
  $('#timer-type').textContent = `SESI ${SPORTS[sport].name.toUpperCase()}`;
}
$$('[data-sport]').forEach((btn) => btn.addEventListener('click', () => chooseSport(btn.dataset.sport)));
function updateTimerUI() {
  $('#timer-display').textContent = formatTime(Math.floor(elapsed() / 1000));
  const start = $('#timer-start');
  start.innerHTML = timerRunning
    ? '<svg class="icon"><use href="#i-pause"></use></svg> Jeda'
    : `<svg class="icon"><use href="#i-play"></use></svg> ${timerElapsedMs > 0 ? 'Lanjutkan' : 'Mulai'}`;
  $('#timer-status').textContent = timerRunning ? 'MEREKAM' : timerElapsedMs > 0 ? 'DIJEDA' : 'SIAP';
  $('#timer-status').className = `status-badge${timerRunning ? ' recording' : timerElapsedMs > 0 ? ' paused' : ''}`;
  $('#timer-finish').disabled = elapsed() < 1000;
}
function pauseTimer() {
  if (timerRunning) {
    timerElapsedMs = elapsed();
    timerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    updateTimerUI();
  }
}
$('#timer-start').addEventListener('click', () => {
  if (timerRunning) pauseTimer();
  else {
    timerStartedAt = Date.now();
    timerRunning = true;
    timerInterval = setInterval(updateTimerUI, 200);
    updateTimerUI();
  }
});
$('#timer-reset').addEventListener('click', () => {
  if (elapsed() >= 1000 && !confirm('Atur ulang timer tanpa menyimpan sesi ini?')) return;
  pauseTimer();
  timerElapsedMs = 0;
  updateTimerUI();
  notify('Timer berhasil diatur ulang.');
});
$('#timer-finish').addEventListener('click', () => {
  const durationSec = Math.floor(elapsed() / 1000);
  if (durationSec < 1) return;
  pauseTimer();
  const capturedDistance = routePoints.length > 1 ? routeDistanceKm : 0;
  const item = { id: id(), sport: selectedSport, date: new Date().toISOString(), durationSec, distanceKm: capturedDistance };
  const updated = [item, ...workouts];
  if (!writeItems(STORAGE.workouts, updated)) return;
  workouts = updated;
  if (tracking) stopTracking(true);
  if (capturedDistance > 0) clearRoute();
  timerElapsedMs = 0;
  updateTimerUI();
  refreshStatistics();
  notify(`${SPORTS[selectedSport].name} tersimpan · ${shortTime(durationSec)}.`);
});
function renderHistory() {
  const target = $('#activity-history');
  if (!workouts.length) {
    target.innerHTML = emptyState('i-activity', 'Belum ada aktivitas', 'Jalankan timer dan simpan aktivitas untuk melihat riwayatnya.');
    return;
  }
  target.innerHTML = workouts.slice(0, 30).map((w) => `<div class="history-row">${sportSymbol(w.sport)}<div class="history-main"><strong>${sportOf(w.sport).name}</strong><small>${formatDate(new Date(w.date))}</small></div><div class="history-detail"><strong>${shortTime(Number(w.durationSec) || 0)}</strong><small>${Number(w.distanceKm || 0).toFixed(2)} km</small></div><button class="history-delete" data-delete-workout="${escapeHTML(w.id)}" aria-label="Hapus aktivitas" title="Hapus aktivitas"><svg class="icon"><use href="#i-trash"></use></svg></button></div>`).join('');
}
$('#activity-history').addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-workout]');
  if (!button || !confirm('Hapus aktivitas ini secara permanen?')) return;
  const updated = workouts.filter((x) => x.id !== button.dataset.deleteWorkout);
  if (writeItems(STORAGE.workouts, updated)) { workouts = updated; refreshStatistics(); notify('Aktivitas dihapus.'); }
});

/* --- Calendar / training plans --- */
let selectedDate = localDateKey();
let calendarMonth = new Date();
calendarMonth.setDate(1);
function renderCalendar() {
  $('#calendar-month').textContent = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(calendarMonth);
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const weekdayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const calendarStart = new Date(year, month, 1 - weekdayOffset);
  const dayGrid = $('#calendar-days');
  dayGrid.innerHTML = '';
  for (let i = 0; i < 42; i++) {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + i);
    const key = localDateKey(date);
    const button = document.createElement('button');
    button.className = `calendar-day${key === selectedDate ? ' selected' : ''}${key === localDateKey() ? ' today' : ''}${date.getMonth() !== month ? ' other-month' : ''}`;
    button.dataset.date = key;
    button.textContent = date.getDate();
    button.setAttribute('aria-label', formatDate(date));
    if (plans.some((plan) => plan.date === key)) button.insertAdjacentHTML('beforeend', '<span class="plan-dot"></span>');
    dayGrid.appendChild(button);
  }
  $('#plan-date').value = selectedDate;
  $('#selected-day-label').textContent = formatDate(dateFromKey(selectedDate));
  const forDay = plans.filter((plan) => plan.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
  $('#selected-day-plans').innerHTML = forDay.length ? forDay.map((plan) => `<div class="compact-row"><span class="compact-dot"></span><div class="compact-info"><strong>${escapeHTML(plan.title)}</strong><small>${escapeHTML(plan.time)} · ${sportOf(plan.sport).name}</small></div><button data-delete-plan="${escapeHTML(plan.id)}" aria-label="Hapus jadwal" title="Hapus jadwal"><svg class="icon"><use href="#i-trash"></use></svg></button></div>`).join('') : emptyState('i-calendar', 'Belum ada jadwal hari ini', 'Tambahkan jadwal olahraga melalui formulir di atas.');
}
$('#calendar-days').addEventListener('click', (event) => {
  const button = event.target.closest('[data-date]');
  if (!button) return;
  selectedDate = button.dataset.date;
  calendarMonth = new Date(`${selectedDate}T12:00:00`);
  calendarMonth.setDate(1);
  renderCalendar();
});
$('#month-prev').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() - 1); renderCalendar(); });
$('#month-next').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() + 1); renderCalendar(); });
$('#plan-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const title = $('#plan-title').value.trim();
  const date = $('#plan-date').value;
  const time = $('#plan-time').value;
  const sport = $('#plan-sport').value;
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !SPORTS[sport]) return;
  const newPlans = [...plans, { id: id(), title, date, time, sport }];
  if (!writeItems(STORAGE.plans, newPlans)) return;
  plans = newPlans;
  selectedDate = date;
  calendarMonth = dateFromKey(date);
  calendarMonth.setDate(1);
  $('#plan-title').value = '';
  renderCalendar();
  renderUpcoming();
  notify('Jadwal olahraga berhasil ditambahkan.');
});
$('#selected-day-plans').addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-plan]');
  if (!button) return;
  const updated = plans.filter((x) => x.id !== button.dataset.deletePlan);
  if (writeItems(STORAGE.plans, updated)) { plans = updated; renderCalendar(); renderUpcoming(); notify('Jadwal dihapus.'); }
});
function renderUpcoming() {
  const upcoming = plans.filter((plan) => plan.date >= localDateKey()).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(0, 3);
  $('#dashboard-upcoming').innerHTML = upcoming.length ? upcoming.map((plan) => `<div class="compact-row"><span class="compact-dot"></span><div class="compact-info"><strong>${escapeHTML(plan.title)}</strong><small>${formatDate(dateFromKey(plan.date))} · ${escapeHTML(plan.time)}</small></div><svg class="icon" style="color:#bdc2c0;width:15px"><use href="#i-calendar"></use></svg></div>`).join('') : emptyState('i-calendar', 'Belum ada jadwal mendatang', 'Mulai susun rutinitas dengan menambahkan jadwal.');
}

/* --- OpenStreetMap + geolocation tracker --- */
let map = null;
let routeLine = null;
let locationMarker = null;
let tracking = false;
let geoWatchId = null;
let routePoints = [];
let routeDistanceKm = 0;
function initMap() {
  if (map) { map.invalidateSize(); return; }
  if (!window.L) return;
  map = L.map('route-map', { zoomControl: true }).setView([-6.2088, 106.8456], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  routeLine = L.polyline([], { color: '#fa5935', weight: 5, opacity: .95 }).addTo(map);
}
function earthDistanceKm(a, b) {
  const r = 6371;
  const toRad = (angle) => angle * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(x)));
}
function updateRouteUI() {
  $('#gps-distance').innerHTML = `${routeDistanceKm.toFixed(2)} <small>km</small>`;
  $('#gps-indicator').textContent = tracking ? 'MELACAK' : 'NONAKTIF';
  $('#gps-indicator').className = `status-badge${tracking ? ' recording' : ''}`;
  $('#track-toggle').innerHTML = tracking ? '<svg class="icon"><use href="#i-stop"></use></svg> Berhenti & simpan rute' : '<svg class="icon"><use href="#i-play"></use></svg> Mulai lacak';
  if (map && routeLine) routeLine.setLatLngs(routePoints);
}
function setGPSText(message) { $('#gps-message').textContent = message; }
function setLocation(lat, lng) {
  initMap();
  if (map) {
    if (!locationMarker) locationMarker = L.circleMarker([lat, lng], { radius: 8, weight: 3, color: '#fff', fillColor: '#3889ef', fillOpacity: 1 }).addTo(map);
    else locationMarker.setLatLng([lat, lng]);
    map.setView([lat, lng], 16);
  }
  $('#open-osm').href = `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=16/${lat.toFixed(6)}/${lng.toFixed(6)}`;
}
function gpsError(error) {
  const message = error?.code === 1 ? 'Izin lokasi ditolak. Izinkan lokasi melalui browser.' : error?.code === 2 ? 'Lokasi tidak tersedia. Coba di luar ruangan.' : 'GPS belum mendapatkan posisi. Periksa koneksi/lokasi.';
  setGPSText(message);
  if (tracking) stopTracking(false);
  notify(message);
}
$('#locate-button').addEventListener('click', () => {
  if (!navigator.geolocation) return notify('Browser tidak mendukung geolocation.');
  setGPSText('Sedang mencari lokasi...');
  navigator.geolocation.getCurrentPosition(
    (pos) => { setLocation(pos.coords.latitude, pos.coords.longitude); setGPSText(`Lokasi ditemukan · akurasi ±${Math.round(pos.coords.accuracy)} m`); },
    gpsError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
  );
});
function clearRoute() {
  routePoints = [];
  routeDistanceKm = 0;
  updateRouteUI();
}
function stopTracking(shouldSave = true) {
  if (geoWatchId !== null) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
  tracking = false;
  if (shouldSave && routePoints.length > 1 && routeDistanceKm > 0) {
    const stride = Math.max(1, Math.ceil(routePoints.length / 300));
    const points = routePoints.filter((_, i) => i % stride === 0);
    const last = routePoints[routePoints.length - 1];
    if (points[points.length - 1] !== last) points.push(last);
    const item = { id: id(), date: new Date().toISOString(), distanceKm: routeDistanceKm, points };
    const updated = [item, ...savedRoutes].slice(0, 30);
    if (writeItems(STORAGE.routes, updated)) { savedRoutes = updated; renderSavedRoutes(); notify('Rute GPS tersimpan.'); }
  }
  updateRouteUI();
  if (shouldSave) setGPSText('Pelacakan berhenti. Mulai lagi untuk merekam rute baru.');
}
function startTracking() {
  if (!navigator.geolocation) return notify('GPS tidak tersedia di browser ini.');
  if (tracking) return;
  clearRoute();
  tracking = true;
  setGPSText('Menunggu sinyal GPS...');
  updateRouteUI();
  try {
    geoWatchId = navigator.geolocation.watchPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;
      setLocation(lat, lng);
      if (accuracy > 75) { setGPSText(`GPS lemah (±${Math.round(accuracy)} m). Menunggu akurasi lebih baik.`); return; }
      const point = [lat, lng];
      if (routePoints.length) {
        const distance = earthDistanceKm(routePoints[routePoints.length - 1], point);
        if (distance < .005) return; // ignore GPS jitter below 5 meters
        if (distance > .2) { setGPSText('Lonjakan GPS terdeteksi; titik diabaikan.'); return; }
        routeDistanceKm += distance;
      }
      routePoints.push(point);
      updateRouteUI();
      setGPSText(`Merekam rute · akurasi ±${Math.round(accuracy)} m`);
    }, gpsError, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  } catch { tracking = false; updateRouteUI(); notify('GPS gagal diaktifkan. Coba melalui localhost atau HTTPS.'); }
}
$('#track-toggle').addEventListener('click', () => tracking ? stopTracking(true) : startTracking());
$('#track-reset').addEventListener('click', () => {
  if (tracking) return notify('Hentikan pelacakan sebelum menghapus rute.');
  clearRoute();
  setGPSText('Rute dihapus. Mulai lacak untuk merekam rute baru.');
});
function renderSavedRoutes() {
  $('#saved-routes').innerHTML = savedRoutes.length ? savedRoutes.slice(0, 10).map((route) => `<div class="compact-row"><span class="compact-dot"></span><div class="compact-info"><strong>${Number(route.distanceKm || 0).toFixed(2)} km</strong><small>${formatDate(new Date(route.date))}</small></div><button data-view-route="${escapeHTML(route.id)}" title="Lihat rute" aria-label="Lihat rute"><svg class="icon"><use href="#i-map"></use></svg></button><button data-delete-route="${escapeHTML(route.id)}" title="Hapus rute" aria-label="Hapus rute"><svg class="icon"><use href="#i-trash"></use></svg></button></div>`).join('') : emptyState('i-map', 'Belum ada rute tersimpan', 'Aktifkan GPS di luar ruangan untuk merekam rute.');
}
$('#saved-routes').addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view-route]');
  const deleteButton = event.target.closest('[data-delete-route]');
  if (deleteButton) {
    const updated = savedRoutes.filter((x) => x.id !== deleteButton.dataset.deleteRoute);
    if (writeItems(STORAGE.routes, updated)) { savedRoutes = updated; renderSavedRoutes(); notify('Rute dihapus.'); }
    return;
  }
  if (viewButton) {
    if (tracking) return notify('Hentikan pelacakan GPS untuk melihat rute tersimpan.');
    const route = savedRoutes.find((x) => x.id === viewButton.dataset.viewRoute);
    if (!route || !Array.isArray(route.points) || !route.points.length) return;
    initMap();
    if (!map) return notify('Peta belum tersedia. Sambungkan internet lalu muat ulang halaman.');
    routeLine.setLatLngs(route.points);
    map.fitBounds(routeLine.getBounds(), { padding: [35, 35], maxZoom: 16 });
    setGPSText(`Melihat rute tersimpan · ${Number(route.distanceKm).toFixed(2)} km`);
  }
});

/* --- Camera + gallery --- */
let cameraStream = null;
let facingMode = 'environment';
function stopCamera() {
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  $('#camera-video').srcObject = null;
  $('#camera-placeholder').style.display = '';
  $('#camera-start').disabled = false;
  $('#camera-snap').disabled = true;
  $('#camera-stop').disabled = true;
  $('#camera-flip').disabled = true;
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    notify('Kamera tidak tersedia. Buka melalui localhost atau HTTPS, atau unggah foto dari perangkat.');
    return;
  }
  stopCamera();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    const video = $('#camera-video');
    video.srcObject = cameraStream;
    await video.play();
    $('#camera-placeholder').style.display = 'none';
    $('#camera-start').disabled = true;
    $('#camera-snap').disabled = false;
    $('#camera-stop').disabled = false;
    $('#camera-flip').disabled = false;
  } catch (err) {
    stopCamera();
    notify(err.name === 'NotAllowedError' ? 'Akses kamera ditolak. Izinkan lewat browser.' : 'Kamera tidak dapat dibuka. Pastikan kamera tidak dipakai aplikasi lain.');
  }
}
$('#camera-start').addEventListener('click', startCamera);
$('#camera-stop').addEventListener('click', stopCamera);
$('#camera-flip').addEventListener('click', () => { facingMode = facingMode === 'environment' ? 'user' : 'environment'; startCamera(); });
function storePhoto(dataUrl) {
  const updated = [{ id: id(), date: new Date().toISOString(), dataUrl }, ...photos].slice(0, 8);
  if (writeItems(STORAGE.photos, updated)) { photos = updated; renderGallery(); notify('Foto disimpan di browser ini.'); }
}
function canvasToPhoto(source, sourceWidth, sourceHeight) {
  if (!sourceWidth || !sourceHeight) return notify('Gambar belum siap. Coba lagi.');
  const canvas = $('#photo-canvas');
  const scale = Math.min(1, 900 / sourceWidth, 900 / sourceHeight);
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  storePhoto(canvas.toDataURL('image/jpeg', .7));
}
$('#camera-snap').addEventListener('click', () => {
  if (!cameraStream) return;
  const video = $('#camera-video');
  canvasToPhoto(video, video.videoWidth, video.videoHeight);
});
$('#photo-upload').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { notify('Pilih file gambar yang valid.'); event.target.value = ''; return; }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    canvasToPhoto(img, img.naturalWidth, img.naturalHeight);
  } catch { notify('Gambar tidak dapat dibaca.'); }
  finally { URL.revokeObjectURL(url); event.target.value = ''; }
});
function renderGallery() {
  const grid = $('#gallery-grid');
  if (!photos.length) { grid.innerHTML = `<div class="gallery-empty">${emptyState('i-image', 'Belum ada foto', 'Ambil foto atau pilih gambar dari perangkatmu.')}</div>`; return; }
  grid.innerHTML = '';
  photos.forEach((photo) => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    const img = document.createElement('img');
    img.src = photo.dataUrl;
    img.alt = 'Foto olahraga';
    img.loading = 'lazy';
    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Hapus foto';
    button.setAttribute('aria-label', 'Hapus foto');
    button.dataset.deletePhoto = photo.id;
    button.innerHTML = '<svg class="icon"><use href="#i-trash"></use></svg>';
    item.append(img, button);
    grid.appendChild(item);
  });
}
$('#gallery-grid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-photo]');
  if (!button) return;
  const updated = photos.filter((p) => p.id !== button.dataset.deletePhoto);
  if (writeItems(STORAGE.photos, updated)) { photos = updated; renderGallery(); notify('Foto dihapus.'); }
});

/* --- Boot --- */
$('#today-label').textContent = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
$('#footer-year').textContent = new Date().getFullYear();
renderOverview();
renderHistory();
renderCalendar();
renderSavedRoutes();
renderGallery();
renderStats();
updateTimerUI();
navigate(location.hash.slice(1) || 'dashboard', false);
window.addEventListener('pagehide', () => { stopCamera(); if (tracking) stopTracking(true); });
