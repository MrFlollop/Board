/**
 * BOARD backend  |  v0.1.0-alpha
 * Sunday Treat project board. Google Apps Script web app, bound to the
 * "BOARD. Database" sheet.
 *
 * Deploy:  Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone
 * First run: select setup() in the editor and press Run (authorise when asked).
 *
 * Every request is JSON. The front end POSTs text/plain (no CORS preflight):
 *   { "action": "...", "token": "...", ...params }
 * Every response is { ok: true, ... } or { ok: false, error: "..." }.
 */

var APP_VERSION = '0.1.0-alpha';
var CODES_SPREADSHEET_ID = '1HUmi5xJO3sFPkiaPvR7QWMH54rE_ztv7-9qnIf1qmWc'; // Project Code Generator
var TOKEN_DAYS = 14;

var PROJECT_COLS = ['id','name','client','client_code','project_code','stage','status','lead','creative','production','edit','start','end','budget','notes','sort','budget_recon','social','vimeo','website','deck','wash_up','referral','on_client_board','music_licensing','archive','size_location','fy','created_at','updated_at','updated_by'];
var ARCHIVE_COLS = ['id','name','client','client_code','fy','notes','budget_recon','social','vimeo','website','deck','wash_up','referral','on_client_board','music_licensing','archive','size_location','project_code','stage','status','lead','creative','production','edit','start','end','budget','sort','created_at','updated_at','updated_by','archived_at'];
var PEOPLE_COLS = ['id','name','initials','department','group','access','active','sort'];
var DEPT_COLS = ['id','name','colour','sort'];
var CONFIG_COLS = ['key','value'];

var NUM_COLS = { budget: 1, sort: 1 };
var LIST_COLS = { creative: 1, production: 1, edit: 1 };          // comma-separated person ids
var DATE_COLS = { start: 1, end: 1 };
var LOCKED_COLS = { id: 1, fy: 1, created_at: 1, updated_at: 1, updated_by: 1, archived_at: 1, sort: 1 };
var PUBLIC_HIDE = { budget: 1, notes: 1, project_code: 1, budget_recon: 1, social: 1, vimeo: 1, website: 1, deck: 1, wash_up: 1, referral: 1, on_client_board: 1, music_licensing: 1, archive: 1, size_location: 1, updated_by: 1 };

var RANK = { viewer: 0, editor: 1, admin: 2, superadmin: 3 };
var CONFIG_WRITABLE = { stages: 1, statuses: 1, closeout_fields: 1, closeout_options: 1, fy_start_month: 1, public_stages: 1, app_name: 1 };

var DEFAULT_CONFIG = {
  stages: ['Tendering', 'Pre-Production', 'Post Production', 'Internal Post Production', 'To Archive', 'Out Processing'],
  statuses: ['Tendering', 'Awaiting KO', 'Pre Production', 'Edit', 'Awaiting Client Feedback', 'To Be Archived'],
  closeout_fields: [['budget_recon','Budget Recon'],['social','Social'],['vimeo','Vimeo'],['website','Website'],['deck','Deck'],['wash_up','Wash-up'],['referral','Referral'],['on_client_board','On Client Board'],['music_licensing','Music Licensing'],['archive','Archive']],   // ten tracked items; size_location is a free-text field alongside them
  closeout_options: {
    budget_recon: ['Complete','In Progress','Stuck','n/a'], social: ['In Socials','In Progress','Stuck','n/a'], vimeo: ['Complete','In Progress','Stuck','n/a'],
    website: ['Complete','In Progress','Stuck','n/a'], deck: ['Complete','In Progress','Stuck','n/a'], wash_up: ['Complete','In Progress','Stuck','n/a'],
    referral: ['Complete','In Progress','Stuck','n/a'], on_client_board: ['On Client Referral Board','n/a'],
    music_licensing: ['ST Musicbed/Shutterstock','Client Provided','Freelancer Provided','N/A'], archive: ['Triple Lock','NAS Only','Freelancer - Awaiting Copy','n/a']
  },
  fy_start_month: 4,
  public_stages: ['Tendering', 'Pre-Production', 'Post Production', 'Internal Post Production'],
  app_name: 'BOARD',
  app_version: APP_VERSION
};

/* ------------------------------------------------------------------ */
/* Entry points                                                         */
/* ------------------------------------------------------------------ */

function doGet(e) {
  return respond_(function () {
    var p = (e && e.parameter) || {};
    if (p.action === 'public_live') return publicLive_(p.key);
    return ping_();
  });
}

function doPost(e) {
  return respond_(function () {
    var req = {};
    try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (err) { throw new Error('Bad JSON'); }
    return route_(req);
  });
}

