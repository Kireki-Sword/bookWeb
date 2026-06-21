const JIKAN = 'https://api.jikan.moe/v4';
const GBOOKS = 'https://www.googleapis.com/books/v1';

// ── LOCAL STORAGE (Supabase-ready later) ──────────────────────────────────────
const DB = {
  get: (key) => JSON.parse(localStorage.getItem('inkwell_' + key) || 'null'),
  set: (key, val) => localStorage.setItem('inkwell_' + key, JSON.stringify(val)),

  getLibrary: () => DB.get('library') || {},
  saveLibrary: (lib) => DB.set('library', lib),

  getEntry: (id) => (DB.getLibrary())[id] || null,

  addToLibrary: (item, status) => {
    const lib = DB.getLibrary();
    if (!lib[item.id]) {
      lib[item.id] = { ...item, status, score: null, notes: '', quotes: [], panels: [], addedAt: Date.now() };
    } else {
      lib[item.id].status = status;
    }
    DB.saveLibrary(lib);
  },

  updateEntry: (id, patch) => {
    const lib = DB.getLibrary();
    if (lib[id]) { lib[id] = { ...lib[id], ...patch }; DB.saveLibrary(lib); }
  },

  getByStatus: (status) => Object.values(DB.getLibrary()).filter(e => e.status === status),
};

// ── API ───────────────────────────────────────────────────────────────────────
const API = {
  async getMangaTrending() {
    const r = await fetch(`${JIKAN}/top/manga?filter=bypopularity&limit=18`);
    const d = await r.json();
    return (d.data || []).map(normalizeManga);
  },

  async searchManga(q, genre, sort, page = 1) {
    let url = `${JIKAN}/manga?page=${page}&limit=20&sfw=true`;
    if (q) url += `&q=${encodeURIComponent(q)}`;
    if (genre) url += `&genres=${genre}`;
    if (sort === 'score') url += `&order_by=score&sort=desc`;
    else if (sort === 'newest') url += `&order_by=start_date&sort=desc`;
    else if (sort === 'oldest') url += `&order_by=start_date&sort=asc`;
    else url += `&order_by=popularity&sort=asc`;
    const r = await fetch(url);
    const d = await r.json();
    return { items: (d.data || []).map(normalizeManga), total: d.pagination?.items?.total || 0, pages: d.pagination?.last_visible_page || 1 };
  },

  async getMangaDetail(id) {
    const [main, chars] = await Promise.all([
      fetch(`${JIKAN}/manga/${id}/full`).then(r => r.json()),
      fetch(`${JIKAN}/manga/${id}/characters`).then(r => r.json()),
    ]);
    return { ...normalizeManga(main.data), characters: (chars.data || []).slice(0, 12) };
  },

  async getBooksTrending() {
    const r = await fetch(`${GBOOKS}/volumes?q=subject:fiction&orderBy=relevance&maxResults=18&printType=books`);
    const d = await r.json();
    return (d.items || []).map(normalizeBook);
  },

  async searchBooks(q, genre, sort, page = 1) {
    const start = (page - 1) * 20;
    let query = q || (genre ? `subject:${genre}` : 'bestseller fiction');
    const order = sort === 'newest' ? 'newest' : 'relevance';
    const r = await fetch(`${GBOOKS}/volumes?q=${encodeURIComponent(query)}&orderBy=${order}&maxResults=20&startIndex=${start}&printType=books`);
    const d = await r.json();
    return { items: (d.items || []).map(normalizeBook), total: d.totalItems || 0, pages: Math.ceil((d.totalItems || 0) / 20) };
  },

  async getBookDetail(id) {
    const r = await fetch(`${GBOOKS}/volumes/${id}`);
    const d = await r.json();
    return normalizeBook(d);
  },
};

// ── NORMALIZERS ───────────────────────────────────────────────────────────────
function normalizeManga(m) {
  return {
    id: 'manga_' + m.mal_id,
    malId: m.mal_id,
    type: 'manga',
    title: m.title_english || m.title,
    cover: m.images?.jpg?.large_image_url || m.images?.jpg?.image_url || '',
    score: m.score,
    status: m.status,
    chapters: m.chapters,
    volumes: m.volumes,
    synopsis: m.synopsis,
    genres: (m.genres || []).map(g => g.name),
    authors: (m.authors || []).map(a => a.name).join(', '),
    year: m.published?.prop?.from?.year,
    rank: m.rank,
    popularity: m.popularity,
  };
}

function normalizeBook(b) {
  const info = b.volumeInfo || {};
  return {
    id: 'book_' + b.id,
    googleId: b.id,
    type: 'book',
    title: info.title,
    cover: info.imageLinks?.thumbnail?.replace('http:', 'https:') || '',
    score: info.averageRating,
    status: info.publishedDate ? 'Finished' : '',
    chapters: null,
    pages: info.pageCount,
    synopsis: info.description,
    genres: info.categories || [],
    authors: (info.authors || []).join(', '),
    year: info.publishedDate?.slice(0, 4),
    publisher: info.publisher,
  };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

function navigate(page, params = {}) {
  const q = new URLSearchParams(params).toString();
  window.location.href = page + (q ? '?' + q : '');
}

function getParams() {
  return Object.fromEntries(new URLSearchParams(location.search));
}

function renderSkeletons(container, count = 18) {
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-cover"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line" style="width:85%"></div>
        <div class="skeleton skeleton-line short"></div>
      </div>
    </div>`).join('');
}

function renderCard(item) {
  const score = item.score ? `<span class="card-score">★ ${item.score.toFixed(1)}</span>` : '';
  const cover = item.cover
    ? `<img class="card-cover" src="${item.cover}" alt="${item.title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const placeholder = `<div class="card-cover-placeholder" ${item.cover ? 'style="display:none"' : ''}>📖</div>`;
  return `
    <div class="card fade-in" onclick="navigate('detail.html',{id:'${item.id}'})">
      ${cover}${placeholder}
      <div class="card-body">
        <div class="card-title">${item.title || 'Untitled'}</div>
        <div class="card-meta">${score}<span>${item.authors || item.type}</span></div>
      </div>
    </div>`;
}

function renderPagination(container, current, total, onPage) {
  if (total <= 1) { container.innerHTML = ''; return; }
  const max = Math.min(total, 500);
  let btns = `<button class="page-btn" onclick="(${onPage})(${current - 1})" ${current === 1 ? 'disabled' : ''}>‹</button>`;
  const range = [];
  if (max <= 7) { for (let i = 1; i <= max; i++) range.push(i); }
  else {
    range.push(1);
    if (current > 3) range.push('…');
    for (let i = Math.max(2, current - 1); i <= Math.min(max - 1, current + 1); i++) range.push(i);
    if (current < max - 2) range.push('…');
    range.push(max);
  }
  range.forEach(p => {
    if (p === '…') { btns += `<span class="page-btn" style="border:none;cursor:default">…</span>`; }
    else { btns += `<button class="page-btn ${p === current ? 'active' : ''}" onclick="(${onPage})(${p})">${p}</button>`; }
  });
  btns += `<button class="page-btn" onclick="(${onPage})(${current + 1})" ${current === max ? 'disabled' : ''}>›</button>`;
  container.innerHTML = btns;
}

// ── NAV ACTIVE STATE ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) a.classList.add('active');
  });
});