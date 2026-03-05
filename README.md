# 1800 Soles – Stock Management System

Full-stack implementation (Node.js + Express + MySQL + vanilla HTML/CSS/JS) matching the provided Figma prototype.

## Tech
- Frontend: Vanilla HTML/CSS/JS, Chart.js (CDN), Font Awesome, Google Fonts (Poppins)
- Backend: Node.js, Express.js, express-session with MySQL store, bcrypt
- Database: MySQL (`db_1800soles_stock_management`)

## Setup
1. Create `.env` from template:
   ```bash
   cp .env.example .env
   # set DB_HOST, DB_USER, DB_PASSWORD, DB_PORT, SESSION_SECRET
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Initialize DB (schema + seed):
   ```bash
   npm run db:init
   ```
   - Seeds user: `20260002 / g@gmail.com / Password123!`
   - Adds 4 items + pairs + activity logs.
4. Run dev server:
   ```bash
   npm run dev
   ```
   Server runs on `http://localhost:4000`.

## Scripts
- `npm run dev` — start Express with nodemon.
- `npm run db:init` — apply schema and seed data.

## Notes
- Auth uses server-side sessions stored in MySQL.
- Inventory status auto-updates based on target quantity (≤25% → Waiting Stock).
- All actions log into `activity_log` for activity/analytics views.