function respond_(fn) {
  var out;
  try { out = fn(); }
  catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// action -> [minimum rank, isWrite, handler]
var ACTIONS = {
  me:               [0, false, function (c) { return { ok: true, me: pubPerson_(c.me), version: getVersion_() }; }],
  version:          [0, false, function (c) { return { ok: true, version: getVersion_() }; }],
  bootstrap:        [0, false, bootstrap_],
  archive_list:     [0, false, archiveList_],
  clients:          [0, false, clients_],
  client_suggest:   [1, false, clientSuggest_],
  feedback:         [0, false, feedback_],
  health:           [2, false, health_],

  project_save:     [1, true, projectSave_],
  project_move:     [1, true, projectMove_],
  project_order:    [1, true, projectOrder_],
  project_archive:  [1, true, projectArchive_],
  archive_restore:  [1, true, archiveRestore_],
  project_delete:   [2, true, projectDelete_],
  client_add:       [1, true, clientAdd_],

  person_save:      [2, true, personSave_],
  person_delete:    [2, true, personDelete_],
  dept_save:        [2, true, deptSave_],
  dept_delete:      [2, true, deptDelete_],
  config_save:      [2, true, configSave_],
  readonly_rotate:  [2, true, readonlyRotate_],
  alpha_open_set:   [3, true, alphaOpenSet_]
};

function route_(req) {
  var action = String(req.action || '');
  if (action === 'ping') return ping_();
  if (action === 'login') return login_(req);
  if (action === 'public_live') return publicLive_(req.key);

  var def = ACTIONS[action];
  if (!def) throw new Error('Unknown action: ' + action);

  var me = authenticate_(req.token);
  if (rank_(me) < def[0]) throw new Error('You do not have permission to do that');

  var ctx = { me: me, req: req };
  if (!def[1]) return def[2](ctx);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var res = def[2](ctx);
    bumpVersion_();
    res.version = getVersion_();
    return res;
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Auth                                                                 */
/* ------------------------------------------------------------------ */

function ping_() {
  return { ok: true, app: 'BOARD', server_version: APP_VERSION, alpha_open: prop_('ALPHA_OPEN') === 'true', version: getVersion_() };
}

function login_(req) {
  var user = String(req.user || '').trim();
  var pass = String(req.pass || '');
  var people = table_('People').rows;
  var person = null;

  if (!user && !pass) {
    if (prop_('ALPHA_OPEN') !== 'true') throw new Error('Enter your name and passcode');
    person = findPerson_(people, 'oc') || people.filter(function (p) { return p.access === 'superadmin'; })[0];
  } else {
    var u = user.toLowerCase();
    person = people.filter(function (p) {
      return p.active !== false && (p.id.toLowerCase() === u || String(p.initials).toLowerCase() === u || String(p.name).toLowerCase() === u);
    })[0];
    var codes = JSON.parse(prop_('PASSCODES') || '{}');
    var ok = person && codes[person.id] && safeEq_(String(codes[person.id]), pass);
    if (!ok) { Utilities.sleep(800); throw new Error('Name or passcode not recognised'); }
  }
  if (!person || person.active === false) throw new Error('No active user found');
  return { ok: true, token: makeToken_(person.id), me: pubPerson_(person) };
}

function authenticate_(token) {
  var secret = prop_('SECRET');
  if (!secret) throw new Error('Backend not set up. Run setup() once in the Apps Script editor.');
  token = String(token || '');
  var parts = token.split('.');
  if (parts.length !== 2) throw new Error('AUTH');
  if (!safeEq_(sign_(parts[0]), parts[1])) throw new Error('AUTH');
  var payload;
  try { payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(pad_(parts[0]))).getDataAsString()); }
  catch (err) { throw new Error('AUTH'); }
  if (!payload || payload.e < Date.now() || String(payload.g) !== String(prop_('TOKEN_EPOCH') || '1')) throw new Error('AUTH');
  var person = findPerson_(table_('People').rows, payload.u);
  if (!person || person.active === false) throw new Error('AUTH');
  return person;
}

function makeToken_(uid) {
  var payload = { u: uid, e: Date.now() + TOKEN_DAYS * 86400000, g: String(prop_('TOKEN_EPOCH') || '1') };
  var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8).replace(/=+$/, '');
  return body + '.' + sign_(body);
}

function sign_(str) {
  var sig = Utilities.computeHmacSha256Signature(str, prop_('SECRET'));
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');
}

function pad_(s) { while (s.length % 4) s += '='; return s; }

function safeEq_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function rank_(p) { return RANK[String(p.access || 'viewer').toLowerCase()] || 0; }
function findPerson_(rows, id) { return rows.filter(function (p) { return p.id === id; })[0] || null; }

function pubPerson_(p) {
  return { id: p.id, name: p.name, initials: p.initials, department: p.department, group: p.group, access: p.access, active: p.active !== false, sort: p.sort, rank: rank_(p) };
}

