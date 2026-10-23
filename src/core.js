/* ================================================================
   BOARD alpha. Core: config, state, API, queue, shell, login, routing
   ================================================================ */

/* ---- CONFIG: paste your Apps Script web app URL between the quotes ---- */
const API_URL = '';
/* ---------------------------------------------------------------------- */

const APP_VERSION = '0.1.0-alpha';
const POLL_MS = 20000;
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const API = (LOCAL && new URLSearchParams(location.search).get('api')) || API_URL;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

const S = {
  token: null, me: null, people: [], depts: [], cfg: { stages: [], statuses: [], closeout_fields: [], closeout_options: {}, public_stages: [], fy_start_month: 4 },
  projects: [], version: 0, readonly: false, readonlyKey: '', alphaOpen: false, adminKey: '',
  view: 'pipeline', pipeMode: 'board',
  f: { q: '', person: '', status: '', client: '' },
  tl: { group: 'person', zoom: 1, offset: 0, closed: false },
  co: { q: '', stage: '', incomplete: false },
  ar: { q: '', fy: '', client: '', rows: [], total: 0, fys: [], clients: [], loaded: false, loading: false, offset: 0 },
  clients: null, codes: { mode: 'existing', client: '', title: '', newName: '', newCode: '' },
  settingsTab: 'people', health: null,
  drawer: null, dragging: false, stale: false, sort: { key: 'sort', dir: 1 }
};

/* ---------------- tiny utils ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uniq = a => Array.from(new Set(a));
const norm = s => String(s || '').trim().toLowerCase();

const MS_DAY = 86400000;
const pd = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? new Date(s + 'T00:00:00Z') : null);
const ymd = d => d.toISOString().slice(0, 10);
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dfmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dfmtY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
function fdate(s) { const d = pd(s); if (!d) return ''; return (d.getUTCFullYear() === new Date().getFullYear() ? dfmt : dfmtY).format(d); }
function frange(a, b) {
  if (a && b && a !== b) return `${fdate(a)} - ${fdate(b)}`;
  return fdate(a || b) || '';
}
const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const fmoney = n => (n === '' || n == null ? '' : gbp.format(n));

function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#111';
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111111' : '#FFFFFF';
}

/* ---------------- people / departments / status ---------------- */
const personById = id => S.people.find(p => p.id === id) || null;
const deptById = id => S.depts.find(d => d.id === id) || null;
const deptColour = id => (deptById(id) || {}).colour || '#9AA0A6';
const activePeople = () => S.people.filter(p => p.active !== false);
function av(id, size = '') {
  const p = personById(id);
  if (!p) return `<span class="av ${size}" style="background:var(--color-background-tertiary);color:var(--color-text-secondary)" title="Unknown">?</span>`;
  const c = deptColour(p.department);
  return `<span class="av ${size}" style="background:${c};color:${textOn(c)}" title="${esc(p.name)}">${esc(p.initials)}</span>`;
}
function avStack(ids, size = 'av-sm', max = 4) {
  ids = uniq(ids.filter(Boolean)); if (!ids.length) return '';
  const shown = ids.slice(0, max), extra = ids.length - shown.length;
  return `<span class="av-stack">${shown.map(i => av(i, size)).join('')}${extra > 0 ? `<span class="av ${size} av-more">+${extra}</span>` : ''}</span>`;
}
const teamOf = p => uniq([p.lead].concat(p.creative || [], p.production || [], p.edit || []).filter(Boolean));

const STATUS_COL = { 'Tendering': '#7A8699', 'Awaiting KO': '#FF50BD', 'Pre Production': '#F2B705', 'Edit': '#7C4DFF', 'Awaiting Client Feedback': '#2FB36D', 'To Be Archived': '#9AA0A6' };
const STATUS_FALLBACK = ['#0EA5E9', '#F97316', '#14B8A6', '#B45309', '#6366F1', '#84CC16'];
function statusColour(s) {
  if (!s) return null; if (STATUS_COL[s]) return STATUS_COL[s];
  const i = (S.cfg.statuses || []).indexOf(s);
  return STATUS_FALLBACK[(i < 0 ? 0 : i) % STATUS_FALLBACK.length];
}
function statusChip(s) {
  if (!s) return '';
  return `<span class="chip"><span class="dot" style="background:${statusColour(s)}"></span>${esc(s)}</span>`;
}

