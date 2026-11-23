(function () {
  'use strict';

  const DAY_SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri' };
  const PALETTE = ['#4f46e5', '#0891b2', '#c026d3', '#ea580c', '#059669', '#dc2626', '#7c3aed', '#0284c7', '#b45309', '#be185d'];

  const state = {
    data: JSON.parse(JSON.stringify(window.SAMPLE_DATA)),
    settings: window.Engine.DEFAULT_SETTINGS,
    result: null,
    activeTab: 'setup',
    view: 'week',
    cohort: 'all',
    room: 'all',
    engine: 'csp',
    dp: true,
    dirty: false
  };

  const $ = function (selector) { return document.querySelector(selector); };
  const $$ = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function colorFor(key) {
    const text = String(key || '');
    if (!text) return '#64748b';
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 9973;
    return PALETTE[hash % PALETTE.length];
  }

  function tint(hex, alpha) {
    const value = hex.replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /* ------------------------------------------------------------------ */
  /* editing                                                             */
  /* ------------------------------------------------------------------ */

  function markDirty() {
    state.dirty = Boolean(state.result);
    const badge = $('#dirtyBadge');
    if (badge) badge.hidden = !state.dirty;
  }

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    el.classList.add('show');
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(function () {
      el.classList.remove('show');
      window.setTimeout(function () { el.hidden = true; }, 250);
    }, 2600);
  }

  function syncControls() {
    $('#engineSelect').value = state.engine;
    $('#dpToggle').checked = state.dp;
  }

  function setupEvents() {
    document.addEventListener('input', function (event) {
      const el = event.target;
      if (!el.dataset || !el.dataset.collection) return;
      const collection = el.dataset.collection;
      const item = (state.data[collection] || []).find(function (x) { return x.id === el.dataset.id; });
      if (!item) return;
      const field = el.dataset.field;
      if (el.type === 'number') {
        item[field] = Math.max(0, Number(el.value) || 0);
      } else {
        item[field] = el.value;
      }
      markDirty();
    });

    document.addEventListener('change', function (event) {
      const el = event.target;
      if (el.id === 'engineSelect') { state.engine = el.value; return; }
      if (el.id === 'dpToggle') { state.dp = el.checked; return; }
      if (el.id === 'cohortFilter') { state.cohort = el.value; renderTimetable(); return; }
      if (el.id === 'roomFilter') { state.room = el.value; renderTimetable(); return; }
    });

    document.addEventListener('click', function (event) {
      const target = event.target.closest('[data-tab],[data-add],[data-remove],[data-toggle-day],[data-view],[data-generate]');
      if (!target) return;

      if (target.dataset.tab) { switchTab(target.dataset.tab); return; }

      if (target.dataset.generate !== undefined) { generate(); return; }

      if (target.dataset.view) {
        state.view = target.dataset.view;
        $$('[data-view]').forEach(function (btn) { btn.classList.toggle('active', btn.dataset.view === state.view); });
        renderTimetable();
        return;
      }

      if (target.dataset.add) {
        addRow(target.dataset.add);
        return;
      }

      if (target.dataset.remove) {
        removeRow(target.dataset.remove, target.dataset.id);
        return;
      }

      if (target.dataset.toggleDay) {
        const instructor = state.data.instructors.find(function (i) { return i.id === target.dataset.id; });
        if (!instructor) return;
        const day = target.dataset.toggleDay;
        const days = Array.isArray(instructor.availableDays) ? instructor.availableDays.slice() : state.settings.days.slice();
        const index = days.indexOf(day);
        if (index >= 0) days.splice(index, 1); else days.push(day);
        instructor.availableDays = state.settings.days.filter(function (d) { return days.indexOf(d) >= 0; });
        markDirty();
        renderSetup();
        return;
      }
    });

    $('#generateBtn').addEventListener('click', generate);
    $('#resetBtn').addEventListener('click', function () {
      state.data = JSON.parse(JSON.stringify(window.SAMPLE_DATA));
      state.result = null;
      state.dirty = false;
      $('#dirtyBadge').hidden = true;
      renderAll();
      toast('Sample university data restored.');
    });
    $('#exportBtn').addEventListener('click', exportCSV);
  }

  function addRow(collection) {
    if (collection === 'rooms') {
      state.data.rooms.push({ id: window.Engine.uid('r'), name: 'Room ' + (state.data.rooms.length + 1), type: 'Lecture Hall', capacity: 60 });
    } else if (collection === 'instructors') {
      state.data.instructors.push({ id: window.Engine.uid('i'), name: 'New instructor', department: '', availableDays: state.settings.days.slice(), maxPerDay: 3 });
    } else if (collection === 'subjects') {
      state.data.subjects.push({
        id: window.Engine.uid('s'),
        code: 'NEW' + (state.data.subjects.length + 1),
        name: 'New subject',
        instructorId: state.data.instructors[0] ? state.data.instructors[0].id : '',
        cohort: 'CS-1A',
        sessionType: 'Lecture',
        sessionsPerWeek: 2,
        enrollment: 40
      });
    }
    markDirty();
    renderSetup();
  }

  function removeRow(collection, id) {
    if (collection === 'rooms') {
      state.data.rooms = state.data.rooms.filter(function (r) { return r.id !== id; });
    } else if (collection === 'instructors') {
      state.data.instructors = state.data.instructors.filter(function (i) { return i.id !== id; });
      state.data.subjects.forEach(function (subject) {
        if (subject.instructorId === id) subject.instructorId = '';
      });
    } else if (collection === 'subjects') {
      state.data.subjects = state.data.subjects.filter(function (s) { return s.id !== id; });
    }
    markDirty();
    renderSetup();
  }

  /* ------------------------------------------------------------------ */
  /* setup rendering                                                     */
  /* ------------------------------------------------------------------ */

  function renderSetup() {
    renderRooms();
    renderInstructors();
    renderSubjects();
  }

  function renderRooms() {
    const rows = state.data.rooms.map(function (room) {
      return '<tr>' +
        '<td><input class="input" data-collection="rooms" data-id="' + room.id + '" data-field="name" value="' + esc(room.name) + '"></td>' +
        '<td><select class="input" data-collection="rooms" data-id="' + room.id + '" data-field="type">' +
          window.Engine.ROOM_TYPES.map(function (type) {
            return '<option' + (type === room.type ? ' selected' : '') + '>' + type + '</option>';
          }).join('') +
        '</select></td>' +
        '<td><input class="input num" type="number" min="1" data-collection="rooms" data-id="' + room.id + '" data-field="capacity" value="' + room.capacity + '"></td>' +
        '<td class="cell-action"><button class="icon-btn" type="button" data-remove="rooms" data-id="' + room.id + '" title="Remove room">✕</button></td>' +
      '</tr>';
    }).join('');

    $('#roomsCard').innerHTML =
      '<div class="card-head"><div><h2>Classrooms</h2><p>Capacity and type decide which sessions can use a room.</p></div>' +
        '<button class="btn small ghost" type="button" data-add="rooms">+ Add room</button></div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Room</th><th>Type</th><th>Seats</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="4" class="empty-row">No rooms yet.</td></tr>') + '</tbody></table></div>';
  }

  function renderInstructors() {
    const rows = state.data.instructors.map(function (instructor) {
      const available = Array.isArray(instructor.availableDays) ? instructor.availableDays : state.settings.days;
      const dayButtons = state.settings.days.map(function (day) {
        const on = available.indexOf(day) >= 0;
        return '<button type="button" class="day-chip' + (on ? ' on' : '') + '" data-toggle-day="' + day + '" data-id="' + instructor.id + '">' + DAY_SHORT[day] + '</button>';
      }).join('');
      return '<tr>' +
        '<td><input class="input" data-collection="instructors" data-id="' + instructor.id + '" data-field="name" value="' + esc(instructor.name) + '"></td>' +
        '<td><input class="input" data-collection="instructors" data-id="' + instructor.id + '" data-field="department" value="' + esc(instructor.department) + '"></td>' +
        '<td><div class="day-chips">' + dayButtons + '</div></td>' +
        '<td><input class="input num" type="number" min="1" max="7" data-collection="instructors" data-id="' + instructor.id + '" data-field="maxPerDay" value="' + (instructor.maxPerDay || 3) + '"></td>' +
        '<td class="cell-action"><button class="icon-btn" type="button" data-remove="instructors" data-id="' + instructor.id + '" title="Remove instructor">✕</button></td>' +
      '</tr>';
    }).join('');

    $('#instructorsCard').innerHTML =
      '<div class="card-head"><div><h2>Instructors</h2><p>Availability and daily load limit.</p></div>' +
        '<button class="btn small ghost" type="button" data-add="instructors">+ Add</button></div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Department</th><th>Available days</th><th>Max/day</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="5" class="empty-row">No instructors yet.</td></tr>') + '</tbody></table></div>';
  }

  function renderSubjects() {
    const instructorOptions = function (selected) {
      const options = ['<option value="">— unassigned —</option>'].concat(state.data.instructors.map(function (instructor) {
        return '<option value="' + instructor.id + '"' + (instructor.id === selected ? ' selected' : '') + '>' + esc(instructor.name) + '</option>';
      }));
      return options.join('');
    };
    const typeOptions = function (selected) {
      return window.Engine.SESSION_TYPES.map(function (type) {
        return '<option' + (type === selected ? ' selected' : '') + '>' + type + '</option>';
      }).join('');
    };

    const rows = state.data.subjects.map(function (subject) {
      return '<tr>' +
        '<td><input class="input code-input" data-collection="subjects" data-id="' + subject.id + '" data-field="code" value="' + esc(subject.code) + '"></td>' +
        '<td><input class="input" data-collection="subjects" data-id="' + subject.id + '" data-field="name" value="' + esc(subject.name) + '"></td>' +
        '<td><select class="input" data-collection="subjects" data-id="' + subject.id + '" data-field="instructorId">' + instructorOptions(subject.instructorId) + '</select></td>' +
        '<td><select class="input" data-collection="subjects" data-id="' + subject.id + '" data-field="sessionType">' + typeOptions(subject.sessionType) + '</select></td>' +
        '<td><input class="input num" type="number" min="1" max="7" data-collection="subjects" data-id="' + subject.id + '" data-field="sessionsPerWeek" value="' + subject.sessionsPerWeek + '"></td>' +
        '<td><input class="input num" type="number" min="1" data-collection="subjects" data-id="' + subject.id + '" data-field="enrollment" value="' + subject.enrollment + '"></td>' +
        '<td><input class="input" data-collection="subjects" data-id="' + subject.id + '" data-field="cohort" value="' + esc(subject.cohort) + '"></td>' +
        '<td class="cell-action"><button class="icon-btn" type="button" data-remove="subjects" data-id="' + subject.id + '" title="Remove subject">✕</button></td>' +
      '</tr>';
    }).join('');

    $('#subjectsCard').innerHTML =
      '<div class="card-head"><div><h2>Subjects</h2><p>Each subject expands into its weekly sessions. Cohorts that share a name are never scheduled at the same time.</p></div>' +
        '<button class="btn small ghost" type="button" data-add="subjects">+ Add subject</button></div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr>' +
        '<th>Code</th><th>Subject</th><th>Instructor</th><th>Type</th><th>Sessions/wk</th><th>Enrolled</th><th>Cohort</th><th></th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="empty-row">No subjects yet.</td></tr>') + '</tbody></table></div>';
  }

  /* ------------------------------------------------------------------ */
  /* generation                                                          */
  /* ------------------------------------------------------------------ */

  function generate() {
    if (!state.data.rooms.length) { toast('Add at least one classroom first.'); return; }
    if (!state.data.subjects.length) { toast('Add at least one subject first.'); return; }

    try {
      const result = window.Engine.run(state.data, state.settings, state.engine, { dp: state.dp });
      state.result = result;
      state.dirty = false;
      $('#dirtyBadge').hidden = true;
      state.cohort = 'all';
      state.room = 'all';
      switchTab('timetable');
      renderTimetable();
      renderInsights();
      renderAlgorithms();
      if (result.analysis.unscheduled > 0) {
        toast('Placed ' + result.analysis.scheduled + ' of ' + result.analysis.total + ' sessions — ' + result.analysis.unscheduled + ' could not fit.');
      } else if (result.analysis.conflicts.length) {
        toast('Schedule generated with ' + result.analysis.conflicts.length + ' constraint violation(s).');
      } else {
        toast('Schedule ready: ' + result.analysis.scheduled + ' sessions, 0 clashes.');
      }
    } catch (error) {
      console.error(error);
      toast('Something went wrong while allocating: ' + error.message);
    }
  }

  function switchTab(tab) {
    state.activeTab = tab;
    $$('[data-panel]').forEach(function (panel) { panel.hidden = panel.dataset.panel !== tab; });
    $$('[data-tab]').forEach(function (btn) { btn.classList.toggle('active', btn.dataset.tab === tab); });
    if (tab === 'timetable') renderTimetable();
    if (tab === 'insights') renderInsights();
    if (tab === 'algorithms') renderAlgorithms();
  }

  /* ------------------------------------------------------------------ */
  /* timetable rendering                                                 */
  /* ------------------------------------------------------------------ */

  function resultIndex() {
    const result = state.result;
    const sessionById = new Map(result.sessions.map(function (s) { return [s.id, s]; }));
    const roomById = new Map(state.data.rooms.map(function (r) { return [r.id, r]; }));
    const slots = new Map();
    result.assignment.forEach(function (value, id) {
      const session = sessionById.get(id);
      if (!session) return;
      if (state.cohort !== 'all' && session.cohort !== state.cohort) return;
      if (state.room !== 'all' && value.r !== state.room) return;
      const key = value.d + '|' + value.s;
      if (!slots.has(key)) slots.set(key, []);
      slots.get(key).push({ session: session, value: value, room: roomById.get(value.r) });
    });
    return { slots: slots, sessionById: sessionById, roomById: roomById };
  }

  function chip(entry, showTime) {
    const session = entry.session;
    const accent = colorFor(session.cohort || session.code);
    const roomName = entry.room ? entry.room.name : entry.value.r;
    return '<div class="session-chip" style="--accent:' + accent + ';--accent-soft:' + tint(accent, 0.12) + '">' +
      '<div class="chip-top"><span class="chip-code">' + esc(session.code) + '</span>' +
        '<span class="chip-type">' + esc(session.type) + '</span></div>' +
      '<div class="chip-name">' + esc(session.name) + '</div>' +
      '<div class="chip-meta">' + (showTime ? '<span>' + esc(state.settings.slots[entry.value.s]) + '</span> · ' : '') +
        esc(roomName) + ' · ' + esc(session.instructorName) + '</div>' +
      '<div class="chip-foot"><span class="chip-cohort">' + esc(session.cohort || 'open') + '</span>' +
        '<span class="chip-size">' + session.enrollment + ' students</span></div>' +
    '</div>';
  }

  function emptyTimetable(message, action) {
    const result = state.result;
    if (!result) {
      return '<div class="card empty-state"><div class="empty-icon">▦</div>' +
        '<h2>No timetable yet</h2>' +
        '<p>Choose an allocation engine, then run the allocator. Every subject is expanded into its weekly sessions and placed without instructor, cohort or room clashes.</p>' +
        '<button class="btn primary" type="button" data-generate>Generate schedule</button></div>';
    }
    return '<div class="card empty-state"><h2>' + esc(message) + '</h2>' +
      '<p>Try clearing the cohort or room filter to see the full week.</p>' + (action || '') + '</div>';
  }

  function renderTimetable() {
    const host = $('#timetableHost');
    if (!host) return;

    const cohortSelect = $('#cohortFilter');
    const roomSelect = $('#roomFilter');

    if (!state.result) {
      cohortSelect.innerHTML = '<option value="all">All cohorts</option>';
      roomSelect.innerHTML = '<option value="all">All rooms</option>';
      $('#legend').innerHTML = '';
      host.innerHTML = emptyTimetable();
      return;
    }

    const cohorts = Array.from(new Set(state.result.sessions.map(function (s) { return s.cohort; }).filter(Boolean))).sort();
    if (state.cohort !== 'all' && cohorts.indexOf(state.cohort) < 0) state.cohort = 'all';
    cohortSelect.innerHTML = '<option value="all">All cohorts</option>' + cohorts.map(function (cohort) {
      return '<option value="' + esc(cohort) + '"' + (cohort === state.cohort ? ' selected' : '') + '>' + esc(cohort) + '</option>';
    }).join('');

    if (state.room !== 'all' && !state.data.rooms.some(function (r) { return r.id === state.room; })) state.room = 'all';
    roomSelect.innerHTML = '<option value="all">All rooms</option>' + state.data.rooms.map(function (room) {
      return '<option value="' + room.id + '"' + (room.id === state.room ? ' selected' : '') + '>' + esc(room.name) + '</option>';
    }).join('');

    $('#legend').innerHTML = cohorts.slice(0, 8).map(function (cohort) {
      return '<span class="legend-item"><i style="background:' + colorFor(cohort) + '"></i>' + esc(cohort) + '</span>';
    }).join('');

    const index = resultIndex();
    const totalVisible = Array.from(index.slots.values()).reduce(function (sum, list) { return sum + list.length; }, 0);

    if (totalVisible === 0) {
      host.innerHTML = emptyTimetable('Nothing matches this filter');
      return;
    }

    const days = state.settings.days;
    const slots = state.settings.slots;

    if (state.view === 'week') {
      const header = '<tr><th class="tt-time">Time</th>' + days.map(function (day) {
        return '<th>' + day + '</th>';
      }).join('') + '</tr>';

      const body = slots.map(function (slot, sIndex) {
        return '<tr><th class="tt-time">' + esc(slot) + '<span>period ' + (sIndex + 1) + '</span></th>' + days.map(function (day, dIndex) {
          const entries = index.slots.get(dIndex + '|' + sIndex) || [];
          return '<td>' + entries.map(function (entry) { return chip(entry, false); }).join('') + '</td>';
        }).join('') + '</tr>';
      }).join('');

      host.innerHTML = '<div class="card table-card"><div class="table-scroll">' +
        '<table class="tt"><thead>' + header + '</thead><tbody>' + body + '</tbody></table></div></div>';
      return;
    }

    const body = state.data.rooms.map(function (room) {
      return '<tr><th class="tt-room">' + esc(room.name) + '<span>' + esc(room.type) + ' · ' + room.capacity + ' seats</span></th>' +
        days.map(function (day, dIndex) {
          const entries = [];
          slots.forEach(function (slot, sIndex) {
            (index.slots.get(dIndex + '|' + sIndex) || []).forEach(function (entry) {
              if (entry.value.r === room.id) entries.push(entry);
            });
          });
          return '<td>' + entries.map(function (entry) { return chip(entry, true); }).join('') + '</td>';
        }).join('') + '</tr>';
    }).join('');

    host.innerHTML = '<div class="card table-card"><div class="table-scroll">' +
      '<table class="tt room-view"><thead><tr><th class="tt-room">Room</th>' +
      days.map(function (day) { return '<th>' + day + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  /* ------------------------------------------------------------------ */
  /* insights                                                            */
  /* ------------------------------------------------------------------ */

  function renderInsights() {
    const host = $('#insightsHost');
    if (!host) return;

    if (!state.result) {
      host.innerHTML = '<div class="card empty-state"><div class="empty-icon">◎</div><h2>No analytics yet</h2>' +
        '<p>Generate a timetable to see utilisation, teaching load and the clash report.</p>' +
        '<button class="btn primary" type="button" data-generate>Generate schedule</button></div>';
      return;
    }

    const result = state.result;
    const stats = result.analysis;
    const maxDay = Math.max.apply(null, stats.byDay.map(function (d) { return d.count; }).concat([1]));

    const kpis = [
      { label: 'Sessions placed', value: stats.scheduled + ' / ' + stats.total, tone: 'indigo' },
      { label: 'Clashes', value: String(stats.conflicts.length), tone: stats.conflicts.length ? 'red' : 'green' },
      { label: 'Seat utilisation', value: stats.utilization.toFixed(1) + '%', tone: 'cyan' },
      { label: 'Seats reclaimed by DP', value: result.dp ? String(Math.max(0, result.dp.beforeWaste - result.dp.afterWaste)) : '—', tone: 'violet' }
    ];

    const kpiHtml = kpis.map(function (kpi) {
      return '<div class="kpi tone-' + kpi.tone + '"><span class="kpi-label">' + kpi.label + '</span><strong>' + kpi.value + '</strong></div>';
    }).join('');

    const bars = stats.byDay.map(function (day) {
      const width = Math.round((day.count / maxDay) * 100);
      return '<div class="bar-row"><span class="bar-label">' + day.day.slice(0, 3) + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + width + '%"></div></div>' +
        '<span class="bar-value">' + day.count + '</span></div>';
    }).join('');

    const instructors = stats.instructorLoads.map(function (load) {
      const chips = load.sessions.map(function (session) {
        return '<span class="mini-chip">' + esc(session.code) + ' · ' + DAY_SHORT[session.day] + ' ' + esc(session.slot) + '</span>';
      }).join('');
      return '<div class="load-row"><div class="load-head"><strong>' + esc(load.name) + '</strong>' +
        '<span>' + load.count + ' session' + (load.count === 1 ? '' : 's') + ' · cap ' + load.max + '/day</span></div>' +
        '<div class="mini-chips">' + (chips || '<span class="mini-chip muted">no sessions</span>') + '</div></div>';
    }).join('');

    const rooms = stats.roomUsage.map(function (room) {
      const width = Math.min(100, Math.round(room.utilization));
      return '<div class="bar-row"><span class="bar-label">' + esc(room.name) + '</span>' +
        '<div class="bar-track"><div class="bar-fill room" style="width:' + width + '%"></div></div>' +
        '<span class="bar-value">' + room.utilization.toFixed(0) + '%</span></div>' +
        '<div class="bar-note">' + room.sessions + ' sessions · ' + room.seatUse + ' of ' + room.seatOffered + ' seats used</div>';
    }).join('');

    const conflicts = stats.conflicts.length
      ? '<ul class="issue-list">' + stats.conflicts.slice(0, 30).map(function (issue) {
          return '<li><span class="issue-tag">' + esc(issue.type) + '</span>' + esc(issue.text) + '</li>';
        }).join('') + '</ul>' + (stats.conflicts.length > 30 ? '<p class="hint">Showing the first 30 of ' + stats.conflicts.length + ' issues.</p>' : '')
      : '<div class="all-clear"><span>✓</span><div><strong>All hard constraints satisfied</strong><p>No instructor, cohort or room is double-booked, every room fits its class, and instructor availability and daily caps are respected.</p></div></div>';

    const unscheduled = stats.unscheduled > 0
      ? '<div class="notice">' + stats.unscheduled + ' session(s) could not be placed. Try adding a room, widening instructor availability, or lowering enrolment.</div>'
      : '';

    host.innerHTML =
      '<div class="kpi-grid">' + kpiHtml + '</div>' +
      unscheduled +
      '<div class="two-col">' +
        '<div class="card"><div class="card-head"><h2>Sessions per day</h2></div>' + bars + '</div>' +
        '<div class="card"><div class="card-head"><h2>Room utilisation</h2></div>' + rooms + '</div>' +
      '</div>' +
      '<div class="two-col">' +
        '<div class="card"><div class="card-head"><h2>Teaching load</h2></div>' + (instructors || '<p class="hint">No instructors assigned.</p>') + '</div>' +
        '<div class="card"><div class="card-head"><h2>Constraint report</h2></div>' + conflicts + '</div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* algorithms tab                                                      */
  /* ------------------------------------------------------------------ */

  function renderAlgorithms() {
    const host = $('#runSummary');
    if (!host) return;
    if (!state.result) {
      host.innerHTML = '<h2>No run yet</h2><p class="hint">Run the allocator to see how the selected engine performed on your data.</p>';
      return;
    }
    const result = state.result;
    const lines = result.log.map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('');
    const dpLine = result.dp
      ? '<div class="summary-figure"><span>Wasted seats before DP</span><strong>' + result.dp.beforeWaste + '</strong></div>' +
        '<div class="summary-figure"><span>After DP</span><strong>' + result.dp.afterWaste + '</strong></div>' +
        '<div class="summary-figure"><span>Subset states explored</span><strong>' + result.dp.states + '</strong></div>'
      : '<div class="summary-figure"><span>DP optimisation</span><strong>off</strong></div>';

    host.innerHTML = '<div class="card-head"><div><h2>Last run</h2><p>' + esc(result.engineLabel) + ' · ' + result.elapsed + ' ms</p></div>' +
      '<span class="pill ' + (result.analysis.conflicts.length ? 'pill-red' : 'pill-green') + '">' +
      (result.analysis.conflicts.length ? result.analysis.conflicts.length + ' violations' : 'Feasible schedule') + '</span></div>' +
      '<div class="summary-figures">' +
        '<div class="summary-figure"><span>Sessions placed</span><strong>' + result.analysis.scheduled + '/' + result.analysis.total + '</strong></div>' +
        '<div class="summary-figure"><span>Seat utilisation</span><strong>' + result.analysis.utilization.toFixed(1) + '%</strong></div>' +
        dpLine +
      '</div>' +
      '<ul class="run-log">' + lines + '</ul>';
  }

  /* ------------------------------------------------------------------ */
  /* CSV                                                                 */
  /* ------------------------------------------------------------------ */

  function exportCSV() {
    if (!state.result) { toast('Generate a timetable first.'); return; }
    const rows = window.Engine.exportRows(state.result);
    const roomsById = new Map(state.data.rooms.map(function (r) { return [r.id, r.name]; }));
    const csv = rows.map(function (row) {
      const copy = row.slice();
      if (copy[0] !== 'Day' && roomsById.has(copy[6])) copy[6] = roomsById.get(copy[6]);
      return copy.map(function (cell) {
        const text = String(cell === undefined || cell === null ? '' : cell);
        return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      }).join(',');
    }).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'timetable.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Timetable exported as CSV.');
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */

  function renderAll() {
    renderSetup();
    renderTimetable();
    renderInsights();
    renderAlgorithms();
  }

  function init() {
    setupEvents();
    syncControls();
    $$('[data-view]').forEach(function (btn) { btn.classList.toggle('active', btn.dataset.view === state.view); });
    switchTab('setup');
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