/* ------------------------------------------------------------------ */
/* Sheet helpers                                                        */
/* ------------------------------------------------------------------ */

var MEMO_ = {};

function ss_() {
  var id = prop_('SS_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function setProp_(k, v) { PropertiesService.getScriptProperties().setProperty(k, String(v)); }
function tz_() { return ss_().getSpreadsheetTimeZone() || 'Europe/London'; }
function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'); }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

function norm_(v, header) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  if (NUM_COLS[header]) {
    if (v === '' || v === null) return '';
    var n = Number(v);
    return isNaN(n) ? '' : n;
  }
  if (header === 'active') return !(v === false || /^false$/i.test(String(v)));
  if (typeof v === 'number') return String(v);
  return v === null || v === undefined ? '' : (typeof v === 'string' ? v : String(v));
}

/** Reads a tab into {sh, headers, rows[{_row, ...}]} (memoised per request). */
function table_(name) {
  if (MEMO_[name]) return MEMO_[name];
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab: ' + name + '. Run setup().');
  var lastR = sh.getLastRow(), lastC = sh.getLastColumn();
  var t = { sh: sh, headers: [], rows: [], lastRow: lastR };
  if (lastR < 1 || lastC < 1) return (MEMO_[name] = t);
  var vals = sh.getRange(1, 1, lastR, lastC).getValues();
  t.headers = vals[0].map(function (h) { return String(h).trim(); });
  for (var r = 1; r < vals.length; r++) {
    if (vals[r][0] === '' || vals[r][0] === null) continue;
    var o = { _row: r + 1 };
    for (var c = 0; c < t.headers.length; c++) if (t.headers[c]) o[t.headers[c]] = norm_(vals[r][c], t.headers[c]);
    t.rows.push(o);
  }
  return (MEMO_[name] = t);
}
function drop_(name) { delete MEMO_[name]; }

function rowArray_(t, obj) {
  return t.headers.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) return v.join(',');
    return v;
  });
}

function formatsFor_(t) {
  return t.headers.map(function (h) { return NUM_COLS[h] ? 'General' : '@'; });
}

function writeRow_(t, rowNum, obj) {
  var arr = rowArray_(t, obj);
  var rng = t.sh.getRange(rowNum, 1, 1, arr.length);
  rng.setNumberFormats([formatsFor_(t)]);
  rng.setValues([arr]);
}

function appendRow_(t, obj) {
  var rowNum = Math.max(t.sh.getLastRow(), 1) + 1;
  writeRow_(t, rowNum, obj);
  return rowNum;
}

/** Sets one column for several rows in a single write. updates = { rowNum: value }. */
function setColumn_(t, header, updates) {
  var idx = t.headers.indexOf(header);
  if (idx < 0) throw new Error('Column missing: ' + header);
  var n = t.sh.getLastRow() - 1;
  if (n < 1) return;
  var rng = t.sh.getRange(2, idx + 1, n, 1);
  var vals = rng.getValues();
  Object.keys(updates).forEach(function (rowNum) { vals[Number(rowNum) - 2][0] = updates[rowNum]; });
  if (!NUM_COLS[header]) rng.setNumberFormat('@');
  rng.setValues(vals);
}

function getVersion_() { return Number(prop_('VERSION') || 1); }
function bumpVersion_() { setProp_('VERSION', getVersion_() + 1); }

function slug_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12); }
function uid_(prefix, taken) {
  var id;
  do { id = prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 6); } while (taken[id]);
  return id;
}

/* ------------------------------------------------------------------ */
/* Config, people, departments                                          */
/* ------------------------------------------------------------------ */

function config_() {
  var cfg = {};
  Object.keys(DEFAULT_CONFIG).forEach(function (k) { cfg[k] = DEFAULT_CONFIG[k]; });
  table_('Config').rows.forEach(function (r) {
    var v = r.value;
    if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { v = JSON.parse(v); } catch (err) {} }
    if (r.key === 'fy_start_month') v = Number(v) || 4;
    cfg[r.key] = v;
  });
  cfg.app_version = APP_VERSION;
  return cfg;
}

function peopleList_(includeFlags) {
  var codes = includeFlags ? JSON.parse(prop_('PASSCODES') || '{}') : {};
  return table_('People').rows.map(function (p) {
    var o = pubPerson_(p);
    if (includeFlags) o.has_passcode = !!codes[p.id];
    return o;
  }).sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
}

function deptList_() {
  return table_('Departments').rows.map(function (d) { return { id: d.id, name: d.name, colour: d.colour, sort: d.sort }; })
    .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
}

/* ------------------------------------------------------------------ */
/* Projects                                                             */
/* ------------------------------------------------------------------ */

