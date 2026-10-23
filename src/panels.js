/* ================================================================
   BOARD alpha. Panels: project drawer, modals, feedback, settings, read-only start
   ================================================================ */

/* ---------------- saving fields (debounced, optimistic) ---------------- */
const pendingSave = {}, flushers = {}, saveTimers = {};
function recordFor(id, from) { return from === 'archive' ? S.ar.rows.find(x => x.id === id) : projectById(id); }
function setDrawerSync(t) { const e = $('#dsync'); if (e) e.textContent = t; }
const bgRefresh = debounce(() => { if (['pipeline', 'timeline', 'closeout', 'mine', 'archive'].includes(S.view) && !typing()) { if (S.view === 'mine') renderView(); else rerenderBody(); } }, 250);

function saveFields(id, fields, from, immediate) {
  const p = recordFor(id, from); if (!p || !canEdit()) return;
  Object.assign(p, fields);
  const key = (from === 'archive' ? 'a:' : 'p:') + id;
  pendingSave[key] = Object.assign(pendingSave[key] || {}, fields);
  clearTimeout(saveTimers[key]);
  const run = () => {
    const f = pendingSave[key]; delete pendingSave[key]; delete flushers[key]; if (!f) return;
    write('project_save', { id, fields: f, from: from === 'archive' ? 'archive' : undefined }).then(res => {
      const r = recordFor(id, from); if (r && res.project) ['fy', 'updated_at', 'updated_by', 'created_at'].forEach(k => { r[k] = res.project[k]; });
      setDrawerSync('Saved');
    }).catch(() => setDrawerSync('Not saved'));
  };
  flushers[key] = run; setDrawerSync('Saving');
  if (immediate) run(); else saveTimers[key] = setTimeout(run, 600);
  bgRefresh();
}
function flushAll() { Object.keys(flushers).forEach(k => { clearTimeout(saveTimers[k]); flushers[k](); }); }
addEventListener('beforeunload', e => { if (Object.keys(flushers).length) { flushAll(); } });

/* ---------------- drawer ---------------- */
const clientNames = () => uniq((S.clients || []).map(c => c.name).concat(S.projects.map(p => p.client)).filter(Boolean)).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);

