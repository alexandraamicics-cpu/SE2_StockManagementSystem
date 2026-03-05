const pool = require('../db');

function getWaitingThreshold(targetQty) {
  const target = Number(targetQty || 0);
  if (target <= 0) return 0;
  return target * 0.25;
}

function isWaitingStock(available, targetQty) {
  const availableCount = Number(available || 0);
  const target = Number(targetQty || 0);
  if (target <= 0) return availableCount <= 0;
  const threshold = getWaitingThreshold(target);
  return availableCount <= threshold;
}

async function recomputeItemStatus(itemId) {
  const [[item]] = await pool.query(
    `SELECT item_id, target_qty, status AS previous_status
     FROM items
     WHERE item_id = ? AND is_deleted = 0`,
    [itemId]
  );

  if (!item) return null;

  const [[counts]] = await pool.query(
    `SELECT
        SUM(CASE WHEN status = 'AVAILABLE' AND is_deleted = 0 THEN 1 ELSE 0 END) AS available_count,
        SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) AS total_count,
        SUM(CASE WHEN status = 'SOLD' AND is_deleted = 0 THEN 1 ELSE 0 END) AS sold_count
     FROM pairs
     WHERE item_id = ?`,
    [itemId]
  );

  const available = Number(counts.available_count || 0);
  const total = Number(counts.total_count || 0);
  const sold = Number(counts.sold_count || 0);
  const targetQty = Number(item.target_qty || 0);
  const threshold = getWaitingThreshold(targetQty);

  const status = isWaitingStock(available, targetQty) ? 'WAITING_STOCK' : 'IN_STOCK';
  const changed = status !== item.previous_status;

  if (changed) {
    await pool.query(
      `UPDATE items SET status = ?, updated_at = NOW() WHERE item_id = ?`,
      [status, itemId]
    );
  }

  return {
    status,
    previous_status: item.previous_status,
    changed,
    available,
    total,
    sold,
    target_qty: targetQty,
    threshold
  };
}

module.exports = { recomputeItemStatus, getWaitingThreshold, isWaitingStock };