function toProject_(r, stageOverride) {
  var o = {};
  Object.keys(r).forEach(function (k) { if (k !== '_row') o[k] = r[k]; });
  Object.keys(LIST_COLS).forEach(function (k) {
    o[k] = String(o[k] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  });
  if (stageOverride) o.stage = stageOverride;
  return o;
}

function projectList_() {
  return table_('Projects').rows.map(function (r) { return toProject_(r); })
    .sort(function (a, b) { return (a.sort === '' ? 1e9 : a.sort) - (b.sort === '' ? 1e9 : b.sort); });
}

function bootstrap_(c) {
  var cfg = config_();
  var admin = rank_(c.me) >= 2;
  var out = {
    ok: true,
    me: pubPerson_(c.me),
    people: peopleList_(admin),
    departments: deptList_(),
    config: cfg,
    projects: projectList_(),
    version: getVersion_(),
    server_version: APP_VERSION,
    server_time: now_()
  };
  if (admin) { out.readonly_key = prop_('READONLY_KEY') || ''; out.alpha_open = prop_('ALPHA_OPEN') === 'true'; }
  return out;
}

function archiveList_(c) {
  var r = c.req || {};
  var t = table_('Archive');
  var q = String(r.q || '').toLowerCase().trim();
  var fy = String(r.fy || '');
  var client = String(r.client || '');
  var rows = t.rows;
  var fys = {}, clients = {};
  rows.forEach(function (x) { if (x.fy) fys[x.fy] = 1; if (x.client) clients[x.client] = 1; });
  var filtered = rows.filter(function (x) {
    if (fy && x.fy !== fy) return false;
    if (client && x.client !== client) return false;
    if (!q) return true;
    return (x.name + ' ' + x.client + ' ' + x.client_code + ' ' + x.notes + ' ' + x.size_location + ' ' + x.project_code).toLowerCase().indexOf(q) >= 0;
  });
  // newest first (archive ids ascend with the sheet order; imported rows are already newest first)
  var total = filtered.length;
  var offset = Math.max(0, Number(r.offset) || 0);
  var limit = Math.min(500, Math.max(1, Number(r.limit) || 100));
  return {
    ok: true,
    total: total,
    offset: offset,
    rows: filtered.slice(offset, offset + limit).map(function (x) { return toProject_(x, 'Archived'); }),
    fys: Object.keys(fys).sort().reverse(),
    clients: Object.keys(clients).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; })
  };
}

function fyLabel_(dateStr, startMonth) {
  var m = /^(\d{4})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return '';
  var y = Number(m[1]), mo = Number(m[2]);
  var s = mo >= startMonth ? y : y - 1;
  var p = function (n) { return ('0' + (n % 100)).slice(-2); };
  return p(s) + '/' + p(s + 1);
}

function cleanDate_(v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Dates must be yyyy-mm-dd');
  return v;
}

function applyFields_(target, fields, cols) {
  Object.keys(fields || {}).forEach(function (k) {
    if (cols.indexOf(k) < 0 || LOCKED_COLS[k]) return;
    var v = fields[k];
    if (LIST_COLS[k]) v = (Array.isArray(v) ? v : String(v || '').split(',')).map(function (s) { return String(s).trim(); }).filter(Boolean).join(',');
    else if (DATE_COLS[k]) v = cleanDate_(v);
    else if (NUM_COLS[k]) { v = (v === '' || v === null || v === undefined) ? '' : Number(v); if (v !== '' && isNaN(v)) throw new Error('Budget must be a number'); }
    else v = v === null || v === undefined ? '' : String(v);
    target[k] = v;
  });
}

function nextSort_(rows, stage) {
  var max = 0;
  rows.forEach(function (r) { if (r.stage === stage && r.sort !== '' && r.sort > max) max = r.sort; });
  return max + 10;
}

function projectSave_(c) {
  var r = c.req;
  var fields = r.fields || r.project || {};
  var from = r.from === 'archive' ? 'Archive' : 'Projects';
  var cols = from === 'Archive' ? ARCHIVE_COLS : PROJECT_COLS;
  var t = table_(from);
  var cfg = config_();
  var id = String(r.id || fields.id || '');
  var existing = id ? t.rows.filter(function (x) { return x.id === id; })[0] : null;
  var stamp = now_();

  if (!existing) {
    if (from === 'Archive') throw new Error('Archive record not found');
    if (!String(fields.name || '').trim()) throw new Error('A project needs a name');
    var taken = {}; t.rows.forEach(function (x) { taken[x.id] = 1; });
    var obj = { id: uid_('p', taken), created_at: stamp };
    applyFields_(obj, fields, cols);
    obj.stage = obj.stage || cfg.stages[0];
    obj.sort = nextSort_(t.rows, obj.stage);
    obj.fy = fyLabel_(obj.end || obj.start || today_(), cfg.fy_start_month);
    obj.updated_at = stamp; obj.updated_by = c.me.id;
    appendRow_(t, obj);
    drop_(from);
    return { ok: true, project: toProject_(obj) };
  }

  var next = {};
  Object.keys(existing).forEach(function (k) { if (k !== '_row') next[k] = existing[k]; });
  applyFields_(next, fields, cols);
  if (fields.end !== undefined || fields.start !== undefined) {
    var f = fyLabel_(next.end || next.start, cfg.fy_start_month);
    if (f) next.fy = f;
  }
  next.updated_at = stamp; next.updated_by = c.me.id;
  writeRow_(t, existing._row, next);
  drop_(from);
  return { ok: true, project: toProject_(next, from === 'Archive' ? 'Archived' : null) };
}

