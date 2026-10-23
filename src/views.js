/* ================================================================
   BOARD alpha. Views: mine, pipeline (board/list), timeline, closeout, archive, codes
   ================================================================ */

const BODY = {};
function rerenderBody() { const fn = BODY[S.view], vb = $('#vb'); if (fn && vb) vb.innerHTML = fn(); }
const optList = (items, cur, blank) => (blank != null ? `<option value="">${esc(blank)}</option>` : '') + items.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
const personOpts = (cur, blank) => (blank != null ? `<option value="">${esc(blank)}</option>` : '') + activePeople().map(p => `<option value="${p.id}"${p.id === cur ? ' selected' : ''}>${esc(p.name)}</option>`).join('');

function matches(p) {
  const f = S.f, q = norm(f.q);
  if (q && !norm([p.name, p.client, p.client_code, p.project_code].join(' ')).includes(q)) return false;
  if (f.person && !teamOf(p).includes(f.person)) return false;
  if (f.status && p.status !== f.status) return false;
  return true;
}

/* ---------------- cards ---------------- */
function cardHTML(p) {
  const team = teamOf(p);
  return `<div class="card" data-id="${p.id}" data-act="open"${canEdit() ? ' draggable="true"' : ''}>
    ${canEdit() ? `<button class="icon-btn kebab" data-act="movemenu" data-id="${p.id}" title="Move to stage"><i class="ti ti-dots"></i></button>` : ''}
    <div class="card-title">${esc(p.name)}</div>
    ${p.client || (!S.readonly && p.budget) ? `<div class="card-client row"><span class="sp">${esc(p.client)}</span>${S.readonly || !p.budget ? '' : `<span>${esc(fmoney(p.budget))}</span>`}</div>` : ''}
    ${p.status ? `<div>${statusChip(p.status)}</div>` : ''}
    <div class="card-foot"><span>${avStack(team)}</span><span>${esc(frange(p.start, p.end))}</span></div>
  </div>`;
}

/* ---------------- pipeline ---------------- */
function viewPipeline() {
  const st = S.cfg.statuses;
  return `<div class="toolbar">
    <div class="seg"><button data-act="pipemode" data-m="board" class="${S.pipeMode === 'board' ? 'on' : ''}"><i class="ti ti-layout-kanban"></i>Board</button><button data-act="pipemode" data-m="list" class="${S.pipeMode === 'list' ? 'on' : ''}"><i class="ti ti-list"></i>List</button></div>
    <div class="search"><i class="ti ti-search"></i><input class="inp" placeholder="Search projects" value="${esc(S.f.q)}" data-inp="f-q"></div>
    <select class="sel sel-sm" data-chg="f-person">${personOpts(S.f.person, 'Everyone')}</select>
    <select class="sel sel-sm hide-m" data-chg="f-status">${optList(st, S.f.status, 'Any status')}</select>
    <span class="spacer"></span>
    ${canEdit() ? `<button class="btn btn-primary" data-act="newproject"><i class="ti ti-plus"></i>New project</button>` : ''}
  </div><div id="vb">${pipeBody()}</div>`;
}
function pipeBody() { return S.pipeMode === 'board' ? boardHTML() : listHTML(); }
BODY.pipeline = pipeBody;

function boardHTML() {
  return `<div class="board">${S.cfg.stages.map(stage => {
    const all = sortedStage(stage), items = all.filter(matches);
    return `<div class="col"><div class="col-head"><span class="lbl">${esc(stage)}</span><span class="count">${items.length}${items.length !== all.length ? ' / ' + all.length : ''}</span></div>
      <div class="col-body" data-stage="${esc(stage)}">${items.map(cardHTML).join('')}${!items.length ? `<div class="muted" style="font-size:12px;padding:6px 4px">${canEdit() ? 'Drop a project here' : 'Nothing here'}</div>` : ''}</div></div>`;
  }).join('')}</div>`;
}

