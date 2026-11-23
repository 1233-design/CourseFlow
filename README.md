# CourseFlow — Algorithmic Timetable & Classroom Allocation

CourseFlow is a browser-based planning tool that builds a clash-free weekly class
timetable for a university department. Instead of arranging sessions by hand, the
system treats the timetable as a constraint satisfaction problem and solves it with
four classical algorithms studied in the Design and Analysis of Algorithms course.

**Subject:** Design & Analysis of Algorithm (5.0CE100CO1H)
**Programme:** B.Tech CSE, 5th Semester, Academic Year 2026–2027
**Department of Computer Science and Engineering,**
**Manav Rachna International Institute of Research and Studies**

## Team

| Name | Roll number |
| --- | --- |
| Pranjal Nagar | 1/23/SET/BCS/275 |
| Prabal Joshi | 1/24/SET/BCS/277 |
| Ishika | 1/24/SET/BCS/254 |
| Kasvi Sharma | 1/24/SET/BCS/232 |

**Faculty:** Dr. Nitasha Soni

## What it does

- Maintains the three input registers: **rooms** (capacity and type), **instructors**
  (subjects they can teach, weekly load limit) and **subjects** (weekly sessions,
  expected strength).
- Expands every subject into its weekly sessions and builds the domain of legal
  day–period–room triples for each session.
- Generates a timetable with the engine you select, then reports clashes, seat
  utilisation, free periods and per-day load.
- Exports the finished timetable as CSV.

## Algorithms implemented

| Stage | Algorithm | Purpose |
| --- | --- | --- |
| 1 | Backtracking with the minimum-remaining-values heuristic | Complete CSP search; each session takes the smallest legal domain first |
| 2 | Greedy allocation by session difficulty | Fast constructive pass ordered by fewest remaining options |
| 3 | DSATUR graph colouring | Schedules sessions as vertices, conflicts as edges, picks the most saturated vertex next |
| 4 | Bitmask dynamic programming | Repacks the rooms of every period to maximise seat utilisation |

On the bundled sample dataset (12 subjects, 6 instructors, 5 rooms, 24 weekly
sessions) all three allocation engines place every session with **zero clashes** at
**74.5 % seat utilisation** in 2–16 ms, and the dynamic-programming pass reclaims
**570 wasted seats**.

## Running it

No build step and no dependencies — it is plain HTML, CSS and JavaScript.

Open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Project structure

```
index.html        page layout: rooms, instructors, subjects, timetable, insights
styles.css        styling
js/data.js        sample dataset (rooms, instructors, subjects) and storage defaults
js/engine.js      session expansion, domain building, the four algorithms, CSV export
js/app.js         UI wiring, rendering, filters and event handling
```