function projectMove_(c) {
  var r = c.req;
  var stage = String(r.stage || '').trim();
  if (!stage) throw new Error('Stage required');
  var t = table_('Projects');
  var p = t.rows.filter(function (x) { return x.id === r.id; })[0];
  if (!p) throw new Error('Project not found');
  var stamp = now_();
  var stageUp = {}, sortUp = {}, atUp = {}, byUp = {};
  stageUp[p._row] = stage; atUp[p._row] = stamp; byUp[p._row] = c.me.id;
  if (r.ids && r.ids.length) {
    var byId = {}; t.rows.forEach(function (x) { byId[x.id] = x; });
    r.ids.forEach(function (id, i) { if (byId[id]) sortUp[byId[id]._row] = (i + 1) * 10; });
    if (sortUp[p._row] === undefined) sortUp[p._row] = nextSort_(t.rows, stage);
  } else {
    sortUp[p._row] = nextSort_(t.rows, stage);
  }
  setColumn_(t, 'stage', stageUp);
  setColumn_(t, 'sort', sortUp);
  setColumn_(t, 'updated_at', atUp);
  setColumn_(t, 'updated_by', byUp);
  drop_('Projects');
  return { ok: true };
}

function projectOrder_(c) {
  var ids = c.req.ids || [];
  var t = table_('Projects');
  var byId = {}; t.rows.forEach(function (x) { byId[x.id] = x; });
  var up = {};
  ids.forEach(function (id, i) { if (byId[id]) up[byId[id]._row] = (i + 1) * 10; });
  setColumn_(t, 'sort', up);
  drop_('Projects');
  return { ok: true };
}

function projectArchive_(c) {
  var t = table_('Projects');
  var p = t.rows.filter(function (x) { return x.id === c.req.id; })[0];
  if (!p) throw new Error('Project not found');
  var cfg = config_();
  var a = table_('Archive');
  var obj = {};
  ARCHIVE_COLS.forEach(function (k) { if (p[k] !== undefined) obj[k] = p[k]; });
  obj.archived_at = today_();
  obj.fy = fyLabel_(p.end || obj.archived_at, cfg.fy_start_month);
  obj.updated_at = now_(); obj.updated_by = c.me.id;
  appendRow_(a, obj);
  t.sh.deleteRow(p._row);
  drop_('Projects'); drop_('Archive');
  return { ok: true, id: p.id };
}

function archiveRestore_(c) {
  var a = table_('Archive');
  var row = a.rows.filter(function (x) { return x.id === c.req.id; })[0];
  if (!row) throw new Error('Archive record not found');
  var cfg = config_();
  var t = table_('Projects');
  var obj = {};
  PROJECT_COLS.forEach(function (k) { if (row[k] !== undefined) obj[k] = row[k]; });
  var stage = String(c.req.stage || '').trim();
  if (!stage) stage = (row.stage && row.stage !== 'Archived' && cfg.stages.indexOf(row.stage) >= 0) ? row.stage : 'Out Processing';
  var taken = {}; t.rows.forEach(function (x) { taken[x.id] = 1; });
  if (!obj.id || taken[obj.id]) obj.id = uid_('p', taken);
  obj.stage = stage;
  obj.sort = nextSort_(t.rows, stage);
  obj.updated_at = now_(); obj.updated_by = c.me.id;
  appendRow_(t, obj);
  a.sh.deleteRow(row._row);
  drop_('Projects'); drop_('Archive');
  return { ok: true, project: toProject_(obj) };
}

