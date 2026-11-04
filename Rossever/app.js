/* ==========================================================
   ROSSEVER — lógica principal
   Rellena la sección CONFIG y listo.
   ========================================================== */

const CONFIG = {
  // Supabase → Project Settings → API
  SUPABASE_URL: 'https://trsyyewfzmssytucuxpx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyc3l5ZXdmem1zc3l0dWN1eHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MjMzNDgsImV4cCI6MjEwNjE5OTM0OH0.LrOeHMZEw3nUL4x1k-2gDxxAJO5WYyGTCWVC9n5goGA',

  // Fecha en que empezaron (formato AAAA-MM-DDTHH:MM:SS, hora local)
  START_DATE: '2024-01-01T00:00:00',

  // Notificaciones push (clave pública VAPID, la privada va solo en la Edge Function)
  VAPID_PUBLIC_KEY: 'BOOcnw-vS6oj3SG094ItzHDljIISSi_SBkDjM8aLyekVwkovPaqvbME8AiGYIDeC3UzkcBfbi03XUvysgnhdCsI',

  // Contraseña del panel: ya no se valida aquí.
  // El login real se crea en Supabase → Authentication → Users.

};

/* ---------- Utilidades ---------- */
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Si el CDN de Supabase no carga, avisamos en pantalla en vez de dejar la app en blanco
if (!window.supabase) {
  const msg = 'No se pudo cargar la conexión. Revisa tu internet y recarga la página.';
  const feedEl = $('feed');
  if (feedEl) feedEl.innerHTML = `<p class="feed-status feed-status--error">${msg}</p>`;
  else if ($('gate')) $('gate').insertAdjacentHTML('beforeend', `<p class="error-text">${msg}</p>`);
  throw new Error('supabase-js no se cargó');
}

const supa = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ---------- Video: YouTube o archivo directo ---------- */
function youtubeId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}

function videoHtml(url) {
  if (!/^https?:\/\//i.test(url)) return '<p class="feed-status">Video no disponible.</p>';
  const yt = youtubeId(url);
  if (yt) {
    return `<div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${yt}?rel=0&playsinline=1"
      title="Video para ti" loading="lazy" allowfullscreen
      allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"></iframe></div>`;
  }
  if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url) || url.includes('supabase.co/storage')) {
    return `<div class="video-frame"><video src="${escapeHtml(url)}" controls playsinline preload="metadata"></video></div>`;
  }
  return `<a class="btn inline-block" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir video</a>`;
}

/* ---------- Tarjetas ---------- */
function cardHtml(post, index) {
  const date = formatDate(post.created_at);
  if (post.type === 'video') {
    return `<article class="card-video" data-id="${post.id}">
      ${videoHtml(post.content)}
      <p class="card-date">${date}</p>
    </article>`;
  }
  const tilt = index % 2 === 0 ? 'tilt-a' : 'tilt-b';
  return `<article class="letter ${tilt}" data-id="${post.id}">
    <p class="letter-body">${escapeHtml(post.content)}</p>
    <p class="letter-date">${date}</p>
  </article>`;
}

/* ==========================================================
   VISTA DE ROSSI (index.html)
   ========================================================== */

/* ---------- Notificaciones push ---------- */
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function savePushSubscription(sub) {
  // Evita repetir el INSERT en cada visita si este dispositivo ya quedó guardado
  const cached = localStorage.getItem('rossever_push_endpoint');
  if (cached === sub.endpoint) return;
  const { endpoint, keys } = sub.toJSON();
  const { error } = await supa
    .from('push_subscriptions')
    .insert({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
  // 23505 = ya estaba guardada (no es un error real)
  if (error && error.code !== '23505') throw error;
  localStorage.setItem('rossever_push_endpoint', endpoint);
}

// Registra el SW, espera a que esté activo y deja la suscripción guardada en Supabase
async function ensurePushSubscription() {
  await navigator.serviceWorker.register('./sw.js');
  const reg = await navigator.serviceWorker.ready; // subscribe() exige un SW ya activo
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY),
    });
  }
  await savePushSubscription(sub);
}

async function subscribeToPush() {
  const banner = $('pushBanner');
  const text = banner.querySelector('span');
  const btn = $('pushBtn');

  try {
    btn.disabled = true;
    btn.textContent = 'Activando…';

    const permission = await Notification.requestPermission();
    if (permission === 'denied') {
      text.textContent = 'Las notificaciones están bloqueadas. Actívalas desde los ajustes del sitio en tu navegador.';
      btn.remove();
      return;
    }
    if (permission !== 'granted') {
      // Cerró el aviso sin elegir: el botón sigue disponible para intentarlo de nuevo
      text.textContent = 'No se activaron. Puedes intentarlo de nuevo cuando quieras.';
      btn.disabled = false;
      btn.textContent = 'Activar notificaciones';
      return;
    }

    await ensurePushSubscription();
    text.textContent = 'Notificaciones activadas. Te avisaremos aquí.';
    btn.remove();
  } catch (err) {
    console.error('Push:', err);
    text.textContent = 'No se pudo activar. Inténtalo otra vez.';
    btn.disabled = false;
    btn.textContent = 'Activar notificaciones';
  }
}