function pickerHTML(role, label, ids, ro) {
  const free = activePeople().filter(p => !ids.includes(p.id));
  return `<div class="field"><span class="lbl">${label}</span><div class="picks">
    ${ids.map(i => { const p = personById(i); return `<span class="pickchip">${av(i, 'av-sm')}${esc(p ? p.name : i)}${ro ? '' : `<button data-act="pf-rm" data-role="${role}" data-pid="${i}" title="Remove">&times;</button>`}</span>`; }).join('')}
    ${ro || !free.length ? '' : `<select class="sel sel-sm" data-chg="pf-add" data-role="${role}" style="width:auto"><option value="">+ Add</option>${free.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>`}
  </div></div>`;
}
function drawerHTML(p, arch) {
  const ro = !canEdit(), pub = S.readonly;
  const dis = ro ? 'disabled' : '';
  const inp = (f, label, val, extra = '') => `<div class="field"><span class="lbl">${label}</span><input class="inp" data-inp="pf" data-f="${f}" value="${esc(val)}" ${dis} ${extra}></div>`;
  const F = coFields(), opts = S.cfg.closeout_options || {};
  const updBy = personById(p.updated_by);
  return `
  <div class="drawer-head"><div><div class="lbl">${arch ? 'Archived project' : 'Project'}</div></div><span class="sp"></span><span class="muted" style="font-size:11px;font-weight:600" id="dsync"></span>
    <button class="icon-btn" data-act="closedrawer" title="Close"><i class="ti ti-x"></i></button></div>
  <div class="drawer-body" id="drawerBody">
    <input class="inp name-inp" data-inp="pf" data-f="name" value="${esc(p.name)}" ${dis} placeholder="Project name">
    <div class="grid2">
      <div class="field"><span class="lbl">Client</span><input class="inp" data-inp="pf" data-f="client" list="dlClients" value="${esc(p.client)}" ${dis}><datalist id="dlClients">${clientNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
      ${inp('client_code', 'Client code', p.client_code, 'style="text-transform:uppercase"')}
    </div>
    ${pub ? '' : `<div class="field"><span class="lbl">Project code</span><div class="row"><input class="inp" data-inp="pf" data-f="project_code" value="${esc(p.project_code)}" ${dis} placeholder="CLIENT_ProjectTitle">${ro ? '' : `<button class="btn btn-ghost btn-sm" data-act="genpc" title="Build from client code and name">Generate</button>`}</div></div>`}
    <div class="grid2">
      ${arch ? `<div class="field"><span class="lbl">Year</span><input class="inp" value="${esc(p.fy)}" disabled></div>` : `<div class="field"><span class="lbl">Stage</span><select class="sel" data-chg="pf-stage" ${dis}>${optList(S.cfg.stages, p.stage)}</select></div>`}
      <div class="field"><span class="lbl">Status</span><select class="sel" data-chg="pf" data-f="status" ${dis}>${optList(S.cfg.statuses.concat(p.status && !S.cfg.statuses.includes(p.status) ? [p.status] : []), p.status, '-')}</select></div>
    </div>
    <div class="field"><span class="lbl">Lead</span><select class="sel" data-chg="pf" data-f="lead" ${dis}>${personOpts(p.lead, '-')}</select></div>
    ${pickerHTML('creative', 'Creative', p.creative || [], ro)}${pickerHTML('production', 'Production', p.production || [], ro)}${pickerHTML('edit', 'Edit', p.edit || [], ro)}
    <div class="grid2">
      <div class="field"><span class="lbl">Start</span><input type="date" class="inp" data-chg="pf" data-f="start" value="${esc(p.start)}" ${dis}></div>
      <div class="field"><span class="lbl">End</span><input type="date" class="inp" data-chg="pf" data-f="end" value="${esc(p.end)}" ${dis}></div>
    </div>
    ${pub ? '' : `<div class="field"><span class="lbl">Budget (GBP)</span><input type="number" min="0" step="1" class="inp" data-inp="pf" data-f="budget" value="${p.budget === '' ? '' : esc(p.budget)}" ${dis}></div>
    <div class="field"><span class="lbl">Notes</span><textarea class="txt" data-inp="pf" data-f="notes" ${dis}>${esc(p.notes)}</textarea></div>
    <div class="sec-title"><span class="lbl">Closeout</span></div>
    <div class="grid2">${F.map(([k, l]) => { const list = (opts[k] || []).slice(); if (p[k] && !list.includes(p[k])) list.push(p[k]); return `<div class="field"><span class="lbl">${esc(l)}</span><select class="sel ${coClass(p[k])}" data-chg="pf" data-f="${k}" ${dis}>${optList(list, p[k], '-')}</select></div>`; }).join('')}</div>
    ${inp('size_location', 'Size + Location', p.size_location)}
    <div class="muted" style="font-size:11px">${p.created_at ? 'Created ' + esc(p.created_at) + '. ' : ''}${p.updated_at ? 'Last edit ' + esc(p.updated_at) + (updBy ? ' by ' + esc(updBy.name) : '') + '.' : ''}</div>`}
  </div>
  ${ro ? '' : `<div class="drawer-foot">
    ${arch ? `<button class="btn btn-secondary" data-act="restore" data-id="${p.id}"><i class="ti ti-arrow-back-up"></i>Restore to board</button>` : `<button class="btn btn-secondary" data-act="archive" data-id="${p.id}"><i class="ti ti-archive"></i>Send to Archive</button>`}
    <span class="sp"></span>${isAdmin() ? `<button class="btn btn-danger" data-act="delproject" data-id="${p.id}"><i class="ti ti-trash"></i>Delete</button>` : ''}</div>`}`;
}
function openDrawer(id, from) {
  const arch = from === 'archive', p = recordFor(id, arch ? 'archive' : null); if (!p) return;
  closeDrawer(true);
  S.drawer = id; S.drawerFrom = arch ? 'archive' : null;
  const sc = document.createElement('div'); sc.className = 'scrim'; sc.id = 'drawerScrim'; sc.addEventListener('click', () => closeDrawer());
  const d = document.createElement('aside'); d.className = 'drawer'; d.id = 'drawer'; d.innerHTML = drawerHTML(p, arch);
  document.body.appendChild(sc); document.body.appendChild(d);
  if (!S.readonly && !S.clients) loadClients().then(() => { if (S.drawer === id && !focusInDrawer()) refreshDrawer(); });
}
const focusInDrawer = () => { const a = document.activeElement; return !!(a && a.closest && a.closest('#drawer') && /^(INPUT|TEXTAREA)$/.test(a.tagName)); };
function refreshDrawer(force) {
  const d = $('#drawer'); if (!d || !S.drawer) return;
  const p = recordFor(S.drawer, S.drawerFrom);
  if (!p) { closeDrawer(true); toast('That project was moved or removed by someone else'); return; }
  if (!force && focusInDrawer()) return;
  const b = $('#drawerBody'), st = b ? b.scrollTop : 0;
  d.innerHTML = drawerHTML(p, S.drawerFrom === 'archive');
  const nb = $('#drawerBody'); if (nb) nb.scrollTop = st;
}
function closeDrawer(silent) {
  flushAll(); $('#drawer') && $('#drawer').remove(); $('#drawerScrim') && $('#drawerScrim').remove();
  S.drawer = null; S.drawerFrom = null; if (!silent) bgRefresh();
}
ACT.closedrawer = () => closeDrawer();

INP.pf = el => {
  const f = el.dataset.f, id = S.drawer, from = S.drawerFrom; if (!id) return;
  let v = el.value;
  if (f === 'budget') v = v === '' ? '' : Number(v);
  const fields = { [f]: v };
  if (f === 'client_code') { v = v.toUpperCase(); fields[f] = v; }
  if (f === 'client') { const c = findClient(v); if (c && c.name.toLowerCase() === v.trim().toLowerCase()) { fields.client_code = c.code; const i = $('[data-f="client_code"]', $('#drawer')); if (i) i.value = c.code; } }
  const textual = (el.tagName === 'INPUT' && el.type !== 'date') || el.tagName === 'TEXTAREA';
  saveFields(id, fields, from, !textual);
  if (el.tagName === 'SELECT' && /^(budget_recon|social|vimeo|website|deck|wash_up|referral|on_client_board|music_licensing|archive)$/.test(f)) el.className = 'sel ' + coClass(el.value);
};
INP['pf-stage'] = el => { if (S.drawerFrom === 'archive') return; moveProject(S.drawer, el.value); };
INP['pf-add'] = el => {
  if (!el.value) return; const role = el.dataset.role, p = recordFor(S.drawer, S.drawerFrom);
  saveFields(S.drawer, { [role]: (p[role] || []).concat(el.value) }, S.drawerFrom, true); refreshDrawer(true);
};
ACT['pf-rm'] = el => {
  const role = el.dataset.role, p = recordFor(S.drawer, S.drawerFrom);
  saveFields(S.drawer, { [role]: (p[role] || []).filter(x => x !== el.dataset.pid) }, S.drawerFrom, true); refreshDrawer(true);
};
ACT.genpc = () => {
  const p = recordFor(S.drawer, S.drawerFrom), code = genCode(p.client_code, p.name);
  if (!code) { toast('Needs a client code and a project name first', 'err'); return; }
  saveFields(S.drawer, { project_code: code }, S.drawerFrom, true);
  const i = $('[data-f="project_code"]', $('#drawer')); if (i) i.value = code;
};

/* ---------------- archive / restore / delete ---------------- */
ACT.archive = async el => {
  const id = el.dataset.id, p = projectById(id); if (!p) return;
  if (!await confirmBox(`Send "${p.name}" to the Archive? It will leave the board and live in the Archive.`, 'Send to Archive')) return;
  flushAll();
  try {
    await write('project_archive', { id });
    S.projects = S.projects.filter(x => x.id !== id); S.ar.loaded = false; S.ar.fys = [];
    if (S.drawer === id) closeDrawer(true);
    renderView(); toast('Sent to Archive');
  } catch (e) {}
};
ACT.restore = async el => {
  const id = el.dataset.id, p = recordFor(id, 'archive'); if (!p) return;
  if (!await confirmBox(`Put "${p.name}" back on the board?`, 'Restore')) return;
  flushAll();
  try {
    const d = await write('archive_restore', { id });
    S.projects.push(d.project); S.ar.rows = S.ar.rows.filter(x => x.id !== id); S.ar.total = Math.max(0, S.ar.total - 1);
    closeDrawer(true); renderView(); toast('Restored to ' + d.project.stage);
  } catch (e) {}
};
ACT.delproject = async el => {
  const id = el.dataset.id, from = S.drawerFrom, p = recordFor(id, from); if (!p) return;
  if (!await confirmBox(`Permanently delete "${p.name}"? This cannot be undone.`, 'Delete', true, 'Delete project')) return;
  try {
    await write('project_delete', { id, from: from === 'archive' ? 'archive' : undefined });
    if (from === 'archive') { S.ar.rows = S.ar.rows.filter(x => x.id !== id); S.ar.total--; } else S.projects = S.projects.filter(x => x.id !== id);
    closeDrawer(true); renderView(); toast('Deleted');
  } catch (e) {}
};

/* ---------------- new project ---------------- */
ACT.newproject = () => {
  if (!canEdit()) return;
  const m = openModal(`<h3>New project</h3>
    <div class="field"><span class="lbl">Project name</span><input class="inp" id="npName" placeholder="e.g. Brand film"></div>
    <div class="field"><span class="lbl">Client</span><input class="inp" id="npClient" list="npClients" autocomplete="off"><datalist id="npClients">${clientNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
    <div class="field"><span class="lbl">Stage</span><select class="sel" id="npStage">${optList(S.cfg.stages, S.cfg.stages[0])}</select></div>
    <div class="actions"><button class="btn btn-plain" data-act="closemodal">Cancel</button><button class="btn btn-primary" id="npGo">Create</button></div>`);
  if (!S.clients) loadClients();
  $('#npGo', m).onclick = async () => {
    const name = $('#npName', m).value.trim(); if (!name) { $('#npName', m).focus(); return; }
    const client = $('#npClient', m).value.trim(), c = findClient(client);
    $('#npGo', m).disabled = true;
    try {
      const d = await write('project_save', { fields: { name, client: c ? c.name : client, client_code: c ? c.code : '', stage: $('#npStage', m).value } });
      S.projects.push(d.project); closeModal(); renderView(); openDrawer(d.project.id); toast('Project created');
    } catch (e) { $('#npGo', m).disabled = false; }
  };
  m.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') $('#npGo', m).click(); });
};
ACT.closemodal = () => closeModal();

/* ---------------- feedback ---------------- */
ACT.feedback = () => {
  closePop();
  const m = openModal(`<h3>Send feedback</h3>
    <div class="muted">This is an alpha build. Tell Oli what is confusing, broken or missing. It arrives as an email with the page you were on.</div>
    <div class="field"><span class="lbl">Type</span><select class="sel" id="fbKind"><option>Feedback</option><option>Bug</option><option>Idea</option></select></div>
    <div class="field"><span class="lbl">Message</span><textarea class="txt" id="fbMsg" placeholder="What happened, or what would help?"></textarea></div>
    <div class="actions"><button class="btn btn-plain" data-act="closemodal">Cancel</button><button class="btn btn-primary" id="fbGo">Send</button></div>`);
  $('#fbGo', m).onclick = async () => {
    const message = $('#fbMsg', m).value.trim(); if (!message) { $('#fbMsg', m).focus(); return; }
    $('#fbGo', m).disabled = true;
    try {
      await api('feedback', { message, kind: $('#fbKind', m).value, view: S.view, client_version: APP_VERSION, ua: navigator.userAgent });
      closeModal(); toast('Thanks, feedback sent');
    } catch (e) { toast(e.message, 'err'); $('#fbGo', m).disabled = false; }
  };
};

/* ================================================================
   Settings (admin)
   ================================================================ */
const SET_TABS = [['people', 'People'], ['departments', 'Departments'], ['workflow', 'Workflow'], ['closeout', 'Closeout options'], ['clients', 'Clients'], ['system', 'System']];
function viewSettings() {
  return `<div class="tabs"><div class="seg" style="flex-wrap:wrap">${SET_TABS.map(([k, l]) => `<button data-act="settab" data-t="${k}" class="${S.settingsTab === k ? 'on' : ''}">${l}</button>`).join('')}</div></div><div id="vb">${settingsBody()}</div>`;
}
BODY.settings = settingsBody;
function settingsBody() {
  return `<div class="pad">${({ people: setPeople, departments: setDepts, workflow: setWorkflow, closeout: setCloseout, clients: setClients, system: setSystem }[S.settingsTab] || setPeople)()}</div>`;
}
ACT.settab = el => { S.settingsTab = el.dataset.t; renderView(); };
function settingsAfter() {
  if (S.settingsTab === 'system' && !S.health) loadHealth();
  if (S.settingsTab === 'clients') { if (!S.clients) loadClients(); if (!S.ar.loaded && !S.ar.loading) loadArchive(true); }
}
async function loadHealth() { try { S.health = await api('health'); } catch (e) { S.health = { error: e.message }; } if (S.view === 'settings' && S.settingsTab === 'system') rerenderBody(); }

/* ---- people ---- */
const ACCESS = ['viewer', 'editor', 'admin', 'superadmin'];
function setPeople() {
  const superMe = S.me.rank >= 3;
  return `<div class="row wrap" style="margin-bottom:12px"><div class="muted sp" style="min-width:240px">Add the team, set their department (this sets the circle colour) and what they can do. Deactivate instead of deleting so history keeps their initials.</div><button class="btn btn-primary" data-act="ppadd"><i class="ti ti-plus"></i>Add person</button></div>
  <table class="tbl" style="min-width:860px"><thead><tr><th></th><th>Name</th><th>Initials</th><th>Department</th><th>Access</th><th>Passcode</th><th>Active</th><th></th></tr></thead><tbody>
  ${S.people.map(p => { const locked = p.rank >= 3 && !superMe; const d = locked ? 'disabled' : '';
    return `<tr><td>${av(p.id, 'av-lg')}</td>
      <td><input class="inp" style="min-width:160px" value="${esc(p.name)}" data-chg="pp" data-id="${p.id}" data-k="name" ${d}></td>
      <td><input class="inp" style="width:64px;text-transform:uppercase" maxlength="3" value="${esc(p.initials)}" data-chg="pp" data-id="${p.id}" data-k="initials" ${d}></td>
      <td><select class="sel" data-chg="pp" data-id="${p.id}" data-k="department" ${d}>${S.depts.map(x => `<option value="${x.id}"${x.id === p.department ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
      <td><select class="sel" data-chg="pp" data-id="${p.id}" data-k="access" ${d}>${ACCESS.filter(a => a !== 'superadmin' || superMe || p.access === 'superadmin').map(a => `<option${a === p.access ? ' selected' : ''}>${a}</option>`).join('')}</select></td>
      <td><button class="btn btn-ghost btn-sm" data-act="ppass" data-id="${p.id}" ${d}>${p.has_passcode ? 'Change' : 'Set'}</button> <span class="muted" style="font-size:11px">${p.has_passcode ? 'set' : 'none'}</span></td>
      <td><input type="checkbox" class="toggle" data-chg="pp" data-id="${p.id}" data-k="active" ${p.active !== false ? 'checked' : ''} ${d}></td>
      <td>${p.id !== S.me.id && !locked ? `<button class="icon-btn" data-act="ppdel" data-id="${p.id}" title="Delete"><i class="ti ti-trash"></i></button>` : ''}</td></tr>`; }).join('')}
  </tbody></table>`;
}
INP.pp = el => {
  const id = el.dataset.id, k = el.dataset.k, p = personById(id); if (!p) return;
  let v = el.type === 'checkbox' ? el.checked : el.value; if (k === 'initials') v = v.toUpperCase();
  p[k] = v;
  write('person_save', { person: { id, [k]: v } }).then(r => { S.people = r.people; if (['department', 'initials', 'active'].includes(k)) rerenderBody(); }).catch(() => {});
  if (['department', 'initials'].includes(k)) rerenderBody();
};
ACT.ppass = el => {
  const id = el.dataset.id, p = personById(id);
  const m = openModal(`<h3>Passcode for ${esc(p.name)}</h3><div class="muted">Passcodes are stored in the backend, never in the sheet. Leave blank and save to remove it.</div>
    <div class="field"><span class="lbl">New passcode</span><input class="inp" id="ppVal" type="text" autocomplete="off"></div>
    <div class="actions"><button class="btn btn-plain" data-act="closemodal">Cancel</button><button class="btn btn-primary" id="ppGo">Save</button></div>`);
  $('#ppGo', m).onclick = async () => { try { const r = await write('person_save', { person: { id, passcode: $('#ppVal', m).value } }); S.people = r.people; closeModal(); rerenderBody(); toast('Passcode updated'); } catch (e) {} };
};
ACT.ppadd = () => {
  const superMe = S.me.rank >= 3;
  const m = openModal(`<h3>Add person</h3>
    <div class="field"><span class="lbl">Name</span><input class="inp" id="paName"></div>
    <div class="grid2"><div class="field"><span class="lbl">Initials</span><input class="inp" id="paIni" maxlength="3" style="text-transform:uppercase"></div>
    <div class="field"><span class="lbl">Department</span><select class="sel" id="paDept">${S.depts.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div></div>
    <div class="grid2"><div class="field"><span class="lbl">Access</span><select class="sel" id="paAcc">${ACCESS.filter(a => a !== 'superadmin' || superMe).map(a => `<option${a === 'editor' ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
    <div class="field"><span class="lbl">Passcode (optional)</span><input class="inp" id="paPass" autocomplete="off"></div></div>
    <div class="actions"><button class="btn btn-plain" data-act="closemodal">Cancel</button><button class="btn btn-primary" id="paGo">Add</button></div>`);
  $('#paGo', m).onclick = async () => {
    const name = $('#paName', m).value.trim(); if (!name) { $('#paName', m).focus(); return; }
    const person = { name, initials: $('#paIni', m).value, department: $('#paDept', m).value, access: $('#paAcc', m).value };
    if ($('#paPass', m).value) person.passcode = $('#paPass', m).value;
    try { const r = await write('person_save', { person }); S.people = r.people; closeModal(); rerenderBody(); toast(name + ' added'); } catch (e) {}
  };
};
ACT.ppdel = async el => {
  const p = personById(el.dataset.id);
  if (!await confirmBox(`Delete ${p.name}? Projects keep their initials only while the person exists. Deactivating is usually better.`, 'Delete', true)) return;
  try { const r = await write('person_delete', { id: p.id }); S.people = r.people; rerenderBody(); } catch (e) {}
};

/* ---- departments ---- */
function setDepts() {
  return `<div class="row wrap" style="margin-bottom:12px"><div class="muted sp" style="min-width:240px">Department colours appear only on the initial circles.</div><button class="btn btn-primary" data-act="ddadd"><i class="ti ti-plus"></i>Add department</button></div>
  <table class="tbl" style="min-width:560px"><thead><tr><th>Preview</th><th>Colour</th><th>Name</th><th>People</th><th></th></tr></thead><tbody>
  ${S.depts.map(d => { const n = S.people.filter(p => p.department === d.id).length;
    return `<tr><td><span class="av av-lg" style="background:${d.colour};color:${textOn(d.colour)}">AB</span></td>
    <td><input type="color" value="${esc(d.colour)}" data-chg="dd" data-id="${d.id}" data-k="colour"></td>
    <td><input class="inp" style="min-width:180px" value="${esc(d.name)}" data-chg="dd" data-id="${d.id}" data-k="name"></td><td>${n}</td>
    <td>${n ? '' : `<button class="icon-btn" data-act="dddel" data-id="${d.id}"><i class="ti ti-trash"></i></button>`}</td></tr>`; }).join('')}</tbody></table>`;
}
INP.dd = el => {
  const d = deptById(el.dataset.id); if (!d) return; d[el.dataset.k] = el.value;
  write('dept_save', { department: { id: d.id, [el.dataset.k]: el.value } }).then(r => { S.depts = r.departments; }).catch(() => {});
  if (el.dataset.k === 'colour') rerenderBody();
};
ACT.ddadd = () => {
  const m = openModal(`<h3>Add department</h3><div class="grid2"><div class="field"><span class="lbl">Name</span><input class="inp" id="daName"></div><div class="field"><span class="lbl">Colour</span><input type="color" id="daCol" value="#9AA0A6"></div></div>
    <div class="actions"><button class="btn btn-plain" data-act="closemodal">Cancel</button><button class="btn btn-primary" id="daGo">Add</button></div>`);
  $('#daGo', m).onclick = async () => { try { const r = await write('dept_save', { department: { name: $('#daName', m).value, colour: $('#daCol', m).value } }); S.depts = r.departments; closeModal(); rerenderBody(); } catch (e) {} };
};
ACT.dddel = async el => { try { const r = await write('dept_delete', { id: el.dataset.id }); S.depts = r.departments; rerenderBody(); } catch (e) {} };

/* ---- workflow ---- */
function saveCfg(key, value) { return write('config_save', { key, value }).then(r => { S.cfg = Object.assign(S.cfg, r.config); }); }
function listEditor(key, label, items, used) {
  return `<div class="panel pad" style="margin-bottom:16px"><div class="lbl" style="margin-bottom:10px">${label}</div>
    ${items.map((s, i) => { const n = used(s); return `<div class="row" style="margin-bottom:6px"><input class="inp" value="${esc(s)}" data-chg="wf-ren" data-key="${key}" data-i="${i}" ${n ? 'disabled title="In use by ' + n + ' project(s), so it cannot be renamed"' : ''}>
      <button class="icon-btn" data-act="wf-mv" data-key="${key}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}><i class="ti ti-arrow-up"></i></button>
      <button class="icon-btn" data-act="wf-mv" data-key="${key}" data-i="${i}" data-d="1" ${i === items.length - 1 ? 'disabled' : ''}><i class="ti ti-arrow-down"></i></button>
      <button class="icon-btn" data-act="wf-del" data-key="${key}" data-i="${i}" ${n || items.length < 2 ? 'disabled' : ''} title="${n ? 'In use' : 'Remove'}"><i class="ti ti-trash"></i></button></div>`; }).join('')}
    <div class="row" style="margin-top:8px"><input class="inp" placeholder="Add new" id="wfNew-${key}"><button class="btn btn-ghost" data-act="wf-add" data-key="${key}">Add</button></div></div>`;
}
function setWorkflow() {
  const c = S.cfg;
  return `<div style="max-width:620px">
    ${listEditor('stages', 'Stages (board columns, in order)', c.stages, s => S.projects.filter(p => p.stage === s).length)}
    ${listEditor('statuses', 'Statuses', c.statuses, s => S.projects.filter(p => p.status === s).length)}
    <div class="panel pad" style="margin-bottom:16px"><div class="lbl" style="margin-bottom:10px">Shown on the read-only live link</div>
      ${c.stages.map(s => `<label class="row" style="margin-bottom:6px"><input type="checkbox" class="toggle" data-chg="wf-pub" data-s="${esc(s)}" ${c.public_stages.includes(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('')}</div>
    <div class="panel pad"><div class="lbl" style="margin-bottom:10px">Financial year starts</div>
      <select class="sel" style="max-width:200px" data-chg="wf-fy">${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => `<option value="${i + 1}"${c.fy_start_month === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select></div></div>`;
}
INP['wf-ren'] = el => { const key = el.dataset.key, arr = S.cfg[key].slice(), v = el.value.trim(); if (!v) { rerenderBody(); return; } arr[el.dataset.i] = v; saveCfg(key, arr).then(rerenderBody).catch(rerenderBody); };
ACT['wf-mv'] = el => { const key = el.dataset.key, arr = S.cfg[key].slice(), i = Number(el.dataset.i), j = i + Number(el.dataset.d); [arr[i], arr[j]] = [arr[j], arr[i]]; S.cfg[key] = arr; rerenderBody(); saveCfg(key, arr).catch(rerenderBody); };
ACT['wf-del'] = el => { const key = el.dataset.key, arr = S.cfg[key].slice(); arr.splice(Number(el.dataset.i), 1); S.cfg[key] = arr; rerenderBody(); saveCfg(key, arr).catch(rerenderBody); };
ACT['wf-add'] = el => { const key = el.dataset.key, i = $('#wfNew-' + key), v = i.value.trim(); if (!v) return; if (S.cfg[key].includes(v)) { toast('Already there', 'err'); return; } const arr = S.cfg[key].concat(v); S.cfg[key] = arr; rerenderBody(); saveCfg(key, arr).catch(rerenderBody); };
INP['wf-pub'] = el => { const s = el.dataset.s, cur = S.cfg.public_stages.slice(); const arr = el.checked ? S.cfg.stages.filter(x => cur.includes(x) || x === s) : cur.filter(x => x !== s); if (!arr.length) { toast('Keep at least one stage visible', 'err'); rerenderBody(); return; } S.cfg.public_stages = arr; saveCfg('public_stages', arr).catch(rerenderBody); };
INP['wf-fy'] = el => saveCfg('fy_start_month', Number(el.value)).catch(() => {});

/* ---- closeout options ---- */
function setCloseout() {
  const opts = S.cfg.closeout_options || {};
  return `<div class="muted" style="margin-bottom:12px">One option per line. A project can still hold an old value that is not in the list.</div>
  <div class="grid2" style="max-width:820px">${coFields().map(([k, l]) => `<div class="field"><span class="lbl">${esc(l)}</span><textarea class="txt" style="min-height:110px" data-chg="co-opt" data-k="${k}">${esc((opts[k] || []).join('\n'))}</textarea></div>`).join('')}</div>`;
}
INP['co-opt'] = el => { const next = Object.assign({}, S.cfg.closeout_options); next[el.dataset.k] = el.value.split('\n').map(s => s.trim()).filter(Boolean); S.cfg.closeout_options = next; saveCfg('closeout_options', next).then(() => toast('Options saved')).catch(() => {}); };

/* ---- clients to reconcile ---- */
function setClients() {
  if (!S.clients) return `<div class="skeleton" style="height:200px">Loading clients</div>`;
  const known = new Set(S.clients.map(c => norm(c.name))), counts = {};
  S.projects.forEach(p => { if (p.client) counts[p.client] = (counts[p.client] || 0) + 1; });
  (S.ar.clients || []).forEach(n => { if (!(n in counts)) counts[n] = 0; });
  const missing = Object.keys(counts).filter(n => !known.has(norm(n))).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);
  return `<div class="muted" style="margin-bottom:12px;max-width:640px">${S.clients.length} clients are in the Project Code Generator sheet. These client names appear on projects but are not in it yet${S.ar.loaded ? '' : ' (archive still loading)'}.</div>
  ${missing.length ? `<table class="tbl" style="min-width:420px;max-width:640px"><thead><tr><th>Client name</th><th>Live projects</th><th></th></tr></thead><tbody>${missing.map(n => `<tr><td class="strong">${esc(n)}</td><td>${counts[n]}</td><td><button class="btn btn-ghost btn-sm" data-act="rcadd" data-n="${esc(n)}">Add to code sheet</button></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty"><i class="ti ti-circle-check"></i>Every client has a code.</div>`}`;
}
ACT.rcadd = async el => {
  const name = el.dataset.n; let code = '';
  try { code = (await api('client_suggest', { name })).code; } catch (e) {}
  const m = openModal(`<h3>Add client to code sheet</h3><div class="field"><span class="lbl">Client name</span><input class="inp" id="rcName" value="${esc(name)}"></div>
    <div class="field"><span class="lbl">Code (3 to 8 characters)</span><input class="inp" id="rcCode" value="${esc(code)}" maxlength="8" style="text-transform:uppercase"></div>
    <div class="actions"><button class="btn btn-plain" data-act="closemodal">Cancel</button><button class="btn btn-primary" id="rcGo">Add</button></div>`);
  $('#rcGo', m).onclick = async () => {
    try { const d = await write('client_add', { name: $('#rcName', m).value, code: $('#rcCode', m).value }); S.clients = d.clients; closeModal(); rerenderBody(); toast(`Added ${d.client.name} (${d.client.code})`); } catch (e) {}
  };
};

/* ---- system ---- */
function setSystem() {
  const h = S.health, link = S.adminKey ? `${location.origin}${location.pathname}?view=live&k=${S.adminKey}` : '';
  const tabs = h && h.tabs ? Object.keys(h.tabs).map(k => `${k}: ${h.tabs[k]}`).join('  |  ') : '';
  return `<div style="max-width:720px;display:flex;flex-direction:column;gap:16px">
    <div class="panel pad"><div class="lbl" style="margin-bottom:10px">Build</div><div class="kv">
      <span class="muted">Front end</span><span>BOARD alpha ${APP_VERSION}</span>
      <span class="muted">Backend</span><span>${h ? esc(h.server_version || h.error || '') : 'Checking'}</span>
      <span class="muted">Data version</span><span>${S.version}</span>
      <span class="muted">Tabs (rows)</span><span>${esc(tabs)}</span>
      <span class="muted">Code sheet clients</span><span>${h ? esc(h.clients) : ''}</span>
      <span class="muted">Feedback goes to</span><span>${h ? esc(h.feedback_to) : ''}</span></div></div>
    <div class="panel pad"><div class="lbl" style="margin-bottom:6px">Read-only live link</div>
      <div class="muted" style="margin-bottom:10px">Anyone with this link can see the live projects without signing in. Budget, notes and closeout are never included.</div>
      <div class="row"><input class="inp" id="roLink" readonly value="${esc(link)}"><button class="btn btn-ghost" data-act="rocopy">Copy</button></div>
      <div class="row" style="margin-top:10px"><button class="btn btn-plain btn-sm" data-act="rorotate">Make a new link (old one stops working)</button></div></div>
    <div class="panel pad"><div class="lbl" style="margin-bottom:6px">Alpha open door</div>
      <div class="muted" style="margin-bottom:10px">While this is on, leaving the name and passcode blank signs in as Oli. Turn it off before anyone else is given the link.</div>
      <label class="row"><input type="checkbox" class="toggle" data-chg="alpha-open" ${S.alphaOpen ? 'checked' : ''} ${S.me.rank >= 3 ? '' : 'disabled'}> ${S.alphaOpen ? 'On' : 'Off'}</label></div>
  </div>`;
}
ACT.rocopy = async () => { const v = $('#roLink').value; try { await navigator.clipboard.writeText(v); toast('Link copied'); } catch (e) { $('#roLink').select(); } };
ACT.rorotate = async () => {
  if (!await confirmBox('The current read-only link will stop working straight away.', 'Make new link')) return;
  try { const r = await write('readonly_rotate', {}); S.adminKey = r.readonly_key; rerenderBody(); toast('New link ready'); } catch (e) {}
};
INP['alpha-open'] = async el => { try { const r = await write('alpha_open_set', { value: el.checked }); S.alphaOpen = r.alpha_open; rerenderBody(); } catch (e) { rerenderBody(); } };

/* ================================================================
   Read-only live view (no sign in)
   ================================================================ */
function loadPublic(d) {
  S.people = d.people; S.depts = d.departments; S.cfg.stages = d.stages; S.cfg.public_stages = d.stages; S.cfg.statuses = d.statuses;
  S.projects = d.projects; S.me = { id: '', rank: -1, name: '' };
}
ACT.rochange = el => { location.hash = '#/' + el.dataset.v; };
async function startReadonly(key) {
  S.readonly = true; S.readonlyKey = key; S.view = 'board';
  $('#app').innerHTML = `<div class="main">
    <div class="topbar">${logoHTML()}<h1 class="page-title" style="margin-left:6px">Live projects</h1><span class="pill pill-ro">Read only</span><span class="pill pill-alpha">Alpha</span><span class="spacer"></span>
      <button class="icon-btn" data-act="theme" title="Light / dark"><i class="ti ti-moon"></i></button></div>
    <div class="content-wrap"><div class="content" id="content"><div class="skeleton">Loading live projects</div></div></div></div>`;
  document.title = 'BOARD live (alpha)';
  try {
    const d = await apiPublic(key); S.version = d.version; loadPublic(d);
    if (!location.hash || location.hash === '#') location.hash = '#/board'; else route();
    route();
  } catch (e) { $('#content').innerHTML = `<div class="empty"><i class="ti ti-lock"></i>${esc(e.message || 'This link is not valid')}</div>`; }
}
