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

async function subscribeToPush() {
  const banner = $('pushBanner');
  const btn = $('pushBtn');

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (banner) banner.textContent = 'Este navegador no admite notificaciones.';
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = 'Activando…';

    const reg = await navigator.serviceWorker.register('./sw.js');
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      banner.textContent = 'No se activaron. Puedes intentarlo de nuevo cuando quieras.';
      btn.remove();
      return;
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY),
    });
    const { endpoint, keys } = sub.toJSON();

    const { error: subError } = await supa
      .from('push_subscriptions')
      .insert({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
    // 23505 = ya estaba guardada (no es un error real)
    if (subError && subError.code !== '23505') throw subError;

    banner.textContent = 'Notificaciones activadas. Te avisaremos aquí.';
    btn.remove();
    localStorage.setItem('rossever_push_done', '1');
  } catch (err) {
    banner.textContent = 'No se pudo activar. Inténtalo otra vez.';
    btn.disabled = false;
    btn.textContent = 'Activar notificaciones';
  }
}

function initPushBanner() {
  const banner = $('pushBanner');
  if (!banner) return;

  const supported = 'serviceWorker' in navigator && 'PushManager' in window;
  const alreadyDone = localStorage.getItem('rossever_push_done') === '1';
  const denied = supported && Notification.permission === 'denied';

  if (!supported || alreadyDone || denied) {
    banner.classList.add('hidden');
    return;
  }
  if (Notification.permission === 'granted') {
    localStorage.setItem('rossever_push_done', '1');
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  $('pushBtn').addEventListener('click', subscribeToPush);
}

function startFeed() {
  const feed = $('feed');
  let count = 0;

  const renderAll = (posts) => {
    if (!posts.length) {
      feed.innerHTML = '<p class="feed-status">Aún no hay detalles. Pronto llegará el primero.</p>';
      return;
    }
    feed.innerHTML = posts.map((p, i) => cardHtml(p, i)).join('');
    count = posts.length;
  };

  supa
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .then(({ data, error }) => {
      if (error) {
        feed.innerHTML = '<p class="feed-status feed-status--error">No se pudieron cargar los detalles. Revisa tu conexión e inténtalo otra vez.</p>';
        return;
      }
      renderAll(data);
    });

  // Tiempo real: cada publicación nueva aparece arriba sin recargar
  supa
    .channel('posts-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
      if (feed.querySelector(':scope > .feed-status')) feed.innerHTML = '';
      feed.insertAdjacentHTML('afterbegin', cardHtml(payload.new, count++));
      feed.firstElementChild.classList.add('is-new');
    })
    .subscribe();
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
  const preview =
    post.type === 'video'
      ? `🎬 ${escapeHtml(post.content)}`
      : escapeHtml(post.content).slice(0, 80) + (post.content.length > 80 ? '…' : '');
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
    const { error } = await supa.from('posts').delete().eq('id', btn.dataset.id);
    if (error) {
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
  supa.auth.getSession().then(({ data }) => {
    show(!!data.session);
    if (data.session) loadPostList();
  });
  supa.auth.onAuthStateChange((_event, session) => {
    show(!!session);
    if (session) loadPostList();
  });
  bindPostListDeletes();

  const tryLogin = async () => {
    const btn = $('gateBtn');
    btn.disabled = true;
    const { error } = await supa.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('pass').value,
    });
    btn.disabled = false;
    if (error) {
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
      say('No se pudo publicar. Revisa la conexión con Supabase.', false);
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