function initPushBanner() {
  const banner = $('pushBanner');
  if (!banner) return;

  if (!pushSupported() || Notification.permission === 'denied') {
    banner.classList.add('hidden');
    return;
  }
  if (Notification.permission === 'granted') {
    // Ya dio permiso: se re-sincroniza la suscripción en silencio (por si cambió o se perdió)
    banner.classList.add('hidden');
    ensurePushSubscription().catch((err) => console.error('Push:', err));
    return;
  }

  banner.classList.remove('hidden');
  $('pushBtn').addEventListener('click', subscribeToPush);
}

function startFeed() {
  const feed = $('feed');
  const EMPTY = '<p class="feed-status">Aún no hay detalles. Pronto llegará el primero.</p>';
  const domIds = () => [...feed.querySelectorAll('article[data-id]')].map((a) => a.dataset.id).join(',');

  const renderAll = (posts) => {
    // Si ya se está mostrando exactamente lo mismo, no se toca el DOM (no corta videos)
    if (posts.length && posts.map((p) => p.id).join(',') === domIds()) return;
    feed.innerHTML = posts.length ? posts.map((p, i) => cardHtml(p, i)).join('') : EMPTY;
  };

  const loadFeed = async () => {
    const { data, error } = await supa.from('posts').select('*').order('created_at', { ascending: false });
    if (error) {
      if (!feed.querySelector('article')) {
        feed.innerHTML = '<p class="feed-status feed-status--error">No se pudieron cargar los detalles. Revisa tu conexión e inténtalo otra vez.</p>';
      }
      return;
    }
    renderAll(data);
  };

  loadFeed();

  // Tiempo real: cada publicación nueva aparece arriba, y las borradas desaparecen
  supa
    .channel('posts-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
      const post = payload.new;
      if (feed.querySelector(`[data-id="${post.id}"]`)) return; // ya estaba (llegó también por la carga inicial)
      if (!feed.querySelector('article')) feed.innerHTML = '';
      // Alterna la inclinación respecto a la tarjeta que queda debajo
      const idx = feed.firstElementChild?.classList.contains('tilt-a') ? 1 : 0;
      feed.insertAdjacentHTML('afterbegin', cardHtml(post, idx));
      feed.firstElementChild.classList.add('is-new');
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, (payload) => {
      const id = payload.old?.id;
      if (!id) return;
      feed.querySelector(`[data-id="${id}"]`)?.remove();
      if (!feed.querySelector('article')) feed.innerHTML = EMPTY;
    })
    .subscribe();

  // Al volver a abrir la app (el celular suele dormir la conexión en tiempo real),
  // se sincroniza por si se perdió algún detalle mientras estaba en segundo plano
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadFeed();
  });
}

function startCounter() {
  const start = new Date(CONFIG.START_DATE).getTime();
  const tick = () => {
    let diff = Math.max(0, Date.now() - start);
    const days = Math.floor(diff / 86400000);
    diff -= days * 86400000;
    const h = Math.floor(diff / 3600000);
    diff -= h * 3600000;
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff - m * 60000) / 1000);
    $('cDays').textContent = days.toLocaleString('es-CO');
    $('cHours').textContent = pad(h);
    $('cMins').textContent = pad(m);
    $('cSecs').textContent = pad(s);
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- Lista con borrado (panel de admin) ---------- */
function adminRowHtml(post) {
  const date = formatDate(post.created_at);
  // Se recorta el texto original y SOLO después se escapa (recortar HTML ya escapado rompe &amp; etc.)
  const preview =
    post.type === 'video'
      ? `🎬 ${escapeHtml(post.content)}`
      : escapeHtml(post.content.slice(0, 80)) + (post.content.length > 80 ? '…' : '');
  return `<div class="post-row" data-id="${post.id}">
    <div class="post-row-text">
      <p class="post-row-preview">${preview}</p>
      <p class="post-row-date">${date}</p>
    </div>
    <button type="button" class="post-row-delete" data-id="${post.id}" aria-label="Eliminar">Eliminar</button>
  </div>`;
}

async function loadPostList() {
  const list = $('postList');
  const { data, error } = await supa.from('posts').select('*').order('created_at', { ascending: false }).limit(20);
  if (error) {
    list.innerHTML = '<p class="feed-status feed-status--error">No se pudo cargar la lista.</p>';
    return;
  }
  list.innerHTML = data.length
    ? data.map(adminRowHtml).join('')
    : '<p class="feed-status">Todavía no has publicado nada.</p>';
}