const LIST_COLS = [
  { k: 'name', l: 'Project', sticky: 1 }, { k: 'client', l: 'Client', hm: 1 }, { k: 'stage', l: 'Stage', hm: 1 }, { k: 'status', l: 'Status' },
  { k: 'lead', l: 'Team' }, { k: 'start', l: 'Start', hm: 1 }, { k: 'end', l: 'End' }, { k: 'budget', l: 'Budget', num: 1, hm: 1 }
];
function sortVal(p, k) {
  if (k === 'stage') return S.cfg.stages.indexOf(p.stage);
  if (k === 'lead') return norm((personById(p.lead) || {}).name);
  if (k === 'budget') return p.budget === '' ? -1 : p.budget;
  if (k === 'sort') return p.sort === '' ? 1e9 : p.sort;
  return norm(p[k]) || '￿';
}
function listHTML() {
  const grouped = S.sort.key === 'sort';
  let rows = S.projects.filter(matches);
  const row = p => `<tr class="row" data-act="open" data-id="${p.id}">
    <td class="sticky nm">${esc(p.name)}</td><td class="hide-m">${esc(p.client)}</td><td class="hide-m nw">${esc(p.stage)}</td><td class="nw">${statusChip(p.status)}</td>
    <td>${avStack(teamOf(p), 'av-sm', 5)}</td><td class="hide-m nw">${esc(fdate(p.start))}</td><td class="nw">${esc(fdate(p.end))}</td><td class="num hide-m">${esc(fmoney(p.budget))}</td></tr>`;
  let body = '';
  if (grouped) {
    S.cfg.stages.forEach(stage => {
      const items = rows.filter(p => p.stage === stage).sort((a, b) => sortVal(a, 'sort') - sortVal(b, 'sort'));
      if (!items.length) return;
      body += `<tr class="grp"><td colspan="8"><span class="lbl" style="color:var(--color-text-primary)">${esc(stage)}</span> <span class="count">${items.length}</span></td></tr>` + items.map(row).join('');
    });
  } else {
    const d = S.sort.dir, k = S.sort.key;
    rows = rows.sort((a, b) => { const x = sortVal(a, k), y = sortVal(b, k); return (x < y ? -1 : x > y ? 1 : 0) * d; });
    body = rows.map(row).join('');
  }
  if (!rows.length) return `<div class="empty"><i class="ti ti-folder-off"></i>No projects match.</div>`;
  const arrow = k => S.sort.key === k ? (S.sort.dir === 1 ? ' ↑' : ' ↓') : '';
  return `<table class="tbl"><thead><tr>${LIST_COLS.map(c => `<th class="sortable ${c.sticky ? 'sticky' : ''} ${c.num ? 'num' : ''} ${c.hm ? 'hide-m' : ''}" data-act="sort" data-k="${c.k}">${c.l}${arrow(c.k)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}
ACT.sort = el => { const k = el.dataset.k; S.sort = S.sort.key === k ? (S.sort.dir === 1 ? { key: k, dir: -1 } : { key: 'sort', dir: 1 }) : { key: k, dir: 1 }; rerenderBody(); };
ACT.pipemode = el => { S.pipeMode = el.dataset.m; store.set('board_mode', S.pipeMode); renderView(); };
S.pipeMode = store.get('board_mode') === 'list' ? 'list' : 'board';
INP['f-q'] = el => { S.f.q = el.value; rerenderBody(); };
INP['f-person'] = el => { S.f.person = el.value; rerenderBody(); };
INP['f-status'] = el => { S.f.status = el.value; rerenderBody(); };
ACT.open = el => { if (S.dragging) return; openDrawer(el.dataset.id, el.dataset.from); };

/* move menu + dnd */
ACT.movemenu = el => {
  const p = projectById(el.dataset.id); if (!p) return;
  openPop(el, `<div class="lbl" style="padding:6px 10px">Move to</div>` + S.cfg.stages.map(s => `<button data-act="moveto" data-id="${p.id}" data-stage="${esc(s)}" class="${s === p.stage ? 'cur' : ''}">${s === p.stage ? '<i class="ti ti-check"></i>' : ''}${esc(s)}</button>`).join(''));
};
ACT.moveto = el => { closePop(); moveProject(el.dataset.id, el.dataset.stage); };
function moveProject(id, stage, beforeId) {
  const p = projectById(id); if (!p || !canEdit()) return;
  const ids = sortedStage(stage).map(x => x.id).filter(x => x !== id);
  let idx = beforeId ? ids.indexOf(beforeId) : -1; if (idx < 0) idx = ids.length; ids.splice(idx, 0, id);
  const from = p.stage; p.stage = stage;
  ids.forEach((pid, i) => { const q = projectById(pid); if (q) q.sort = (i + 1) * 10; });
  S.stale = false; renderView(); if (S.drawer === id) refreshDrawer();
  write('project_move', { id, stage, ids });
  if (from !== stage) toast('Moved to ' + stage);
}
function dropPos(body, y) {
  const cards = $$('.card:not(.dragging)', body);
  for (const c of cards) { const r = c.getBoundingClientRect(); if (y < r.top + r.height / 2) return { before: c, beforeId: c.dataset.id }; }
  return { before: null, beforeId: null };
}
function clearDrop() { $$('.drop-line').forEach(x => x.remove()); $$('.col.over').forEach(x => x.classList.remove('over')); }
document.addEventListener('dragstart', e => {
  const c = e.target.closest && e.target.closest('.card[data-id]'); if (!c || !canEdit()) return;
  S.dragging = true; S.dragId = c.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', S.dragId);
  setTimeout(() => c.classList.add('dragging'), 0);
});
document.addEventListener('dragend', () => { S.dragging = false; S.dragId = null; clearDrop(); $$('.card.dragging').forEach(x => x.classList.remove('dragging')); if (S.stale) softRender(); });
document.addEventListener('dragover', e => {
  const body = e.target.closest && e.target.closest('.col-body'); if (!body || !S.dragId) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  clearDrop(); body.parentNode.classList.add('over');
  const { before } = dropPos(body, e.clientY), line = document.createElement('div'); line.className = 'drop-line';
  if (before) body.insertBefore(line, before); else body.appendChild(line);
});
document.addEventListener('drop', e => {
  const body = e.target.closest && e.target.closest('.col-body'); if (!body || !S.dragId) return;
  e.preventDefault(); const { beforeId } = dropPos(body, e.clientY), id = S.dragId, stage = body.dataset.stage;
  clearDrop(); S.dragging = false; S.dragId = null; moveProject(id, stage, beforeId);
});

/* ---------------- my projects ---------------- */
function viewMine() {
  const mine = S.projects.filter(p => teamOf(p).includes(S.me.id));
  const groups = S.cfg.stages.map(stage => ({ stage, items: mine.filter(p => p.stage === stage).sort((a, b) => sortVal(a, 'sort') - sortVal(b, 'sort')) })).filter(g => g.items.length);
  return `<div class="pad">
    <div class="row wrap" style="margin-bottom:6px">${av(S.me.id, 'av-xl')}<div><div style="font-size:16px;font-weight:800">${esc(S.me.name)}</div><div class="muted">${mine.length} project${mine.length === 1 ? '' : 's'} with you on the team</div></div><span class="sp"></span>
      ${canEdit() ? `<button class="btn btn-primary" data-act="newproject"><i class="ti ti-plus"></i>New project</button>` : ''}</div>
    ${groups.length ? groups.map(g => `<div class="group-h"><span class="lbl" style="color:var(--color-text-primary)">${esc(g.stage)}</span><span class="count">${g.items.length}</span></div><div class="mine-grid">${g.items.map(cardHTML).join('')}</div>`).join('')
      : `<div class="empty"><i class="ti ti-mood-smile"></i>Nothing assigned to you yet. Open a project and add yourself to the team.</div>`}
  </div>`;
}

/* ---------------- timeline (weekdays only, like Monday) ---------------- */
const TL_W = [10, 18, 30, 48], TL_LABEL_W = 250, TL_BEFORE = 10, TL_WEEKS = 40;
function monday(d) { const x = new Date(d.getTime()); const dow = (x.getUTCDay() + 6) % 7; return new Date(x.getTime() - dow * MS_DAY); }
function isoWeek(d) { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const dn = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dn + 3); const ft = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t - ft) / MS_DAY - 3 + ((ft.getUTCDay() + 6) % 7)) / 7); }
function tlStart() { return new Date(monday(pd(todayStr())).getTime() - TL_BEFORE * 7 * MS_DAY); }
function wdIndex(str, start, mode) {
  const d = pd(str), days = Math.floor((d - start) / MS_DAY), w = Math.floor(days / 7), dow = days - w * 7;
  if (dow > 4) return mode === 'start' ? (w + 1) * 5 : w * 5 + 4;
  return w * 5 + dow;
}
function tlProjects() {
  const stages = S.tl.closed && !S.readonly ? S.cfg.stages : liveStages();
  return S.projects.filter(p => stages.includes(p.stage) && matches(p));
}
function viewTimeline() {
  const ro = S.readonly;
  return `<div class="toolbar" style="top:auto">
    ${ro ? `<div class="seg"><button data-act="rochange" data-v="board">Board</button><button class="on" data-act="rochange" data-v="timeline">Timeline</button></div>` : ''}
    <div class="seg"><button data-act="tlgroup" data-g="person" class="${S.tl.group === 'person' ? 'on' : ''}">By person</button><button data-act="tlgroup" data-g="stage" class="${S.tl.group === 'stage' ? 'on' : ''}">By stage</button></div>
    <select class="sel sel-sm" data-chg="f-person">${personOpts(S.f.person, 'Everyone')}</select>
    <div class="row"><button class="icon-btn" data-act="tlzoom" data-d="-1" title="Zoom out"><i class="ti ti-minus"></i></button><button class="icon-btn" data-act="tlzoom" data-d="1" title="Zoom in"><i class="ti ti-plus"></i></button></div>
    <button class="btn btn-plain btn-sm" data-act="tltoday">Today</button>
    ${ro ? '' : `<label class="row muted" style="font-size:12px;gap:6px"><input type="checkbox" class="toggle" data-chg="tl-closed" ${S.tl.closed ? 'checked' : ''}> Include closeout</label>`}
  </div><div id="vb">${tlBody()}</div>`;
}
BODY.timeline = tlBody;
function tlBody() {
  const dayW = TL_W[S.tl.zoom], start = tlStart(), totalDays = TL_WEEKS * 5, W = totalDays * dayW, today = todayStr();
  const all = tlProjects(), dated = all.filter(p => pd(p.start) || pd(p.end)), undated = all.length - dated.length;
  const todayIdx = wdIndex(today, start, 'start'), curWeek = Math.floor(todayIdx / 5);
  /* header */
  let months = '', weeks = '', lastKey = '', span = 0, spanLbl = '';
  const flush = () => { if (span) months += `<div class="tl-cell" style="width:${span * 5 * dayW}px;font-weight:700;color:var(--color-text-primary)">${spanLbl}</div>`; };
  for (let w = 0; w < TL_WEEKS; w++) {
    const m = new Date(start.getTime() + w * 7 * MS_DAY), key = m.getUTCFullYear() + '-' + m.getUTCMonth();
    if (key !== lastKey) { flush(); lastKey = key; span = 0; spanLbl = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(m); }
    span++;
    const fri = new Date(m.getTime() + 4 * MS_DAY), wk = isoWeek(m), wide = 5 * dayW >= 120;
    weeks += `<div class="tl-cell ${w === curWeek ? 'now' : ''}" style="width:${5 * dayW}px">W${wk}${wide ? ` ${m.getUTCDate()} - ${fri.getUTCDate()}` : ''}</div>`;
  }
  flush();
  const head = `<div class="tl-head"><div class="tl-row"><div class="tl-label"></div><div style="display:flex;width:${W}px">${months}</div></div>
    <div class="tl-row"><div class="tl-label"></div><div style="display:flex;width:${W}px">${weeks}</div></div></div>`;
  /* groups */
  let groups = [];
  if (S.tl.group === 'person') {
    activePeople().forEach(p => { const items = dated.filter(x => teamOf(x).includes(p.id)); if (items.length) groups.push({ key: p.id, person: p, items }); });
    const un = dated.filter(x => !teamOf(x).length); if (un.length) groups.push({ key: 'none', title: 'Unassigned', items: un });
  } else {
    S.cfg.stages.forEach(s => { const items = dated.filter(x => x.stage === s); if (items.length) groups.push({ key: s, title: s, items }); });
  }
  const bar = p => {
    const sStr = p.start || p.end, eStr = p.end || p.start;
    let s = wdIndex(sStr, start, 'start'), e = wdIndex(eStr, start, 'end'); if (e < s) e = s;
    if (e < 0 || s >= totalDays) return '';
    const cs = Math.max(0, s), ce = Math.min(totalDays - 1, e), x = cs * dayW, w = (ce - cs + 1) * dayW, col = statusColour(p.status) || '#9AA0A6';
    const left = x + w > W - 220;
    return `<div class="tl-bar" data-act="open" data-id="${p.id}" style="left:${x}px;width:${w}px;background:${col}" title="${esc(p.name)}"></div>
      <div class="tl-bar-lbl" style="${left ? `right:${W - x}px;padding:0 5px 0 0` : `left:${x + w}px`}">${esc(p.name)}</div>`;
  };
  let rows = '';
  groups.forEach(g => {
    const lab = g.person ? `${av(g.person.id, 'av-lg')}<div style="min-width:0"><div class="nm" style="cursor:default">${esc(g.person.name)}</div><div class="muted" style="font-size:11px">${esc((deptById(g.person.department) || {}).name || '')}</div></div>`
      : `<span class="nm" style="cursor:default">${esc(g.title)}</span><span class="count">${g.items.length}</span>`;
    rows += `<div class="tl-row grp"><div class="tl-label">${lab}</div><div class="tl-track" style="width:${W}px"></div></div>`;
    g.items.sort((a, b) => (a.start || a.end).localeCompare(b.start || b.end)).forEach(p => {
      rows += `<div class="tl-row"><div class="tl-label"><span class="nm" data-act="open" data-id="${p.id}" title="${esc(p.name)}">${esc(p.name)}</span><span class="dt">${esc(frange(p.start, p.end))}</span></div>
        <div class="tl-track" style="width:${W}px">${bar(p)}</div></div>`;
    });
  });
  if (!groups.length) rows = `<div class="empty" style="position:sticky;left:0">No dated projects to show.</div>`;
  const grid = `<div class="tl-grid" style="left:${TL_LABEL_W}px;right:auto;width:${W}px;background-size:${dayW * 5}px 100%"></div>`;
  const tx = TL_LABEL_W + todayIdx * dayW + dayW / 2, showToday = todayIdx >= 0 && todayIdx < totalDays;
  const used = uniq(dated.map(p => p.status).filter(Boolean));
  const legend = `<div class="legend">${used.map(s => `<span><i style="background:${statusColour(s)}"></i>${esc(s)}</span>`).join('')}${dated.some(p => !p.status) ? '<span><i style="background:#9AA0A6"></i>No status</span>' : ''}${undated ? `<span class="muted">${undated} without dates not shown</span>` : ''}</div>`;
  return `<div class="tl" style="width:${TL_LABEL_W + W}px">${head}<div style="position:relative">${grid}${showToday ? `<div class="tl-today" style="left:${tx}px"></div>` : ''}${rows}</div>${legend}</div>`;
}
function scrollTimelineToToday() {
  const c = $('#content'); if (!c) return;
  const dayW = TL_W[S.tl.zoom], idx = wdIndex(todayStr(), tlStart(), 'start');
  c.scrollLeft = Math.max(0, idx * dayW - (c.clientWidth - TL_LABEL_W) * 0.35);
}
ACT.tlgroup = el => { S.tl.group = el.dataset.g; renderView(); };
ACT.tlzoom = el => { S.tl.zoom = Math.min(TL_W.length - 1, Math.max(0, S.tl.zoom + Number(el.dataset.d))); renderView(); scrollTimelineToToday(); };
ACT.tltoday = () => scrollTimelineToToday();
INP['tl-closed'] = el => { S.tl.closed = el.checked; rerenderBody(); };