const canEdit = () => !S.readonly && S.me && S.me.rank >= 1;
const isAdmin = () => !S.readonly && S.me && S.me.rank >= 2;
const closeoutStages = () => S.cfg.stages.slice(-2);
const liveStages = () => (S.cfg.public_stages && S.cfg.public_stages.length ? S.cfg.public_stages : S.cfg.stages.slice(0, -2));
const projectById = id => S.projects.find(p => p.id === id) || null;
const sortedStage = stage => S.projects.filter(p => p.stage === stage).sort((a, b) => (a.sort === '' ? 1e9 : a.sort) - (b.sort === '' ? 1e9 : b.sort));
const logoHTML = () => `<span class="brand-logo"><img class="logo-light" src="assets/logo-black.png" alt="Sunday Treat" onerror="this.parentNode.classList.add('no-logo')"><img class="logo-dark" src="assets/logo-white.png" alt="" onerror="this.parentNode.classList.add('no-logo')"><span class="wordmark">Sunday<br>Treat</span></span>`;

/* ---------------- toasts, modals, popovers ---------------- */
function toast(msg, kind = '') {
  let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 5000 : 2600);
}
function openModal(html, cls = '') {
  closeModal();
  const s = document.createElement('div'); s.className = 'scrim m'; s.id = 'modalScrim';
  const m = document.createElement('div'); m.className = 'modal ' + cls; m.id = 'modal'; m.setAttribute('role', 'dialog'); m.innerHTML = html;
  document.body.appendChild(s); document.body.appendChild(m);
  s.addEventListener('click', closeModal);
  const f = $('input,select,textarea', m); if (f && !matchMedia('(max-width:860px)').matches) f.focus();
  return m;
}
function closeModal() { $('#modal') && $('#modal').remove(); $('#modalScrim') && $('#modalScrim').remove(); }
function confirmBox(msg, ok = 'Confirm', danger = false, title = 'Are you sure?') {
  return new Promise(res => {
    const m = openModal(`<h3>${esc(title)}</h3><div>${esc(msg)}</div><div class="actions"><button class="btn btn-plain" data-r="0">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(ok)}</button></div>`);
    m.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) { closeModal(); res(b.dataset.r === '1'); } });
    $('#modalScrim').addEventListener('click', () => res(false));
  });
}
function openPop(anchor, html) {
  closePop();
  const p = document.createElement('div'); p.className = 'pop'; p.id = 'pop'; p.innerHTML = html; document.body.appendChild(p);
  const r = anchor.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight;
  let x = Math.min(Math.max(8, r.right - pw), innerWidth - pw - 8), y = r.bottom + 4;
  if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 4);
  p.style.left = x + 'px'; p.style.top = y + 'px';
  return p;
}
function closePop() { $('#pop') && $('#pop').remove(); }

/* ---------------- API ---------------- */
async function api(action, params = {}) {
  if (!API) throw new Error('No backend connected yet');
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 40000);
  let res;
  try {
    res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, token: S.token }, params)), signal: ctl.signal });
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'The server took too long to answer' : 'Cannot reach the server'); }
  finally { clearTimeout(to); }
  let data; try { data = await res.json(); } catch (e) { throw new Error('The server sent something unexpected'); }
  if (!data.ok) {
    if (data.error === 'AUTH') { onAuthLost(); throw new Error('Session expired. Please sign in again.'); }
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}
async function apiPublic(key) {
  const res = await fetch(API + (API.includes('?') ? '&' : '?') + 'action=public_live&key=' + encodeURIComponent(key));
  const data = await res.json(); if (!data.ok) throw new Error(data.error || 'Link not valid'); return data;
}

