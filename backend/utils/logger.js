const pool = require('../db');

async function logActivity({ user_id, action_type, item_id = null, pair_id = null, quantity = null, sold_price = null, description = null }) {
  await pool.query(
    `INSERT INTO activity_log (user_id, action_type, item_id, pair_id, quantity, sold_price, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user_id, action_type, item_id, pair_id, quantity, sold_price, description]
  );
}

module.exports = { logActivity };