/* ---------------- closeout ---------------- */
const coFields = () => S.cfg.closeout_fields || [];
function coClass(v) { const x = norm(v); if (!x) return ''; if (x === 'stuck') return 'co-bad'; if (x === 'in progress' || x.includes('awaiting')) return 'co-warn'; if (x === 'n/a') return 'co-na'; return 'co-ok'; }
const coDone = v => { const x = norm(v); return !!x && x !== 'stuck' && x !== 'in progress' && !x.includes('awaiting'); };
function coRows() {
  const q = norm(S.co.q), stages = S.co.stage ? [S.co.stage] : closeoutStages();
  return S.projects.filter(p => stages.includes(p.stage) && (!q || norm(p.name + ' ' + p.client).includes(q)))
    .filter(p => !S.co.incomplete || coFields().some(([k]) => !coDone(p[k])))
    .sort((a, b) => stages.indexOf(a.stage) - stages.indexOf(b.stage) || sortVal(a, 'sort') - sortVal(b, 'sort'));
}
function viewCloseout() {
  return `<div class="toolbar">
    <div class="search"><i class="ti ti-search"></i><input class="inp" placeholder="Search closeout" value="${esc(S.co.q)}" data-inp="co-q"></div>
    <select class="sel sel-sm" data-chg="co-stage">${optList(closeoutStages(), S.co.stage, 'Both stages')}</select>
    <label class="row muted" style="font-size:12px;gap:6px"><input type="checkbox" class="toggle" data-chg="co-inc" ${S.co.incomplete ? 'checked' : ''}> Only incomplete</label>
  </div><div id="vb">${coBody()}</div>`;
}
BODY.closeout = coBody;
function coBody() {
  const rows = coRows(), F = coFields(), opts = S.cfg.closeout_options || {}, ed = canEdit();
  if (!rows.length) return `<div class="empty"><i class="ti ti-circle-check"></i>Nothing waiting for closeout.</div>`;
  const cell = (p, k) => {
    const v = p[k] || '', list = (opts[k] || []).slice(); if (v && !list.includes(v)) list.push(v);
    return `<td class="hide-m-none"><select class="sel co-sel ${coClass(v)}" data-chg="co" data-id="${p.id}" data-k="${k}" ${ed ? '' : 'disabled'}>${optList(list, v, '-')}</select></td>`;
  };
  return `<table class="tbl" style="width:max-content;min-width:0"><thead><tr><th class="sticky" style="min-width:210px">Project</th><th>Progress</th>${F.map(([, l]) => `<th>${esc(l)}</th>`).join('')}<th>Size + Location</th><th></th></tr></thead><tbody>
    ${rows.map(p => {
      const done = F.filter(([k]) => coDone(p[k])).length;
      return `<tr class="row" style="cursor:default"><td class="sticky"><div class="nm" style="cursor:pointer;max-width:230px" data-act="open" data-id="${p.id}">${esc(p.name)}</div><div class="muted" style="font-size:11px">${[p.client, p.stage].filter(Boolean).map(esc).join(' &middot; ')}</div></td>
        <td><div class="row" style="gap:8px"><div class="bar" style="width:70px"><i style="width:${F.length ? Math.round(done / F.length * 100) : 0}%"></i></div><span class="muted" style="font-size:11px">${done}/${F.length}</span></div></td>
        ${F.map(([k]) => cell(p, k)).join('')}
        <td><input class="inp inp-sm" style="width:200px;border-radius:var(--r-md)" value="${esc(p.size_location)}" data-chg="co" data-id="${p.id}" data-k="size_location" ${ed ? '' : 'disabled'}></td>
        <td>${ed ? `<button class="btn btn-ghost btn-sm" data-act="archive" data-id="${p.id}"><i class="ti ti-archive"></i>Archive</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table>`;
}
INP['co-q'] = el => { S.co.q = el.value; rerenderBody(); };
INP['co-stage'] = el => { S.co.stage = el.value; rerenderBody(); };
INP['co-inc'] = el => { S.co.incomplete = el.checked; rerenderBody(); };
INP.co = el => { saveFields(el.dataset.id, { [el.dataset.k]: el.value }, null, true); if (el.tagName === 'SELECT') { el.className = 'sel co-sel ' + coClass(el.value); } };

/* ---------------- archive ---------------- */
function viewArchive() {
  const a = S.ar;
  return `<div class="toolbar">
    <div class="search" style="max-width:340px"><i class="ti ti-search"></i><input class="inp" placeholder="Search name, client, notes, location" value="${esc(a.q)}" data-inp="ar-q"></div>
    <select class="sel sel-sm" data-chg="ar-fy">${optList(a.fys, a.fy, 'All years')}</select>
    <select class="sel sel-sm hide-m" data-chg="ar-client">${optList(a.clients, a.client, 'All clients')}</select>
  </div><div id="vb">${arBody()}</div>`;
}
BODY.archive = arBody;
function arBody() {
  const a = S.ar;
  if (a.loading && !a.rows.length) return `<div class="skeleton" style="height:240px">Loading archive</div>`;
  if (!a.rows.length) return `<div class="empty"><i class="ti ti-archive-off"></i>No archived projects match.</div>`;
  return `<div style="padding:10px 20px" class="muted">${a.total} project${a.total === 1 ? '' : 's'}</div>
  <table class="tbl"><thead><tr><th class="sticky">Project</th><th class="hide-m">Client</th><th>Year</th><th class="hide-m">Archive</th><th class="hide-m">Size + Location</th><th>Closeout</th></tr></thead><tbody>
  ${a.rows.map(p => { const F = coFields(), done = F.filter(([k]) => coDone(p[k])).length;
    return `<tr class="row" data-act="open" data-id="${p.id}" data-from="archive"><td class="sticky nm">${esc(p.name)}</td><td class="hide-m">${esc(p.client)}</td><td>${esc(p.fy)}</td><td class="hide-m">${esc(p.archive)}</td><td class="hide-m">${esc(p.size_location)}</td><td><span class="muted" style="font-size:11px">${done}/${F.length}</span></td></tr>`; }).join('')}
  </tbody></table>
  ${a.rows.length < a.total ? `<div style="padding:16px 20px"><button class="btn btn-plain" data-act="armore">${a.loading ? 'Loading' : 'Load more'}</button></div>` : ''}`;
}
async function loadArchive(reset) {
  const a = S.ar; if (a.loading) return; a.loading = true;
  if (reset) { a.offset = 0; }
  try {
    const d = await api('archive_list', { q: a.q, fy: a.fy, client: a.client, offset: reset ? 0 : a.rows.length, limit: 100 });
    const first = !a.fys.length;
    a.rows = reset ? d.rows : a.rows.concat(d.rows); a.total = d.total; a.fys = d.fys; a.clients = d.clients; a.loaded = true;
    a.loading = false; if (S.view === 'archive') { first ? renderView() : rerenderBody(); }
  } catch (e) { a.loading = false; a.loaded = true; toast(e.message, 'err'); if (S.view === 'archive') rerenderBody(); }
}
const archiveSearch = debounce(() => loadArchive(true), 300);
INP['ar-q'] = el => { S.ar.q = el.value; archiveSearch(); };
INP['ar-fy'] = el => { S.ar.fy = el.value; loadArchive(true); };
INP['ar-client'] = el => { S.ar.client = el.value; loadArchive(true); };
ACT.armore = () => loadArchive(false);

/* ---------------- code generator ---------------- */
function titleCase(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean).map(t => {
    if (t === '&') return 'and';
    const w = t.replace(/&/g, '').replace(/[^A-Za-z0-9]/g, ''); return w ? w[0].toUpperCase() + w.slice(1) : '';
  }).join('');
}
const genCode = (code, title) => (code && titleCase(title) ? `${code}_${titleCase(title)}` : '');
function findClient(txt) {
  const x = norm(txt); if (!x || !S.clients) return null;
  return S.clients.find(c => norm(c.name) === x) || S.clients.find(c => norm(c.code) === x) || null;
}
async function loadClients() {
  try { const d = await api('clients'); S.clients = d.clients; } catch (e) { S.clients = []; toast(e.message, 'err'); }
  if (S.view === 'codes') renderView();
}
function viewCodes() {
  const c = S.codes, mode = c.mode;
  const list = (S.clients || []).map(x => `<option value="${esc(x.name)}">${esc(x.code)}</option>`).join('');
  return `<div class="pad" style="max-width:980px"><div class="grid2" style="gap:20px;align-items:start">
    <div class="panel pad" style="display:flex;flex-direction:column;gap:14px">
      <div class="seg" style="align-self:flex-start"><button data-act="cgmode" data-m="existing" class="${mode === 'existing' ? 'on' : ''}">Existing client</button><button data-act="cgmode" data-m="new" class="${mode === 'new' ? 'on' : ''}">New client</button></div>
      ${!S.clients ? `<div class="muted">Loading clients</div>` : mode === 'existing' ? `
        <div class="field"><span class="lbl">Client</span><input class="inp" id="cgClient" list="cgList" placeholder="Start typing a client or code" value="${esc(c.client)}" data-inp="cg-client" autocomplete="off"><datalist id="cgList">${list}</datalist></div>
        <div id="cgHit" class="muted" style="font-size:12px"></div>` : `
        <div class="field"><span class="lbl">Client name</span><input class="inp" id="cgNewName" value="${esc(c.newName)}" data-inp="cg-newname" placeholder="e.g. Acme Studios"></div>
        <div class="field"><span class="lbl">Client code (3 to 8 characters)</span><input class="inp" id="cgNewCode" value="${esc(c.newCode)}" data-inp="cg-newcode" style="text-transform:uppercase" maxlength="8"></div>
        <div class="muted" style="font-size:12px">Adds a new row to the Project Code Generator sheet, so the old sheet stays in step.</div>
        <button class="btn btn-primary" style="align-self:flex-start" data-act="cgadd" ${canEdit() ? '' : 'disabled'}><i class="ti ti-plus"></i>Add client to code sheet</button>`}
      <div class="field"><span class="lbl">Project title</span><input class="inp" id="cgTitle" value="${esc(c.title)}" data-inp="cg-title" placeholder="e.g. Tenderness & Rage"></div>
    </div>
    <div class="panel pad" style="display:flex;flex-direction:column;gap:12px">
      <span class="lbl">Project code</span><div class="codebox" id="cgOut"></div>
      <div class="row"><button class="btn btn-primary" data-act="cgcopy"><i class="ti ti-copy"></i>Copy</button></div>
      <div class="muted" style="font-size:12px">Format is CLIENTCODE_TitleCaseTitle. Project codes are still entered into QuickBooks by hand.</div>
    </div></div></div>`;
}
function cgCurrentCode() {
  const c = S.codes; return c.mode === 'existing' ? (findClient(c.client) || {}).code : String(c.newCode || '').toUpperCase();
}
function updateCodeOut() {
  const out = $('#cgOut'); if (!out) return;
  const code = genCode(cgCurrentCode(), S.codes.title);
  out.textContent = code || 'Pick a client and add a title'; out.style.color = code ? '' : 'var(--color-text-secondary)'; out.style.fontSize = code ? '' : '14px';
  const hit = $('#cgHit'); if (hit && S.codes.mode === 'existing') {
    const f = findClient(S.codes.client);
    hit.innerHTML = f ? `Client code <b>${esc(f.code)}</b>` : (S.codes.client ? 'Not in the code sheet. Switch to New client to add it.' : '');
  }
}
BODY.codes = null;
ACT.cgmode = el => { S.codes.mode = el.dataset.m; renderView(); updateCodeOut(); };
INP['cg-client'] = el => { S.codes.client = el.value; updateCodeOut(); };
INP['cg-title'] = el => { S.codes.title = el.value; updateCodeOut(); };
const suggestSoon = debounce(async () => {
  const n = S.codes.newName; if (!n.trim() || S.codes.codeEdited) return;
  try { const d = await api('client_suggest', { name: n }); if (!S.codes.codeEdited) { S.codes.newCode = d.code; const i = $('#cgNewCode'); if (i) i.value = d.code; updateCodeOut(); } } catch (e) {}
}, 350);
INP['cg-newname'] = el => { S.codes.newName = el.value; suggestSoon(); };
INP['cg-newcode'] = el => { S.codes.newCode = el.value.toUpperCase(); S.codes.codeEdited = true; updateCodeOut(); };
ACT.cgadd = async el => {
  const c = S.codes; el.disabled = true;
  try {
    const d = await write('client_add', { name: c.newName, code: c.newCode });
    S.clients = d.clients; c.mode = 'existing'; c.client = d.client.name; c.codeEdited = false; c.newName = ''; c.newCode = '';
    toast(`Added ${d.client.name} (${d.client.code})`); renderView(); updateCodeOut();
  } catch (e) { el.disabled = false; }
};
ACT.cgcopy = async () => {
  const v = $('#cgOut').textContent; if (!genCode(cgCurrentCode(), S.codes.title)) return;
  try { await navigator.clipboard.writeText(v); toast('Copied ' + v); } catch (e) { toast('Copy failed. Select the code and copy it.', 'err'); }
};

/* ---------------- read only board ---------------- */
function viewReadonlyBoard() {
  const stages = S.cfg.public_stages;
  return `<div class="toolbar"><div class="seg"><button class="on" data-act="rochange" data-v="board">Board</button><button data-act="rochange" data-v="timeline">Timeline</button></div>
    <div class="search"><i class="ti ti-search"></i><input class="inp" placeholder="Search" value="${esc(S.f.q)}" data-inp="f-q"></div>
    <select class="sel sel-sm" data-chg="f-person">${personOpts(S.f.person, 'Everyone')}</select></div>
    <div id="vb">${boardHTML().replace(/^<div class="board">/, '<div class="board">')}</div>`;
}
BODY.board = () => boardHTML();
