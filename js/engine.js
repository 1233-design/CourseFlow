(function (root) {
  'use strict';

  const DEFAULT_SETTINGS = {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    slots: ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00'],
    sameSubjectDistinctDays: true
  };

  const ROOM_TYPES = ['Lecture Hall', 'Seminar Room', 'Laboratory'];
  const SESSION_TYPES = ['Lecture', 'Tutorial', 'Lab'];

  const ENGINE_LABELS = {
    csp: 'CSP backtracking search',
    greedy: 'Greedy heuristic',
    coloring: 'Graph colouring (DSATUR)'
  };

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  function uid(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }

  function instructorMax(instructor, settings) {
    const max = instructor ? Number(instructor.maxPerDay) : 0;
    if (!max || max < 1) return settings.slots.length;
    return Math.min(Math.floor(max), settings.slots.length);
  }

  function instructorDays(instructor, settings) {
    const days = instructor && Array.isArray(instructor.availableDays)
      ? instructor.availableDays.filter(function (d) { return settings.days.indexOf(d) >= 0; })
      : [];
    return days.length ? days : settings.days.slice();
  }

  // Which rooms can physically host a session (type + capacity).
  function roomFits(room, session) {
    if (!room) return false;
    if (Number(room.capacity) < Number(session.enrollment || 0)) return false;
    if (session.type === 'Lab') return room.type === 'Laboratory';
    if (session.type === 'Tutorial') {
      return room.type === 'Seminar Room' || room.type === 'Lecture Hall' || room.type === 'Laboratory';
    }
    return room.type === 'Lecture Hall' || room.type === 'Seminar Room';
  }

  function buildSessions(data) {
    const sessions = [];
    (data.subjects || []).forEach(function (subject) {
      const instructor = (data.instructors || []).find(function (i) { return i.id === subject.instructorId; });
      const count = Math.max(1, Math.floor(Number(subject.sessionsPerWeek) || 1));
      for (let k = 0; k < count; k++) {
        sessions.push({
          id: subject.id + '-s' + (k + 1),
          subjectId: subject.id,
          code: subject.code || 'SUBJ',
          name: subject.name || 'Untitled subject',
          cohort: (subject.cohort || '').trim().toUpperCase(),
          enrollment: Math.max(0, Number(subject.enrollment) || 0),
          type: SESSION_TYPES.indexOf(subject.sessionType) >= 0 ? subject.sessionType : 'Lecture',
          instructorId: subject.instructorId || null,
          instructorName: instructor ? instructor.name : 'Unassigned',
          index: k + 1,
          of: count
        });
      }
    });
    return sessions;
  }

  function buildDomains(sessions, data, settings) {
    const rooms = data.rooms || [];
    const byInstructor = new Map((data.instructors || []).map(function (i) { return [i.id, i]; }));
    const domains = new Map();

    sessions.forEach(function (session) {
      const instructor = byInstructor.get(session.instructorId);
      const allowedDays = instructorDays(instructor, settings);
      const values = [];
      settings.days.forEach(function (day, d) {
        if (allowedDays.indexOf(day) < 0) return;
        settings.slots.forEach(function (slot, s) {
          rooms.forEach(function (room) {
            if (roomFits(room, session)) values.push({ d: d, s: s, r: room.id });
          });
        });
      });
      domains.set(session.id, values);
    });
    return domains;
  }

  // Two sessions cannot share a time slot if they share an instructor,
  // a student cohort, or belong to the same subject.
  function conflicts(a, b) {
    if (a.id === b.id) return false;
    if (a.instructorId && a.instructorId === b.instructorId) return true;
    if (a.cohort && a.cohort === b.cohort) return true;
    if (a.subjectId === b.subjectId) return true;
    return false;
  }

  function buildConflictGraph(sessions) {
    const graph = new Map(sessions.map(function (s) { return [s.id, new Set()]; }));
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        if (conflicts(sessions[i], sessions[j])) {
          graph.get(sessions[i].id).add(sessions[j].id);
          graph.get(sessions[j].id).add(sessions[i].id);
        }
      }
    }
    return graph;
  }

  function conflictDegreeMap(sessions) {
    const graph = buildConflictGraph(sessions);
    const map = new Map();
    graph.forEach(function (neighbours, id) { map.set(id, neighbours.size); });
    return map;
  }

  /* ------------------------------------------------------------------ */
  /* shared placement tracker (used by CSP and greedy)                   */
  /* ------------------------------------------------------------------ */

  function createTracker(data, settings) {
    const slotState = new Map(); // "d|s" -> { rooms:Set, instructors:Set, cohorts:Set }
    const subjectDay = new Set(); // "d|subjectId"
    const instDay = new Map(); // "d|instructorId" -> count
    const dayCounts = new Array(settings.days.length).fill(0);
    const slotCounts = new Map();
    const maxPerDay = new Map();
    (data.instructors || []).forEach(function (i) { maxPerDay.set(i.id, instructorMax(i, settings)); });

    function slotEntry(d, s) {
      const key = d + '|' + s;
      let entry = slotState.get(key);
      if (!entry) {
        entry = { rooms: new Set(), instructors: new Set(), cohorts: new Set() };
        slotState.set(key, entry);
      }
      return entry;
    }

    function canPlace(session, value) {
      const entry = slotState.get(value.d + '|' + value.s);
      if (entry) {
        if (entry.rooms.has(value.r)) return false;
        if (session.instructorId && entry.instructors.has(session.instructorId)) return false;
        if (session.cohort && entry.cohorts.has(session.cohort)) return false;
      }
      if (settings.sameSubjectDistinctDays && subjectDay.has(value.d + '|' + session.subjectId)) return false;
      if (session.instructorId) {
        const cap = maxPerDay.get(session.instructorId) || settings.slots.length;
        if ((instDay.get(value.d + '|' + session.instructorId) || 0) >= cap) return false;
      }
      return true;
    }

    function place(session, value) {
      const entry = slotEntry(value.d, value.s);
      entry.rooms.add(value.r);
      if (session.instructorId) entry.instructors.add(session.instructorId);
      if (session.cohort) entry.cohorts.add(session.cohort);
      if (settings.sameSubjectDistinctDays) subjectDay.add(value.d + '|' + session.subjectId);
      if (session.instructorId) {
        const key = value.d + '|' + session.instructorId;
        instDay.set(key, (instDay.get(key) || 0) + 1);
      }
      dayCounts[value.d] += 1;
      const slotKey = value.d + '|' + value.s;
      slotCounts.set(slotKey, (slotCounts.get(slotKey) || 0) + 1);
    }

    function unplace(session, value) {
      const entry = slotState.get(value.d + '|' + value.s);
      if (entry) {
        entry.rooms.delete(value.r);
        if (session.instructorId) entry.instructors.delete(session.instructorId);
        if (session.cohort) entry.cohorts.delete(session.cohort);
      }
      if (settings.sameSubjectDistinctDays) subjectDay.delete(value.d + '|' + session.subjectId);
      if (session.instructorId) {
        const key = value.d + '|' + session.instructorId;
        instDay.set(key, Math.max(0, (instDay.get(key) || 1) - 1));
      }
      dayCounts[value.d] = Math.max(0, dayCounts[value.d] - 1);
      const slotKey = value.d + '|' + value.s;
      slotCounts.set(slotKey, Math.max(0, (slotCounts.get(slotKey) || 1) - 1));
    }

    return {
      canPlace: canPlace,
      place: place,
      unplace: unplace,
      dayCount: function (d) { return dayCounts[d] || 0; },
      slotCount: function (d, s) { return slotCounts.get(d + '|' + s) || 0; }
    };
  }

  /* ------------------------------------------------------------------ */
  /* 1. CSP: backtracking with MRV + degree heuristic, incremental checks*/
  /* ------------------------------------------------------------------ */

  function solveCSP(data, settings, budget) {
    budget = budget || 20000;
    const sessions = buildSessions(data);
    const domains = buildDomains(sessions, data, settings);
    const byId = new Map(sessions.map(function (s) { return [s.id, s]; }));
    const degree = conflictDegreeMap(sessions);
    const tracker = createTracker(data, settings);
    const assignment = new Map();
    const remaining = new Set(sessions.map(function (s) { return s.id; }));
    const stats = { nodes: 0, backtracks: 0, deadEnds: 0, budget: budget, limitHit: false };

    function candidates(session) {
      const values = domains.get(session.id) || [];
      const out = [];
      for (let i = 0; i < values.length; i++) {
        if (tracker.canPlace(session, values[i])) out.push(values[i]);
      }
      return out;
    }

    // Least-constraining value order: spread across days and periods.
    // Room choice stays deliberately neutral here; the DP pass optimises it.
    function valueScore(session, value) {
      return tracker.dayCount(value.d) * 4 + tracker.slotCount(value.d, value.s) * 2;
    }

    function search() {
      if (remaining.size === 0) return true;
      if (stats.nodes >= stats.budget) { stats.limitHit = true; return false; }
      stats.nodes += 1;

      let best = null;
      let bestValues = null;
      let deadEnd = false;

      for (const id of remaining) {
        const session = byId.get(id);
        const values = candidates(session);
        if (values.length === 0) { best = session; bestValues = values; deadEnd = true; break; }
        if (!best ||
            values.length < bestValues.length ||
            (values.length === bestValues.length && degree.get(id) > degree.get(best.id))) {
          best = session;
          bestValues = values;
        }
      }

      if (!best) return true;
      if (deadEnd || bestValues.length === 0) { stats.deadEnds += 1; return false; }

      bestValues.sort(function (a, b) { return valueScore(best, a) - valueScore(best, b); });

      for (let i = 0; i < bestValues.length; i++) {
        const value = bestValues[i];
        tracker.place(best, value);
        assignment.set(best.id, value);
        remaining.delete(best.id);

        if (search()) return true;

        remaining.add(best.id);
        assignment.delete(best.id);
        tracker.unplace(best, value);
        stats.backtracks += 1;
        if (stats.limitHit) return false;
      }
      return false;
    }

    const solved = search();
    return {
      sessions: sessions,
      assignment: assignment,
      unscheduled: solved ? [] : Array.from(remaining),
      stats: stats
    };
  }

  /* ------------------------------------------------------------------ */
  /* 2. Greedy: hardest subject first, earliest feasible tight-fit slot  */
  /* ------------------------------------------------------------------ */

  function solveGreedy(data, settings) {
    const sessions = buildSessions(data);
    const domains = buildDomains(sessions, data, settings);
    const degree = conflictDegreeMap(sessions);
    const tracker = createTracker(data, settings);
    const assignment = new Map();
    const unscheduled = [];
    const stats = { nodes: 0, backtracks: 0, rejected: 0, limitHit: false };

    const order = sessions.slice().sort(function (a, b) {
      const da = (domains.get(a.id) || []).length;
      const db = (domains.get(b.id) || []).length;
      if (da !== db) return da - db;
      return degree.get(b.id) - degree.get(a.id);
    });

    order.forEach(function (session) {
      stats.nodes += 1;
      const values = (domains.get(session.id) || []).filter(function (v) { return tracker.canPlace(session, v); });
      stats.rejected += Math.max(0, (domains.get(session.id) || []).length - values.length);
      if (values.length === 0) { unscheduled.push(session.id); return; }

      // Balance across days/periods; room choice is left to the DP pass.
      values.sort(function (a, b) {
        const scoreA = tracker.dayCount(a.d) * 4 + tracker.slotCount(a.d, a.s) * 2;
        const scoreB = tracker.dayCount(b.d) * 4 + tracker.slotCount(b.d, b.s) * 2;
        return scoreA - scoreB;
      });

      const choice = values[0];
      tracker.place(session, choice);
      assignment.set(session.id, choice);
    });

    return { sessions: sessions, assignment: assignment, unscheduled: unscheduled, stats: stats };
  }

  /* ------------------------------------------------------------------ */
  /* 3. Graph colouring: DSATUR over sessions, colours = time slots      */
  /* ------------------------------------------------------------------ */

  function roomsCanHouse(list, rooms) {
    // Bipartite matching (Kuhn) between sessions and rooms they fit in.
    const matchRoom = new Map();
    function tryAssign(index, seen) {
      const session = list[index];
      for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        if (!roomFits(room, session)) continue;
        if (seen.has(room.id)) continue;
        seen.add(room.id);
        const current = matchRoom.get(room.id);
        if (current === undefined || tryAssign(current, seen)) {
          matchRoom.set(room.id, index);
          return true;
        }
      }
      return false;
    }
    for (let i = 0; i < list.length; i++) {
      if (!tryAssign(i, new Set())) return false;
    }
    return true;
  }

  function solveColoring(data, settings) {
    const sessions = buildSessions(data);
    const rooms = data.rooms || [];
    const byId = new Map(sessions.map(function (s) { return [s.id, s]; }));
    const byInstructor = new Map((data.instructors || []).map(function (i) { return [i.id, i]; }));
    const graph = buildConflictGraph(sessions);
    const colourOf = new Map(); // sessionId -> { d, s, key }
    const slotSessions = new Map(); // "d|s" -> [session]
    const dayLoad = new Array(settings.days.length).fill(0);
    const subjectDay = new Set();
    const instructorDay = new Map();
    const unscheduled = [];
    const stats = { nodes: 0, coloursUsed: 0, repairs: 0, limitHit: false };

    function slotKey(d, s) { return d + '|' + s; }

    function feasible(session, d, s) {
      const instructor = byInstructor.get(session.instructorId);
      if (instructor && instructorDays(instructor, settings).indexOf(settings.days[d]) < 0) return false;
      if (settings.sameSubjectDistinctDays && subjectDay.has(d + '|' + session.subjectId)) return false;
      if (session.instructorId) {
        const cap = instructorMax(instructor, settings);
        if ((instructorDay.get(d + '|' + session.instructorId) || 0) >= cap) return false;
      }
      const occupants = slotSessions.get(slotKey(d, s)) || [];
      for (let i = 0; i < occupants.length; i++) {
        if (occupants[i].id === session.id) continue;
        if (conflicts(session, occupants[i])) return false;
      }
      if (!roomsCanHouse(occupants.concat([session]), rooms)) return false;
      return true;
    }

    function apply(session, d, s) {
      colourOf.set(session.id, { d: d, s: s, key: slotKey(d, s) });
      const key = slotKey(d, s);
      if (!slotSessions.has(key)) slotSessions.set(key, []);
      slotSessions.get(key).push(session);
      dayLoad[d] += 1;
      if (settings.sameSubjectDistinctDays) subjectDay.add(d + '|' + session.subjectId);
      if (session.instructorId) {
        const ikey = d + '|' + session.instructorId;
        instructorDay.set(ikey, (instructorDay.get(ikey) || 0) + 1);
      }
    }

    const uncoloured = new Set(sessions.map(function (s) { return s.id; }));
    while (uncoloured.size > 0) {
      // DSATUR: node with the most distinct colours among its neighbours.
      let pick = null;
      let pickSaturation = -1;
      let pickDegree = -1;
      uncoloured.forEach(function (id) {
        const saturation = new Set();
        graph.get(id).forEach(function (nb) {
          const colour = colourOf.get(nb);
          if (colour) saturation.add(colour.key);
        });
        const degree = graph.get(id).size;
        if (saturation.size > pickSaturation ||
            (saturation.size === pickSaturation && degree > pickDegree)) {
          pick = byId.get(id);
          pickSaturation = saturation.size;
          pickDegree = degree;
        }
      });

      stats.nodes += 1;
      let chosen = null;
      let bestScore = Infinity;
      for (let d = 0; d < settings.days.length; d++) {
        for (let s = 0; s < settings.slots.length; s++) {
          if (!feasible(pick, d, s)) continue;
          // Balance the teaching week first, then the individual period.
          const score = dayLoad[d] * 10 + (slotSessions.get(slotKey(d, s)) || []).length;
          if (score < bestScore) {
            bestScore = score;
            chosen = { d: d, s: s };
          }
        }
      }

      if (!chosen) {
        unscheduled.push(pick.id);
        uncoloured.delete(pick.id);
        stats.repairs += 1;
        continue;
      }

      apply(pick, chosen.d, chosen.s);
      uncoloured.delete(pick.id);
    }

    // Turn colour classes into concrete (slot, room) assignments.
    const assignment = new Map();
    const usedColours = new Set();
    slotSessions.forEach(function (list, key) {
      const parts = key.split('|');
      const d = Number(parts[0]);
      const s = Number(parts[1]);
      const packed = assignRoomsDP(list, rooms);
      if (!packed.map) {
        list.forEach(function (session) { unscheduled.push(session.id); });
        return;
      }
      usedColours.add(key);
      list.forEach(function (session) {
        const roomId = packed.map.get(session.id);
        if (roomId) assignment.set(session.id, { d: d, s: s, r: roomId });
        else unscheduled.push(session.id);
      });
    });

    stats.coloursUsed = usedColours.size;
    return { sessions: sessions, assignment: assignment, unscheduled: unscheduled, stats: stats };
  }

  /* ------------------------------------------------------------------ */
  /* 4. Dynamic programming: optimal room packing inside each time slot  */
  /* ------------------------------------------------------------------ */

  function popcount(x) {
    let count = 0;
    while (x) { count += x & 1; x >>>= 1; }
    return count;
  }

  function assignRoomsGreedy(list, rooms) {
    const used = new Set();
    const map = new Map();
    let waste = 0;
    const ordered = list.slice().sort(function (a, b) { return b.enrollment - a.enrollment; });
    let ok = true;
    ordered.forEach(function (session) {
      let best = null;
      rooms.forEach(function (room) {
        if (used.has(room.id) || !roomFits(room, session)) return;
        if (!best || room.capacity < best.capacity) best = room;
      });
      if (!best) { ok = false; return; }
      used.add(best.id);
      map.set(session.id, best.id);
      waste += best.capacity - session.enrollment;
    });
    return ok ? { map: map, waste: waste, states: 0 } : null;
  }

  // Bitmask DP over rooms: minimise wasted seats for the sessions in a slot.
  function assignRoomsDP(list, rooms) {
    const n = list.length;
    const m = rooms.length;
    if (n === 0) return { map: new Map(), waste: 0, states: 0 };
    if (n > m) return null;
    if (m > 12) return assignRoomsGreedy(list, rooms);

    const costs = list.map(function (session) {
      return rooms.map(function (room) {
        return roomFits(room, session) ? room.capacity - session.enrollment : Infinity;
      });
    });

    const size = 1 << m;
    const dp = new Float64Array(size).fill(Infinity);
    const pick = new Int16Array(size).fill(-1);
    dp[0] = 0;

    for (let mask = 0; mask < size; mask++) {
      if (!isFinite(dp[mask])) continue;
      const index = popcount(mask);
      if (index >= n) continue;
      for (let r = 0; r < m; r++) {
        if (mask & (1 << r)) continue;
        const cost = costs[index][r];
        if (!isFinite(cost)) continue;
        const next = mask | (1 << r);
        if (dp[mask] + cost < dp[next]) {
          dp[next] = dp[mask] + cost;
          pick[next] = r;
        }
      }
    }

    let bestMask = -1;
    let bestCost = Infinity;
    for (let mask = 0; mask < size; mask++) {
      if (popcount(mask) !== n) continue;
      if (dp[mask] < bestCost) { bestCost = dp[mask]; bestMask = mask; }
    }
    if (bestMask < 0) return null;

    const map = new Map();
    let mask = bestMask;
    for (let i = n; i > 0; i--) {
      const r = pick[mask];
      if (r < 0) return assignRoomsGreedy(list, rooms);
      map.set(list[i - 1].id, rooms[r].id);
      mask ^= (1 << r);
    }
    return { map: map, waste: bestCost, states: size };
  }

  function optimiseRooms(sessions, assignment, data) {
    const rooms = data.rooms || [];
    const roomsById = new Map(rooms.map(function (r) { return [r.id, r]; }));
    const sessionById = new Map(sessions.map(function (s) { return [s.id, s]; }));
    const groups = new Map();

    assignment.forEach(function (value, id) {
      const session = sessionById.get(id);
      if (!session) return;
      const key = value.d + '|' + value.s;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ session: session, value: value });
    });

    let beforeWaste = 0;
    let afterWaste = 0;
    let states = 0;
    let slots = 0;
    const updated = new Map(assignment);

    groups.forEach(function (entryList) {
      const list = entryList.map(function (entry) { return entry.session; });
      entryList.forEach(function (entry) {
        const room = roomsById.get(entry.value.r);
        if (room) beforeWaste += Math.max(0, room.capacity - entry.session.enrollment);
      });

      const packed = assignRoomsDP(list, rooms);
      if (!packed || !packed.map) {
        entryList.forEach(function (entry) {
          const room = roomsById.get(entry.value.r);
          if (room) afterWaste += Math.max(0, room.capacity - entry.session.enrollment);
        });
        return;
      }

      entryList.forEach(function (entry) {
        const roomId = packed.map.get(entry.session.id);
        if (roomId) updated.set(entry.session.id, { d: entry.value.d, s: entry.value.s, r: roomId });
        const room = roomsById.get(roomId || entry.value.r);
        if (room) afterWaste += Math.max(0, room.capacity - entry.session.enrollment);
      });

      states += packed.states || 0;
      slots += 1;
    });

    return { assignment: updated, beforeWaste: beforeWaste, afterWaste: afterWaste, states: states, slots: slots };
  }

  /* ------------------------------------------------------------------ */
  /* validation + analytics                                              */
  /* ------------------------------------------------------------------ */

  function analyse(sessions, assignment, data, settings) {
    const roomsById = new Map((data.rooms || []).map(function (r) { return [r.id, r]; }));
    const sessionById = new Map(sessions.map(function (s) { return [s.id, s]; }));
    const issues = [];
    const grouped = new Map();
    const subjectDay = new Map();
    const slotLabel = function (d, s) {
      return settings.days[d] + ' ' + settings.slots[s];
    };

    assignment.forEach(function (value, id) {
      const session = sessionById.get(id);
      if (!session) return;
      const key = value.d + '|' + value.s;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({ session: session, value: value });

      const room = roomsById.get(value.r);
      if (!room) {
        issues.push({ type: 'Missing room', text: session.code + ' is placed in a room that no longer exists.' });
      } else {
        if (roomFits(room, session) === false && session.type === 'Lab' && room.type !== 'Laboratory') {
          issues.push({ type: 'Room type', text: session.code + ' is a lab but ' + room.name + ' is a ' + room.type + '.' });
        }
        if (room.capacity < session.enrollment) {
          issues.push({ type: 'Capacity', text: session.code + ' has ' + session.enrollment + ' students but ' + room.name + ' seats ' + room.capacity + '.' });
        }
      }

      const dayKey = session.subjectId + '|' + value.d;
      if (!subjectDay.has(dayKey)) subjectDay.set(dayKey, []);
      subjectDay.get(dayKey).push(session);
    });

    grouped.forEach(function (list, key) {
      const parts = key.split('|');
      const when = slotLabel(Number(parts[0]), Number(parts[1]));
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (a.value.r === b.value.r) {
            const room = roomsById.get(a.value.r);
            issues.push({ type: 'Room clash', text: a.session.code + ' and ' + b.session.code + ' share ' + (room ? room.name : 'a room') + ' on ' + when + '.' });
          }
          if (a.session.instructorId && a.session.instructorId === b.session.instructorId) {
            issues.push({ type: 'Instructor clash', text: a.session.instructorName + ' is booked for ' + a.session.code + ' and ' + b.session.code + ' on ' + when + '.' });
          }
          if (a.session.cohort && a.session.cohort === b.session.cohort) {
            issues.push({ type: 'Cohort clash', text: a.session.cohort + ' has two classes on ' + when + '.' });
          }
        }
      }
    });

    subjectDay.forEach(function (list) {
      if (list.length > 1 && settings.sameSubjectDistinctDays) {
        issues.push({ type: 'Duplicate day', text: list[0].code + ' has ' + list.length + ' sessions on the same day.' });
      }
    });

    // instructor daily caps
    const instDay = new Map();
    assignment.forEach(function (value, id) {
      const session = sessionById.get(id);
      if (!session || !session.instructorId) return;
      const key = value.d + '|' + session.instructorId;
      instDay.set(key, (instDay.get(key) || 0) + 1);
    });
    (data.instructors || []).forEach(function (instructor) {
      const cap = instructorMax(instructor, settings);
      settings.days.forEach(function (day, d) {
        const load = instDay.get(d + '|' + instructor.id) || 0;
        if (load > cap) {
          issues.push({ type: 'Daily cap', text: instructor.name + ' teaches ' + load + ' sessions on ' + day + ' (limit ' + cap + ').' });
        }
      });
    });

    let seatUsed = 0;
    let seatOffered = 0;
    const dayLoads = new Array(settings.days.length).fill(0);
    const instructorLoads = new Map();
    const roomUsage = new Map((data.rooms || []).map(function (room) {
      return [room.id, { id: room.id, name: room.name, type: room.type, capacity: room.capacity, sessions: 0, seatUse: 0, seatOffered: 0 }];
    }));

    assignment.forEach(function (value, id) {
      const session = sessionById.get(id);
      if (!session) return;
      const room = roomsById.get(value.r);
      dayLoads[value.d] += 1;
      if (room) {
        seatUsed += session.enrollment;
        seatOffered += room.capacity;
        const usage = roomUsage.get(room.id);
        if (usage) {
          usage.sessions += 1;
          usage.seatUse += session.enrollment;
          usage.seatOffered += room.capacity;
        }
      }
      if (!instructorLoads.has(session.instructorId)) {
        const instructor = (data.instructors || []).find(function (i) { return i.id === session.instructorId; });
        instructorLoads.set(session.instructorId, {
          id: session.instructorId,
          name: instructor ? instructor.name : session.instructorName,
          count: 0,
          max: instructor ? instructorMax(instructor, settings) : 0,
          sessions: []
        });
      }
      const load = instructorLoads.get(session.instructorId);
      load.count += 1;
      load.sessions.push({ code: session.code, day: settings.days[value.d], slot: settings.slots[value.s] });
    });

    const roomUsageList = Array.from(roomUsage.values()).map(function (room) {
      room.utilization = room.seatOffered > 0 ? (room.seatUse / room.seatOffered) * 100 : 0;
      return room;
    }).sort(function (a, b) { return b.utilization - a.utilization; });

    return {
      scheduled: assignment.size,
      total: sessions.length,
      unscheduled: sessions.length - assignment.size,
      conflicts: issues,
      seatUsed: seatUsed,
      seatOffered: seatOffered,
      utilization: seatOffered > 0 ? (seatUsed / seatOffered) * 100 : 0,
      byDay: settings.days.map(function (day, index) {
        return { day: day, count: dayLoads[index] };
      }),
      instructorLoads: Array.from(instructorLoads.values()).sort(function (a, b) { return b.count - a.count; }),
      roomUsage: roomUsageList
    };
  }

  /* ------------------------------------------------------------------ */
  /* public entry point                                                  */
  /* ------------------------------------------------------------------ */

  function run(data, settings, engineKey, options) {
    options = options || {};
    const started = Date.now();
    const solver = engineKey === 'greedy' ? solveGreedy : engineKey === 'coloring' ? solveColoring : solveCSP;
    const base = solver(data, settings);
    let assignment = base.assignment;
    let dp = null;

    if (options.dp !== false) {
      dp = optimiseRooms(base.sessions, assignment, data);
      assignment = dp.assignment;
    }

    const analysis = analyse(base.sessions, assignment, data, settings);

    const log = [];
    log.push('Engine: ' + (ENGINE_LABELS[engineKey] || ENGINE_LABELS.csp));
    log.push('Placed ' + analysis.scheduled + ' of ' + analysis.total + ' weekly sessions in ' + (Date.now() - started) + ' ms.');
    if (base.stats.nodes !== undefined) log.push('Search effort: ' + base.stats.nodes + ' nodes examined, ' + (base.stats.backtracks || 0) + ' backtracks.');
    if (base.stats.coloursUsed !== undefined) log.push('Graph colouring used ' + base.stats.coloursUsed + ' distinct time slots.');
    if (base.unscheduled.length) log.push('Could not place ' + base.unscheduled.length + ' session(s) without breaking hard constraints.');
    if (dp) {
      log.push('DP room optimisation over ' + dp.slots + ' time slots (' + dp.states + ' subset states) reclaimed ' + Math.max(0, dp.beforeWaste - dp.afterWaste) + ' wasted seats.');
    }
    log.push(analysis.conflicts.length === 0
      ? 'Hard constraints satisfied: no instructor, cohort or room clashes.'
      : analysis.conflicts.length + ' constraint violation(s) detected - inspect the report.');

    return {
      engine: engineKey,
      engineLabel: ENGINE_LABELS[engineKey] || ENGINE_LABELS.csp,
      sessions: base.sessions,
      assignment: assignment,
      unscheduled: base.unscheduled,
      stats: base.stats,
      dp: dp,
      analysis: analysis,
      elapsed: Date.now() - started,
      log: log
    };
  }

  function exportRows(result) {
    const sessionById = new Map(result.sessions.map(function (s) { return [s.id, s]; }));
    const roomNames = new Map(((result.analysis && result.analysis.roomUsage) || []).map(function (room) {
      return [room.id, room.name];
    }));
    const rows = [['Day', 'Time', 'Code', 'Subject', 'Type', 'Instructor', 'Room', 'Cohort', 'Enrolled']];
    const entries = [];
    result.assignment.forEach(function (value, id) {
      entries.push({ value: value, session: sessionById.get(id) });
    });
    entries.sort(function (a, b) {
      return a.value.d - b.value.d || a.value.s - b.value.s || a.session.code.localeCompare(b.session.code);
    });
    entries.forEach(function (entry) {
      const session = entry.session;
      rows.push([
        DEFAULT_SETTINGS.days[entry.value.d],
        DEFAULT_SETTINGS.slots[entry.value.s],
        session.code,
        session.name,
        session.type,
        session.instructorName,
        roomNames.get(entry.value.r) || entry.value.r,
        session.cohort,
        session.enrollment
      ]);
    });
    return rows;
  }

  root.Engine = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    ROOM_TYPES: ROOM_TYPES,
    SESSION_TYPES: SESSION_TYPES,
    ENGINE_LABELS: ENGINE_LABELS,
    uid: uid,
    roomFits: roomFits,
    run: run,
    exportRows: exportRows
  };
})(typeof window !== 'undefined' ? window : globalThis);
