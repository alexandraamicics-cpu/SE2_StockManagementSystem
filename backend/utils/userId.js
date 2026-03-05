const pool = require('../db');

async function generateUserId() {
  const now = new Date();
  const year = now.getFullYear();
  const prefix = String(year);
  const [rows] = await pool.query(
    'SELECT MAX(user_id) as maxId FROM users WHERE user_id LIKE ?',
    [`${prefix}%`]
  );
  let nextSeq = 1;
  if (rows[0].maxId) {
    const current = rows[0].maxId;
    const suffix = parseInt(current.slice(4), 10);
    nextSeq = suffix + 1;
  }
  const padded = String(nextSeq).padStart(4, '0');
  return `${prefix}${padded}`;
}

module.exports = { generateUserId };