function bindPostListDeletes() {
  $('postList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.post-row-delete');
    if (!btn) return;
    if (!confirm('¿Eliminar esta publicación? No se puede deshacer.')) return;

    btn.disabled = true;
    btn.textContent = 'Eliminando…';
    // .select() devuelve las filas borradas: si vienen vacías, RLS bloqueó el borrado sin dar error
    const { data, error } = await supa.from('posts').delete().eq('id', btn.dataset.id).select();
    if (error || !data || !data.length) {
      btn.disabled = false;
      btn.textContent = 'Eliminar';
      alert('No se pudo eliminar. Inténtalo de nuevo.');
    } else {
      btn.closest('.post-row').remove();
    }
  });
}

/* ==========================================================
   PANEL DE ADMINISTRADOR (admin.html)
   ========================================================== */
function startAdmin() {
  const gate = $('gate');
  const panel = $('panel');
  const show = (ok) => {
    gate.classList.toggle('hidden', ok);
    panel.classList.toggle('hidden', !ok);
  };

  // Acceso: se valida con Supabase Auth, no en el navegador
  let listedFor = null;
  const applySession = (session) => {
    show(!!session);
    if (session && listedFor !== session.user.id) {
      listedFor = session.user.id;
      loadPostList();
    } else if (!session) {
      listedFor = null;
      $('postList').innerHTML = '';
    }
  };
  supa.auth.getSession().then(({ data }) => applySession(data.session));
  // setTimeout evita llamar a Supabase dentro del propio callback de auth (puede bloquearse)
  supa.auth.onAuthStateChange((_event, session) => setTimeout(() => applySession(session), 0));
  bindPostListDeletes();

  const tryLogin = async () => {
    const btn = $('gateBtn');
    btn.disabled = true;
    let error = null;
    try {
      ({ error } = await supa.auth.signInWithPassword({
        email: $('email').value.trim(),
        password: $('pass').value,
      }));
    } catch (e) {
      error = e;
    }
    btn.disabled = false;
    if (error) {
      // 400 = credenciales inválidas; cualquier otra cosa = problema de conexión
      $('gateError').textContent =
        error.status === 400 ? 'Correo o contraseña incorrectos.' : 'No se pudo conectar. Revisa tu internet e inténtalo otra vez.';
      $('gateError').classList.remove('hidden');
    } else {
      $('gateError').classList.add('hidden');
      $('pass').value = '';
    }
  };
  $('gateBtn').addEventListener('click', tryLogin);
  $('email').addEventListener('keydown', (e) => e.key === 'Enter' && tryLogin());
  $('pass').addEventListener('keydown', (e) => e.key === 'Enter' && tryLogin());
  $('logoutBtn').addEventListener('click', () => supa.auth.signOut());

  // Selector de tipo
  let type = 'text';
  const content = $('content');
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      type = btn.dataset.type;
      document.querySelectorAll('.seg-btn').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-checked', String(on));
      });
      const isVideo = type === 'video';
      $('contentLabel').textContent = isVideo ? 'Enlace del video' : 'Tu mensaje';
      content.rows = isVideo ? 2 : 6;
      content.placeholder = isVideo ? 'https://youtu.be/…' : 'Escribe algo bonito para Rossi…';
      $('hint').classList.toggle('hidden', !isVideo);
    });
  });

  // Publicar
  const msg = $('msg');
  const say = (text, ok) => {
    msg.textContent = text;
    msg.className = `status-msg ${ok ? 'status-msg--ok' : 'status-msg--error'}`;
  };

  $('publishBtn').addEventListener('click', async () => {
    const value = content.value.trim();
    if (!value) return say('Escribe un mensaje o pega un enlace antes de publicar.', false);
    if (type === 'video' && !/^https?:\/\//i.test(value)) return say('El enlace debe empezar por http:// o https://', false);

    const btn = $('publishBtn');
    btn.disabled = true;
    btn.textContent = 'Publicando…';

    const { error } = await supa.from('posts').insert({ type, content: value });
    if (error) {
      console.error('Publicar:', error);
      // 42501 = RLS rechazó el insert (sesión vencida); JWT expired también llega como 401
      const expired = error.code === '42501' || error.status === 401 || /jwt/i.test(error.message || '');
      say(expired ? 'Tu sesión venció. Sal y vuelve a entrar para publicar.' : 'No se pudo publicar. Revisa la conexión con Supabase.', false);
    } else {
      content.value = '';
      loadPostList();
      say('Publicado. Rossi recibirá la notificación en su celular.', true);
    }
    btn.disabled = false;
    btn.textContent = 'Publicar';
  });
}

/* ---------- Arranque ---------- */
if (document.body.dataset.page === 'admin') {
  startAdmin();
} else {
  startCounter();
  startFeed();
  initPushBanner();
}