function projectDelete_(c) {
  var from = c.req.from === 'archive' ? 'Archive' : 'Projects';
  var t = table_(from);
  var p = t.rows.filter(function (x) { return x.id === c.req.id; })[0];
  if (!p) throw new Error('Not found');
  t.sh.deleteRow(p._row);
  drop_(from);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* People, departments, config                                          */
/* ------------------------------------------------------------------ */

function personSave_(c) {
  var r = c.req.person || {};
  var t = table_('People');
  var access = String(r.access || '').toLowerCase();
  if (access && RANK[access] === undefined) throw new Error('Unknown access level');
  var actorSuper = rank_(c.me) >= 3;
  if (access === 'superadmin' && !actorSuper) throw new Error('Only a super admin can grant super admin');

  var existing = r.id ? t.rows.filter(function (x) { return x.id === r.id; })[0] : null;
  if (existing && RANK[String(existing.access).toLowerCase()] >= 3 && !actorSuper) throw new Error('Only a super admin can edit a super admin');

  var obj;
  if (existing) {
    obj = {}; Object.keys(existing).forEach(function (k) { if (k !== '_row') obj[k] = existing[k]; });
  } else {
    if (!String(r.name || '').trim()) throw new Error('Name required');
    var taken = {}; t.rows.forEach(function (x) { taken[x.id] = 1; });
    var base = slug_(r.initials) || slug_(r.name).slice(0, 3) || 'user';
    var id = base, n = 2;
    while (taken[id]) id = base + n++;
    obj = { id: id, access: 'editor', active: true, sort: (t.rows.reduce(function (m, x) { return Math.max(m, x.sort || 0); }, 0) + 1) };
  }
  ['name', 'department', 'group'].forEach(function (k) { if (r[k] !== undefined) obj[k] = String(r[k]).trim(); });
  if (r.initials !== undefined) obj.initials = String(r.initials).trim().toUpperCase().slice(0, 3);
  if (!obj.initials) obj.initials = String(obj.name || '').split(/\s+/).map(function (s) { return s.charAt(0); }).join('').toUpperCase().slice(0, 2);
  if (access) obj.access = access;
  if (r.active !== undefined) obj.active = !!r.active;
  if (r.sort !== undefined && r.sort !== '') obj.sort = Number(r.sort) || 0;

  if (existing) writeRow_(t, existing._row, obj); else appendRow_(t, obj);
  drop_('People');

  if (r.passcode !== undefined) {
    var codes = JSON.parse(prop_('PASSCODES') || '{}');
    if (String(r.passcode) === '') delete codes[obj.id]; else codes[obj.id] = String(r.passcode);
    setProp_('PASSCODES', JSON.stringify(codes));
  }
  return { ok: true, people: peopleList_(true) };
}

function personDelete_(c) {
  var t = table_('People');
  var p = t.rows.filter(function (x) { return x.id === c.req.id; })[0];
  if (!p) throw new Error('Not found');
  if (p.id === c.me.id) throw new Error('You cannot delete yourself');
  if (RANK[String(p.access).toLowerCase()] >= 3 && rank_(c.me) < 3) throw new Error('Only a super admin can delete a super admin');
  t.sh.deleteRow(p._row);
  drop_('People');
  var codes = JSON.parse(prop_('PASSCODES') || '{}');
  delete codes[p.id];
  setProp_('PASSCODES', JSON.stringify(codes));
  return { ok: true, people: peopleList_(true) };
}

function deptSave_(c) {
  var r = c.req.department || {};
  var t = table_('Departments');
  var existing = r.id ? t.rows.filter(function (x) { return x.id === r.id; })[0] : null;
  var obj;
  if (existing) { obj = {}; Object.keys(existing).forEach(function (k) { if (k !== '_row') obj[k] = existing[k]; }); }
  else {
    if (!String(r.name || '').trim()) throw new Error('Name required');
    var taken = {}; t.rows.forEach(function (x) { taken[x.id] = 1; });
    var base = slug_(r.name) || 'dept', id = base, n = 2;
    while (taken[id]) id = base + n++;
    obj = { id: id, sort: t.rows.reduce(function (m, x) { return Math.max(m, x.sort || 0); }, 0) + 1 };
  }
  if (r.name !== undefined) obj.name = String(r.name).trim();
  if (r.colour !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(r.colour))) throw new Error('Colour must be a hex value like #FF50BD');
    obj.colour = String(r.colour).toUpperCase();
  }
  if (r.sort !== undefined && r.sort !== '') obj.sort = Number(r.sort) || 0;
  if (existing) writeRow_(t, existing._row, obj); else appendRow_(t, obj);
  drop_('Departments');
  return { ok: true, departments: deptList_() };
}

function deptDelete_(c) {
  var t = table_('Departments');
  var d = t.rows.filter(function (x) { return x.id === c.req.id; })[0];
  if (!d) throw new Error('Not found');
  var inUse = table_('People').rows.some(function (p) { return p.department === d.id; });
  if (inUse) throw new Error('People are still in this department. Move them first.');
  t.sh.deleteRow(d._row);
  drop_('Departments');
  return { ok: true, departments: deptList_() };
}

