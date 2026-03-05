const pool = require('../db');
const { logActivity } = require('../utils/logger');
const { recomputeItemStatus, isWaitingStock } = require('../utils/status');

function normalizeGender(gender) {
  const value = String(gender || '').trim().toUpperCase();
  if (value === 'MALE' || value === 'M') return 'Male';
  if (value === 'FEMALE' || value === 'F') return 'Female';
  return null;
}

function formatSizeGender(usSize, gender) {
  const size = String(usSize || '').trim();
  const g = String(gender || '').trim();
  return [size, g].filter(Boolean).join(' ');
}

async function nextPairCode() {
  const [[row]] = await pool.query(`SELECT pair_code FROM pairs ORDER BY pair_id DESC LIMIT 1`);
  if (!row || !row.pair_code) return 'P-001';
  const num = parseInt(row.pair_code.replace(/\D/g, ''), 10) + 1;
  return `P-${String(num).padStart(3, '0')}`;
}

async function logWaitingStockIfNeeded(userId, itemId, itemName, statusInfo) {
  if (!statusInfo || !statusInfo.changed || statusInfo.status !== 'WAITING_STOCK') return;

  await logActivity({
    user_id: userId,
    action_type: 'WAITING_STOCK',
    item_id: itemId,
    description: `Item moved to waiting stock (${itemName || `Item #${itemId}`})`
  });
}

async function getPairsByItem(req, res) {
  const { itemId } = req.params;
  try {
    const [pairs] = await pool.query(
      `SELECT pair_id, pair_code, us_size, gender, pair_condition, cost_price, selling_price, status, sold_at, sold_price
       FROM pairs
       WHERE item_id = ? AND is_deleted = 0`,
      [itemId]
    );
    return res.json({ pairs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch pairs' });
  }
}

async function createPair(req, res) {
  const { itemId } = req.params;
  const { us_size, gender, pair_condition, cost_price, selling_price } = req.body;
  const normalizedGender = normalizeGender(gender);

  if (!us_size || !normalizedGender || !pair_condition || !cost_price || !selling_price) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const code = await nextPairCode();
    const [result] = await pool.query(
      `INSERT INTO pairs (pair_code, item_id, us_size, gender, pair_condition, cost_price, selling_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, itemId, String(us_size).trim(), normalizedGender, pair_condition, cost_price, selling_price]
    );

    await pool.query(
      `UPDATE items SET last_movement_type = 'STOCK_IN', last_movement_at = NOW() WHERE item_id = ?`,
      [itemId]
    );

    const statusInfo = await recomputeItemStatus(itemId);

    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'STOCK_IN',
      item_id: itemId,
      pair_id: result.insertId,
      quantity: 1,
      description: `Stocked in new pair (${formatSizeGender(us_size, normalizedGender)})`
    });

    return res.json({ pair_id: result.insertId, pair_code: code, status: statusInfo?.status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to add pair' });
  }
}

async function updatePair(req, res) {
  const { pairId } = req.params;
  const { us_size, gender, pair_condition, cost_price, selling_price } = req.body;
  const normalizedGender = normalizeGender(gender);

  if (!us_size || !normalizedGender || !pair_condition || !cost_price || !selling_price) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await pool.query(
      `UPDATE pairs
       SET us_size = ?, gender = ?, pair_condition = ?, cost_price = ?, selling_price = ?, updated_at = NOW()
       WHERE pair_id = ? AND is_deleted = 0`,
      [String(us_size).trim(), normalizedGender, pair_condition, cost_price, selling_price, pairId]
    );

    const [[pair]] = await pool.query('SELECT item_id FROM pairs WHERE pair_id = ?', [pairId]);
    if (pair) {
      await pool.query(
        `UPDATE items SET last_movement_type = 'EDITED', last_movement_at = NOW() WHERE item_id = ?`,
        [pair.item_id]
      );
      await recomputeItemStatus(pair.item_id);
    }

    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'EDIT_PAIR',
      pair_id: pairId,
      item_id: pair ? pair.item_id : null,
      description: `Edited pair details (${formatSizeGender(us_size, normalizedGender)})`
    });

    return res.json({ message: 'Pair updated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to edit pair' });
  }
}

async function markPairSold(req, res) {
  const { pairId } = req.params;
  const { sold_price } = req.body;

  try {
    const [[pair]] = await pool.query(
      `SELECT p.*, i.item_id, i.status AS item_status, i.item_name, i.target_qty
       FROM pairs p
       JOIN items i ON p.item_id = i.item_id
       WHERE p.pair_id = ? AND p.is_deleted = 0 AND i.is_deleted = 0`,
      [pairId]
    );

    if (!pair) return res.status(404).json({ error: 'Pair not found' });
    if (pair.status === 'SOLD') {
      return res.status(409).json({ error: 'Pair is already marked as sold.' });
    }

    const [[countRow]] = await pool.query(
      `SELECT
         SUM(CASE WHEN status = 'AVAILABLE' AND is_deleted = 0 THEN 1 ELSE 0 END) AS available_count,
         SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) AS total_count
       FROM pairs
       WHERE item_id = ?`,
      [pair.item_id]
    );

    const availableCount = Number(countRow.available_count || 0);
    const waiting = isWaitingStock(availableCount, pair.target_qty);

    if (waiting) {
      const statusInfo = await recomputeItemStatus(pair.item_id);
      await logWaitingStockIfNeeded(req.session.user.user_id, pair.item_id, pair.item_name, statusInfo);
      return res.status(400).json({ error: 'This item is in Waiting Stock and cannot be sold yet until restocked.' });
    }

    const priceToUse = sold_price || pair.selling_price;

    await pool.query(
      `UPDATE pairs SET status = 'SOLD', sold_at = NOW(), sold_price = ? WHERE pair_id = ?`,
      [priceToUse, pairId]
    );

    await pool.query(
      `UPDATE items SET last_movement_type = 'SOLD', last_movement_at = NOW() WHERE item_id = ?`,
      [pair.item_id]
    );

    const statusInfo = await recomputeItemStatus(pair.item_id);

    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'MARK_SOLD',
      item_id: pair.item_id,
      pair_id: pairId,
      quantity: 1,
      sold_price: priceToUse,
      description: `Pair marked sold (${formatSizeGender(pair.us_size, pair.gender)})`
    });

    await logWaitingStockIfNeeded(req.session.user.user_id, pair.item_id, pair.item_name, statusInfo);

    return res.json({ message: 'Pair marked as sold' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to mark sold' });
  }
}

async function deletePair(req, res) {
  const { pairId } = req.params;
  try {
    await pool.query('UPDATE pairs SET is_deleted = 1 WHERE pair_id = ?', [pairId]);
    const [[pair]] = await pool.query(
      `SELECT p.item_id, p.us_size, p.gender, i.item_name
       FROM pairs p
       LEFT JOIN items i ON p.item_id = i.item_id
       WHERE p.pair_id = ?`,
      [pairId]
    );

    if (pair && pair.item_id) {
      const statusInfo = await recomputeItemStatus(pair.item_id);
      await logWaitingStockIfNeeded(req.session.user.user_id, pair.item_id, pair.item_name, statusInfo);
    }

    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'DELETE_PAIR',
      pair_id: pairId,
      item_id: pair ? pair.item_id : null,
      description: `Deleted pair${pair ? ` (${formatSizeGender(pair.us_size, pair.gender)})` : ''}`
    });

    return res.json({ message: 'Pair deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete pair' });
  }
}

module.exports = {
  getPairsByItem,
  createPair,
  updatePair,
  markPairSold,
  deletePair
};