/* serial write queue so edits always land in order */
let chain = Promise.resolve(), inflight = 0;
function setSync(state) {
  const el = $('#sync'); if (!el) return;
  el.className = 'sync ' + state;
  el.innerHTML = `<span class="dot"></span>${state === 'saving' ? 'Saving' : state === 'error' ? 'Not saved' : 'Live'}`;
}
function write(action, params) {
  inflight++; setSync('saving');
  const p = chain.then(() => api(action, params)).then(res => {
    if (res.version != null) { if (res.version !== S.version + 1) schedule(refresh); S.version = Math.max(S.version, res.version); }
    return res;
  });
  chain = p.catch(() => {});
  p.then(() => { if (--inflight === 0) setSync('saved'); }, err => { inflight--; setSync('error'); toast(err.message || 'Save failed', 'err'); schedule(refresh); });
  return p;
}
const schedule = fn => setTimeout(fn, 0);

/* ---------------- bootstrap + live refresh ---------------- */
function applyBootstrap(d) {
  S.me = d.me; S.people = d.people; S.depts = d.departments; S.cfg = Object.assign(S.cfg, d.config); S.projects = d.projects; S.version = d.version;
  if (d.readonly_key !== undefined) { S.adminKey = d.readonly_key; S.alphaOpen = !!d.alpha_open; }
}
let refreshing = false;
async function refresh() {
  if (refreshing || S.readonly) return; refreshing = true;
  try { await chain; const d = await api('bootstrap'); applyBootstrap(d); softRender(); } catch (e) { /* retry on next poll */ } finally { refreshing = false; }
}
function typing() { const a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.closest('.content') && a.type !== 'checkbox'); }
function softRender() {
  if (S.dragging || typing()) { S.stale = true; return; }
  S.stale = false; renderView(); if (S.drawer) refreshDrawer();
}
document.addEventListener('focusout', () => setTimeout(() => { if (S.stale && !typing() && !S.dragging) softRender(); }, 60));
async function poll() {
  if (document.hidden || inflight || S.dragging) return;
  if (S.readonly) { try { const d = await apiPublic(S.readonlyKey); if (d.version !== S.version) { S.version = d.version; loadPublic(d); renderView(); } } catch (e) {} return; }
  if (!S.token) return;
  try { const d = await api('version'); if (d.version !== S.version) await refresh(); } catch (e) {}
}
setInterval(poll, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
addEventListener('focus', poll);

/* ---------------- theme ---------------- */
function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
function curTheme() { return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
function toggleTheme() { const t = curTheme() === 'dark' ? 'light' : 'dark'; applyTheme(t); store.set('board_theme', t); const i = $('#themeBtn i'); if (i) i.className = 'ti ' + (t === 'dark' ? 'ti-sun' : 'ti-moon'); }
applyTheme(store.get('board_theme'));

/* ---------------- shell ---------------- */
const NAV = [
  { id: 'mine', label: 'My projects', icon: 'ti-user-circle' },
  { id: 'pipeline', label: 'Pipeline', icon: 'ti-layout-kanban' },
  { id: 'timeline', label: 'Timeline', icon: 'ti-calendar-stats' },
  { id: 'closeout', label: 'Closeout', icon: 'ti-checklist' },
  { id: 'archive', label: 'Archive', icon: 'ti-archive' },
  { id: 'codes', label: 'Code generator', icon: 'ti-barcode', group: 'Tools' },
  { id: 'settings', label: 'Settings', icon: 'ti-settings', admin: true, group: 'Admin' }
];
const TITLES = { mine: 'My projects', pipeline: 'Pipeline', timeline: 'Timeline', closeout: 'Closeout', archive: 'Archive', codes: 'Code generator', settings: 'Settings' };

function renderShell() {
  const app = $('#app'); const dark = curTheme() === 'dark';
  let nav = '', lastG = '';
  NAV.forEach(n => {
    if (n.admin && !isAdmin()) return;
    if (n.group && n.group !== lastG) { nav += `<div class="lbl nav-group">${n.group}</div>`; lastG = n.group; }
    nav += `<button class="nav-item" data-act="go" data-v="${n.id}" data-nav="${n.id}"><i class="ti ${n.icon}"></i>${n.label}</button>`;
  });
  app.innerHTML = `
    <nav class="side">
      <div class="brand">${logoHTML()}<span class="brand-name">BOARD</span></div>
      ${nav}
      <div class="side-foot">
        <button class="nav-item" data-act="feedback"><i class="ti ti-message-circle"></i>Feedback</button>
        <button class="nav-item" id="themeBtn" data-act="theme"><i class="ti ${dark ? 'ti-sun' : 'ti-moon'}"></i>Light / dark</button>
        <div class="userchip">${av(S.me.id, 'av-lg')}<div><div class="nm">${esc(S.me.name)}</div><div class="rl">${esc(S.me.access)}</div></div>
          <button class="icon-btn" style="margin-left:auto" data-act="signout" title="Sign out"><i class="ti ti-logout"></i></button></div>
        <div class="ver">ALPHA ${APP_VERSION}</div>
      </div>
    </nav>
    <div class="main">
      <div class="topbar">${logoHTML()}<h1 class="page-title" id="pageTitle"></h1><span class="pill pill-alpha">Alpha</span><span class="spacer"></span><span class="sync" id="sync"><span class="dot"></span>Live</span>
        <button class="icon-btn only-m" data-act="theme" title="Light / dark"><i class="ti ti-moon"></i></button></div>
      <div class="content-wrap"><div class="content" id="content"></div></div>
    </div>
    <div class="tabbar">
      ${['mine', 'pipeline', 'timeline', 'closeout'].map(id => { const n = NAV.find(x => x.id === id); return `<button data-act="go" data-v="${id}" data-nav="${id}"><i class="ti ${n.icon}"></i>${n.label.replace('My projects', 'Mine')}</button>`; }).join('')}
      <button data-act="more" data-nav="more"><i class="ti ti-menu-2"></i>More</button>
    </div>`;
  document.title = 'BOARD (alpha)';
}

function markNav() {
  $$('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === S.view));
  const t = $('#pageTitle'); if (t) t.textContent = TITLES[S.view] || '';
}

/* ---------------- routing ---------------- */
function go(v) { if (location.hash !== '#/' + v) location.hash = '#/' + v; else route(); }
function route() {
  if (!S.me && !S.readonly) return;
  let v = (location.hash.replace(/^#\/?/, '') || 'pipeline').split('/')[0];
  if (S.readonly) { if (!['board', 'timeline'].includes(v)) v = 'board'; }
  else {
    if (!TITLES[v]) v = 'pipeline';
    if (v === 'settings' && !isAdmin()) v = 'pipeline';
  }
  if (v !== 'timeline') S._tlScrolled = false;
  S.view = v; markNav(); renderView();
}
addEventListener('hashchange', route);

function renderView() {
  const c = $('#content'); if (!c) return;
  const sx = c.scrollLeft, sy = c.scrollTop, same = S._lastView === S.view; S._lastView = S.view;
  const fn = { mine: viewMine, pipeline: viewPipeline, timeline: viewTimeline, closeout: viewCloseout, archive: viewArchive, codes: viewCodes, settings: viewSettings, board: viewReadonlyBoard }[S.view];
  c.innerHTML = fn ? fn() : '';
  if (S.view === 'timeline' && !S._tlScrolled) { S._tlScrolled = true; scrollTimelineToToday(); }
  else if (same) { c.scrollLeft = sx; c.scrollTop = sy; }
  else { c.scrollLeft = 0; c.scrollTop = 0; }
  afterRender();
}
function afterRender() {
  if (S.view === 'archive' && !S.ar.loaded && !S.ar.loading) loadArchive(true);
  if (S.view === 'codes') { if (!S.clients) loadClients(); updateCodeOut(); }
  if (S.view === 'settings') settingsAfter();
}

/* ---------------- global events ---------------- */
const ACT = {}, INP = {};
document.addEventListener('click', e => {
  if (!e.target.closest('.pop')) closePop();
  const t = e.target.closest('[data-act]');
  if (t && ACT[t.dataset.act]) ACT[t.dataset.act](t, e);
});
document.addEventListener('change', e => { const t = e.target.closest('[data-chg]'); if (t && INP[t.dataset.chg]) INP[t.dataset.chg](t, e); });
document.addEventListener('input', e => { const t = e.target.closest('[data-inp]'); if (t && INP[t.dataset.inp]) INP[t.dataset.inp](t, e); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#modal')) closeModal(); else if ($('#pop')) closePop(); else if (S.drawer) closeDrawer(); }
});

ACT.go = el => { closePop(); go(el.dataset.v); };
ACT.theme = () => toggleTheme();
ACT.signout = () => signOut();
ACT.more = el => {
  const items = NAV.filter(n => ['archive', 'codes', 'settings'].includes(n.id) && (!n.admin || isAdmin()));
  openPop(el, items.map(n => `<button data-act="go" data-v="${n.id}"><i class="ti ${n.icon}"></i>${n.label}</button>`).join('') +
    `<button data-act="feedback"><i class="ti ti-message-circle"></i>Feedback</button><button data-act="signout"><i class="ti ti-logout"></i>Sign out</button>`);
};

/* ---------------- auth ---------------- */
function onAuthLost() { if (!S.token) return; S.token = null; S.me = null; store.del('board_token'); showLogin('Your session has ended. Please sign in again.'); }
function signOut() { S.token = null; S.me = null; store.del('board_token'); S._tlScrolled = false; closeDrawer(true); showLogin(''); }

async function showLogin(msg) {
  closeModal(); closePop();
  $('#app').innerHTML = `
    <div class="login"><form class="login-card" id="loginForm" autocomplete="off">
      ${logoHTML()}
      <div class="login-title">BOARD <span class="pill pill-alpha">Alpha</span></div>
      <div class="alpha-note" id="alphaNote"><b>Alpha build ${APP_VERSION}.</b> Things will change and break. Data is a test copy while we trial it.</div>
      <div class="field"><span class="lbl">Name</span><input class="inp" id="lgUser" name="user" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <div class="field"><span class="lbl">Passcode</span><input class="inp" id="lgPass" name="pass" type="password" autocomplete="new-password"></div>
      <div class="login-err" id="lgErr">${esc(msg || '')}</div>
      <button class="btn btn-primary" type="submit" id="lgBtn">Enter</button>
    </form></div>`;
  document.title = 'BOARD (alpha)';
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault(); const b = $('#lgBtn'); b.disabled = true; $('#lgErr').textContent = '';
    try {
      const d = await fetchLogin($('#lgUser').value, $('#lgPass').value);
      S.token = d.token; store.set('board_token', d.token); await loadApp();
    } catch (err) { $('#lgErr').textContent = err.message; b.disabled = false; }
  });
  if (!API) { $('#alphaNote').innerHTML = '<b>No backend connected.</b> Paste your Apps Script web app URL into <code>API_URL</code> at the top of index.html.'; return; }
  try {
    const r = await fetch(API + (API.includes('?') ? '&' : '?') + 'action=ping').then(x => x.json());
    if (r && r.alpha_open) $('#alphaNote').innerHTML = `<b>Alpha build ${APP_VERSION}.</b> Things will change and break. Leave both boxes empty and press Enter to come in.`;
  } catch (e) {}
}
async function fetchLogin(user, pass) {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'login', user, pass }) }).catch(() => { throw new Error('Cannot reach the server'); });
  const d = await res.json(); if (!d.ok) throw new Error(d.error || 'Could not sign in'); return d;
}

async function loadApp() {
  $('#app').innerHTML = `<div class="skeleton"><div>${logoHTML()}</div>Loading BOARD</div>`;
  const d = await api('bootstrap'); applyBootstrap(d);
  renderShell(); setSync('saved');
  if (!location.hash || location.hash === '#') location.hash = '#/pipeline'; else route();
  route();
}

/* ---------------- boot ---------------- */
async function boot() {
  const q = new URLSearchParams(location.search);
  if (q.get('view') === 'live' && q.get('k')) { return startReadonly(q.get('k')); }
  S.token = store.get('board_token');
  if (S.token && API) { try { await loadApp(); return; } catch (e) { S.token = null; store.del('board_token'); } }
  showLogin('');
}