function configSave_(c) {
  var key = String(c.req.key || '');
  if (!CONFIG_WRITABLE[key]) throw new Error('That setting cannot be changed here');
  var v = c.req.value;
  if (key === 'fy_start_month') { v = Number(v); if (!(v >= 1 && v <= 12)) throw new Error('Month must be 1 to 12'); }
  if (key === 'stages' || key === 'statuses' || key === 'public_stages') {
    if (!Array.isArray(v) || !v.length) throw new Error('Needs at least one value');
    v = v.map(function (s) { return String(s).trim(); }).filter(Boolean);
  }
  var t = table_('Config');
  var row = t.rows.filter(function (x) { return x.key === key; })[0];
  var stored = (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v);
  var obj = { key: key, value: stored };
  if (row) writeRow_(t, row._row, obj); else appendRow_(t, obj);
  drop_('Config');
  return { ok: true, config: config_() };
}

function readonlyRotate_(c) {
  setProp_('READONLY_KEY', randomKey_(24));
  return { ok: true, readonly_key: prop_('READONLY_KEY') };
}

function alphaOpenSet_(c) {
  setProp_('ALPHA_OPEN', c.req.value ? 'true' : 'false');
  return { ok: true, alpha_open: prop_('ALPHA_OPEN') === 'true' };
}

/* ------------------------------------------------------------------ */
/* Public read-only live view                                           */
/* ------------------------------------------------------------------ */

function publicLive_(key) {
  var expect = prop_('READONLY_KEY');
  if (!expect || expect.length < 16 || !key || !safeEq_(expect, String(key))) throw new Error('This link is not valid');
  var cfg = config_();
  var stages = cfg.public_stages || [];
  var projects = projectList_().filter(function (p) { return stages.indexOf(p.stage) >= 0; }).map(function (p) {
    var o = {};
    Object.keys(p).forEach(function (k) { if (!PUBLIC_HIDE[k]) o[k] = p[k]; });
    return o;
  });
  return {
    ok: true,
    stages: stages,
    statuses: cfg.statuses,
    projects: projects,
    people: peopleList_(false).map(function (p) { return { id: p.id, name: p.name, initials: p.initials, department: p.department, active: p.active }; }),
    departments: deptList_(),
    version: getVersion_(),
    generated_at: now_()
  };
}

/* ------------------------------------------------------------------ */
/* Client codes (Project Code Generator sheet, "Codes" tab)             */
/* ------------------------------------------------------------------ */

function codesSheet_() {
  var ss = SpreadsheetApp.openById(CODES_SPREADSHEET_ID);
  var sh = ss.getSheetByName('Codes') || ss.getSheets()[0];
  return sh;
}

function readClients_() {
  var sh = codesSheet_();
  var last = sh.getLastRow();
  if (last < 1) return { sh: sh, list: [] };
  var vals = sh.getRange(1, 1, last, 2).getValues();
  var seen = {}, list = [];
  vals.forEach(function (row, i) {
    var name = String(row[0] || '').trim();
    var code = String(row[1] || '').trim().toUpperCase();
    if (!name) return;
    if (i === 0 && !/^[A-Z0-9]{3,8}$/.test(code)) return; // genuine header row
    if (!code) return;
    var k = name.toLowerCase();
    if (seen[k]) return;
    seen[k] = 1;
    list.push({ name: name, code: code });
  });
  list.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
  return { sh: sh, list: list };
}

function clients_() { return { ok: true, clients: readClients_().list }; }

function suggestCode_(name, list) {
  var base = String(name || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!base) return '';
  var taken = {}; list.forEach(function (c) { taken[c.code] = 1; });
  var code = base;
  while (code.length < 5) code += base.charAt(base.length - 1);
  code = code.slice(0, 5);
  if (!taken[code]) return code;
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (var i = 0; i < alphabet.length; i++) {
    var c2 = code.slice(0, 4) + alphabet.charAt(i);
    if (!taken[c2]) return c2;
  }
  return code;
}

function clientSuggest_(c) {
  var list = readClients_().list;
  return { ok: true, code: suggestCode_(c.req.name, list) };
}

function clientAdd_(c) {
  var name = String(c.req.name || '').trim();
  if (!name || name.length > 80) throw new Error('Client name needed (80 characters max)');
  var rc = readClients_();
  var code = String(c.req.code || '').trim().toUpperCase() || suggestCode_(name, rc.list);
  if (!/^[A-Z0-9]{3,8}$/.test(code)) throw new Error('Code must be 3 to 8 letters or numbers');
  var dupName = rc.list.filter(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })[0];
  if (dupName) throw new Error('That client already exists (' + dupName.code + ')');
  var dupCode = rc.list.filter(function (x) { return x.code === code; })[0];
  if (dupCode) throw new Error('Code ' + code + ' is already used by ' + dupCode.name);
  var row = Math.max(rc.sh.getLastRow(), 1) + 1;
  var rng = rc.sh.getRange(row, 1, 1, 2);
  rng.setNumberFormat('@');
  rng.setValues([[name, code]]);
  SpreadsheetApp.flush();
  return { ok: true, client: { name: name, code: code }, clients: readClients_().list };
}

