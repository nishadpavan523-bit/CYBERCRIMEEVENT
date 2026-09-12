# CyberTrace — Digital Crime Scene

A fictional cybercrime-investigation game for a college tech fest, rebuilt as a complete platform:
**Python + FastAPI + SQLAlchemy + MySQL** backend, native **WebSocket** for live admin monitoring
and investigation sessions, and a vanilla-JS frontend with a cinematic 3D landing intro.

Teams can attempt all **three** cases — **CT-2074**, **IN-1042**, **WF-2203** — in whatever order
they like, each with its own 45-minute clock, evidence set, hints, and score. Everything is
fictional, written for a college tech-fest competition. No real hacking techniques, credentials,
or systems are involved anywhere.

## What's included

- **Cinematic 3D landing page** — a suspicious packet travels across a simulated network, a threat
  is detected, then the role-based login console (Admin / Team Leader / Team Member) is revealed.
- **Case selection screen** — after logging in, a team sees all three cases with its own
  per-case progress (not started / in progress / completed + score) and picks what to solve first.
- **Full investigation console** — evidence tabs (email, browser, login, chat, transactions,
  documents, forensic items), auto-graded Q&A, a hint system with point penalties, a Base64
  decoder + hash verifier in the Forensic Lab, a drag-orderable evidence board, and a final case
  report — auto-graded, server-side timer that survives refreshes.
- **Admin dashboard** — create teams + leader logins, live per-team per-case progress, a real-time
  activity feed over WebSocket, CSV export, and a leaderboard.
- **Investigation Session** — optional, explicit-consent camera/microphone sharing between a team
  and the authorized admin panel (WebRTC signaled over the same WebSocket). Nothing is recorded;
  nothing is ever turned on remotely — only the participant can start/stop their own stream.
- **Public leaderboard page**, visible to every logged-in role.

## 1. Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env`:
- Set `DATABASE_URL` to your MySQL connection string, e.g.
  `mysql+pymysql://root:password@localhost:3306/cybertrace`
  (for quick local testing without MySQL, use `sqlite:///./cybertrace.db` instead — every model
  is written to work with both).
- Set a real `SECRET_KEY`, and change `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

If using MySQL, create the database first:

```sql
CREATE DATABASE cybertrace CHARACTER SET utf8mb4;
```

Seed the admin account and all three fictional cases:

```bash
python seed.py
```

Run the API + frontend (FastAPI serves both from the same process):

```bash
uvicorn main:app --reload --port 8000
```

- App: http://127.0.0.1:8000
- Swagger docs: http://127.0.0.1:8000/docs

Safe to re-run `python seed.py` any time — every step checks for existing data first.

## 2. Logging in

- **Admin:** the `ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env`. From the Admin Dashboard,
  create each team (this also creates its leader login) — no case assignment needed, teams can
  attempt all three.
- **Team Leader:** the username/password an admin gave them. Leaders can add up to 5 teammates
  from the case-selection page.
- **Team Member:** a username/password their leader created for them.

## 3. Architecture notes

- `models.py` — SQLAlchemy models. `TeamCase` is the key addition over the old single-case
  design: one row per (team, case) tracks that pair's status/timer/score, which is what lets a
  team attempt all three cases independently and in any order.
- `security.py` — password hashing (bcrypt via passlib) + JWT (python-jose) + role-based
  dependencies (`require_roles('admin')`, etc.).
- `ws_manager.py` / `routers/ws.py` — a single `/ws` WebSocket endpoint replaces Socket.IO:
  presence, the live activity feed, and WebRTC signaling relay for investigation sessions.
- `routers/team.py` — the investigation console API, all scoped under `/api/team/case/{case_id}/…`.
- Never trust the client for scores, timers, or completion status — all of it is validated and
  computed server-side (see `routers/team.py`).

## 4. Frontend structure

Static, no build step — `frontend/index.html`, `cases.html`, `competition.html`, `admin.html`,
`leaderboard.html`, plus `css/style.css` and `js/*.js`. FastAPI serves these directly (see
`main.py`), so you don't need a separate frontend server.
