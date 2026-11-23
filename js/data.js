(function (root) {
  'use strict';

  const SAMPLE_DATA = {
    rooms: [
      { id: 'r1', name: 'LH-101', type: 'Lecture Hall', capacity: 120 },
      { id: 'r2', name: 'LH-102', type: 'Lecture Hall', capacity: 90 },
      { id: 'r3', name: 'SR-201', type: 'Seminar Room', capacity: 45 },
      { id: 'r4', name: 'LAB-1', type: 'Laboratory', capacity: 30 },
      { id: 'r5', name: 'LAB-2', type: 'Laboratory', capacity: 30 }
    ],
    instructors: [
      { id: 'i1', name: 'Dr. Meera Nair', department: 'Computer Science', availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], maxPerDay: 3 },
      { id: 'i2', name: 'Prof. Arjun Rao', department: 'Computer Science', availableDays: ['Monday', 'Wednesday', 'Thursday'], maxPerDay: 3 },
      { id: 'i3', name: 'Dr. Sofia Iqbal', department: 'Computer Science', availableDays: ['Tuesday', 'Wednesday', 'Friday'], maxPerDay: 3 },
      { id: 'i4', name: 'Prof. Daniel Kim', department: 'Mathematics', availableDays: ['Monday', 'Tuesday', 'Thursday'], maxPerDay: 3 },
      { id: 'i5', name: 'Dr. Priya Menon', department: 'Computer Science', availableDays: ['Wednesday', 'Thursday', 'Friday'], maxPerDay: 3 },
      { id: 'i6', name: 'Prof. Lucas Silva', department: 'Electronics', availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Friday'], maxPerDay: 3 }
    ],
    subjects: [
      { id: 's1', code: 'CS301', name: 'Design & Analysis of Algorithms', instructorId: 'i1', cohort: 'CS-3A', sessionType: 'Lecture', sessionsPerWeek: 3, enrollment: 60 },
      { id: 's2', code: 'CS302', name: 'Operating Systems', instructorId: 'i2', cohort: 'CS-3A', sessionType: 'Lecture', sessionsPerWeek: 3, enrollment: 60 },
      { id: 's3', code: 'CS303', name: 'Database Systems', instructorId: 'i3', cohort: 'CS-3B', sessionType: 'Lecture', sessionsPerWeek: 3, enrollment: 55 },
      { id: 's4', code: 'CS351', name: 'Algorithms Lab', instructorId: 'i1', cohort: 'CS-3A', sessionType: 'Lab', sessionsPerWeek: 1, enrollment: 28 },
      { id: 's5', code: 'CS352', name: 'Operating Systems Lab', instructorId: 'i2', cohort: 'CS-3A', sessionType: 'Lab', sessionsPerWeek: 1, enrollment: 28 },
      { id: 's6', code: 'CS353', name: 'Database Lab', instructorId: 'i3', cohort: 'CS-3B', sessionType: 'Lab', sessionsPerWeek: 1, enrollment: 26 },
      { id: 's7', code: 'MA201', name: 'Discrete Mathematics', instructorId: 'i4', cohort: 'CS-2A', sessionType: 'Lecture', sessionsPerWeek: 3, enrollment: 70 },
      { id: 's8', code: 'CS201', name: 'Data Structures', instructorId: 'i5', cohort: 'CS-2A', sessionType: 'Lecture', sessionsPerWeek: 3, enrollment: 75 },
      { id: 's9', code: 'CS251', name: 'Data Structures Lab', instructorId: 'i5', cohort: 'CS-2A', sessionType: 'Lab', sessionsPerWeek: 1, enrollment: 30 },
      { id: 's10', code: 'EC202', name: 'Digital Logic Design', instructorId: 'i6', cohort: 'EC-2A', sessionType: 'Lecture', sessionsPerWeek: 2, enrollment: 65 },
      { id: 's11', code: 'EC252', name: 'Digital Logic Lab', instructorId: 'i6', cohort: 'EC-2A', sessionType: 'Lab', sessionsPerWeek: 1, enrollment: 24 },
      { id: 's12', code: 'HS101', name: 'Technical Communication', instructorId: 'i4', cohort: 'COMMON', sessionType: 'Tutorial', sessionsPerWeek: 2, enrollment: 80 }
    ]
  };

  root.SAMPLE_DATA = SAMPLE_DATA;
})(typeof window !== 'undefined' ? window : globalThis);