/* ------------------------------------------------------------------ */
/* Feedback and health                                                  */
/* ------------------------------------------------------------------ */

function feedback_(c) {
  var r = c.req;
  var msg = String(r.message || '').trim();
  if (!msg) throw new Error('Write something first');
  var to = prop_('FEEDBACK_TO');
  if (!to) throw new Error('FEEDBACK_TO is not set');
  var kind = String(r.kind || 'Feedback').slice(0, 30);
  MailApp.sendEmail({
    to: to,
    subject: '[BOARD alpha] ' + kind + ' from ' + c.me.name,
    body: msg + '\n\n---\nFrom: ' + c.me.name + ' (' + c.me.id + ')\nView: ' + String(r.view || '') + '\nVersion: ' + String(r.client_version || '') + ' / server ' + APP_VERSION +
      '\nDevice: ' + String(r.ua || '').slice(0, 200) + '\nTime: ' + now_()
  });
  return { ok: true };
}

function health_(c) {
  var out = { ok: true, server_version: APP_VERSION, version: getVersion_(), tabs: {}, secret_set: !!prop_('SECRET'), readonly_key_set: !!prop_('READONLY_KEY'), alpha_open: prop_('ALPHA_OPEN') === 'true', feedback_to: prop_('FEEDBACK_TO') || '', time_zone: tz_(), server_time: now_() };
  ['Projects', 'Archive', 'People', 'Departments', 'Config'].forEach(function (n) {
    try { out.tabs[n] = table_(n).rows.length; } catch (err) { out.tabs[n] = 'MISSING'; }
  });
  try { out.clients = readClients_().list.length; } catch (err) { out.clients = 'Cannot open the Project Code Generator sheet'; }
  return out;
}

/* ------------------------------------------------------------------ */
/* One-off setup. Run from the editor.                                  */
/* ------------------------------------------------------------------ */

function randomKey_(n) {
  var s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n);
}

function ensureTab_(ss, name, cols) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    Logger.log('Created tab ' + name);
    return sh;
  }
  var head = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
  var missing = cols.filter(function (c) { return head.indexOf(c) < 0; });
  if (missing.length) Logger.log('WARNING: ' + name + ' is missing columns: ' + missing.join(', '));
  return sh;
}

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  setProp_('SS_ID', ss.getId());
  ensureTab_(ss, 'Projects', PROJECT_COLS);
  ensureTab_(ss, 'Archive', ARCHIVE_COLS);
  ensureTab_(ss, 'People', PEOPLE_COLS);
  ensureTab_(ss, 'Departments', DEPT_COLS);
  var cfgSheet = ensureTab_(ss, 'Config', CONFIG_COLS);

  // Add any config keys that are missing (never overwrites existing values)
  var have = {};
  var last = cfgSheet.getLastRow();
  if (last > 1) cfgSheet.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { have[String(r[0])] = 1; });
  Object.keys(DEFAULT_CONFIG).forEach(function (k) {
    if (have[k]) return;
    var v = DEFAULT_CONFIG[k];
    var rng = cfgSheet.getRange(cfgSheet.getLastRow() + 1, 1, 1, 2);
    rng.setNumberFormat('@');
    rng.setValues([[k, (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v)]]);
  });

  if (!prop_('SECRET')) setProp_('SECRET', randomKey_(48));
  if (!prop_('READONLY_KEY')) setProp_('READONLY_KEY', randomKey_(24));
  if (!prop_('PASSCODES')) setProp_('PASSCODES', '{}');
  if (!prop_('ALPHA_OPEN')) setProp_('ALPHA_OPEN', 'true');
  if (!prop_('VERSION')) setProp_('VERSION', '1');
  if (!prop_('TOKEN_EPOCH')) setProp_('TOKEN_EPOCH', '1');
  if (!prop_('FEEDBACK_TO')) setProp_('FEEDBACK_TO', Session.getEffectiveUser().getEmail());

  // Touch the other services once so Google asks for every permission now, not later
  try { MailApp.getRemainingDailyQuota(); } catch (err) {}
  try { codesSheet_().getLastRow(); } catch (err) { Logger.log('Could not open the Project Code Generator sheet: ' + err.message); }

  Logger.log('BOARD backend ready (' + APP_VERSION + ').');
  Logger.log('Feedback emails go to: ' + prop_('FEEDBACK_TO'));
  Logger.log('Alpha open login (blank name and passcode = Oli): ' + prop_('ALPHA_OPEN'));
  Logger.log('Read-only key: ' + prop_('READONLY_KEY'));
}

/** Run if you ever need to sign everyone out. */
function signEveryoneOut() { setProp_('TOKEN_EPOCH', String(Number(prop_('TOKEN_EPOCH') || 1) + 1)); }

/** Shows the read-only key in the log. */
function showReadonlyKey() { Logger.log(prop_('READONLY_KEY')); }
