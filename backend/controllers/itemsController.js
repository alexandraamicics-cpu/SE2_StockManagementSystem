const pool = require('../db');
const { logActivity } = require('../utils/logger');
const { recomputeItemStatus, isWaitingStock } = require('../utils/status');

async function logWaitingStockIfNeeded(userId, itemId, itemName, statusInfo) {
  if (!statusInfo || !statusInfo.changed || statusInfo.status !== 'WAITING_STOCK') return;

  await logActivity({
    user_id: userId,
    action_type: 'WAITING_STOCK',
    item_id: itemId,
    description: `Item moved to waiting stock (${itemName || `Item #${itemId}`})`
  });
}

async function getItems(req, res) {
  const search = req.query.search ? `%${req.query.search}%` : '%';
  try {
    const [rows] = await pool.query(
      `SELECT i.*, b.brand_name,
              SUM(CASE WHEN p.status = 'AVAILABLE' AND p.is_deleted = 0 THEN 1 ELSE 0 END) AS qty_available,
              SUM(CASE WHEN p.status = 'SOLD' AND p.is_deleted = 0 THEN 1 ELSE 0 END) AS qty_sold,
              SUM(CASE WHEN p.is_deleted = 0 THEN 1 ELSE 0 END) AS qty_total
       FROM items i
       JOIN brands b ON i.brand_id = b.brand_id
       LEFT JOIN pairs p ON p.item_id = i.item_id
       WHERE i.is_deleted = 0 AND (
         i.item_name LIKE ? OR i.sku LIKE ? OR i.colorway LIKE ? OR b.brand_name LIKE ?
       )
       GROUP BY i.item_id
       ORDER BY i.created_at DESC`,
      [search, search, search, search]
    );

    const items = [];
    for (const row of rows) {
      const qtyAvailable = Number(row.qty_available || 0);
      const qtySold = Number(row.qty_sold || 0);
      const qtyTotal = Number(row.qty_total || 0);
      const targetQty = Number(row.target_qty || 1);
      const status = isWaitingStock(qtyAvailable, targetQty) ? 'WAITING_STOCK' : 'IN_STOCK';

      if (row.status !== status) {
        await pool.query(
          `UPDATE items SET status = ?, updated_at = NOW() WHERE item_id = ?`,
          [status, row.item_id]
        );
      }

      items.push({
        ...row,
        target_qty: targetQty,
        qty_available: qtyAvailable,
        qty_sold: qtySold,
        qty_total: qtyTotal,
        status
      });
    }

    return res.json({ items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch items' });
  }
}

async function createItem(req, res) {
  const { item_name, sku, colorway, brand_id, target_qty } = req.body;
  const parsedTargetQty = Number(target_qty);
  if (!item_name || !sku || !colorway || !brand_id || !Number.isFinite(parsedTargetQty) || parsedTargetQty < 1) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [[dup]] = await pool.query('SELECT item_id FROM items WHERE sku = ?', [sku]);
    if (dup) return res.status(409).json({ error: 'Item with this SKU already exists' });

    const [result] = await pool.query(
      `INSERT INTO items (item_name, sku, colorway, brand_id, target_qty, status, last_movement_type, last_movement_at)
       VALUES (?, ?, ?, ?, ?, 'WAITING_STOCK', 'CREATED', NOW())`,
      [item_name, sku, colorway, brand_id, Math.floor(parsedTargetQty)]
    );

    const itemId = result.insertId;

    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'ADD_ITEM',
      item_id: itemId,
      description: `Added item ${item_name}`
    });

    return res.json({ item_id: itemId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to add item' });
  }
}

async function updateItem(req, res) {
  const { itemId } = req.params;
  const { item_name, colorway, brand_id, target_qty } = req.body;

  try {
    const parsedTargetQty = Number(target_qty);
    if (!item_name || !colorway || !brand_id || !Number.isFinite(parsedTargetQty) || parsedTargetQty < 1) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await pool.query(
      `UPDATE items
       SET item_name = ?, colorway = ?, brand_id = ?, target_qty = ?, updated_at = NOW(), last_movement_type = 'EDITED', last_movement_at = NOW()
       WHERE item_id = ? AND is_deleted = 0`,
      [item_name, colorway, brand_id, Math.floor(parsedTargetQty), itemId]
    );

    await recomputeItemStatus(itemId);

    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'EDIT_ITEM',
      item_id: itemId,
      description: 'Edited item'
    });

    return res.json({ message: 'Item updated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to edit item' });
  }
}

async function markItemSold(req, res) {
  const { itemId } = req.params;
  const { sold_price } = req.body || {};

  try {
    const [[item]] = await pool.query(
      `SELECT item_id, item_name, status, target_qty
       FROM items
       WHERE item_id = ? AND is_deleted = 0`,
      [itemId]
    );

    if (!item) return res.status(404).json({ error: 'Item not found' });

    const [[countRow]] = await pool.query(
      `SELECT
         SUM(CASE WHEN status = 'AVAILABLE' AND is_deleted = 0 THEN 1 ELSE 0 END) AS available_count,
         SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) AS total_count
       FROM pairs
       WHERE item_id = ?`,
      [itemId]
    );

    const availableCount = Number(countRow.available_count || 0);
    const waiting = isWaitingStock(availableCount, item.target_qty);

    if (waiting) {
      const statusInfo = await recomputeItemStatus(itemId);
      await logWaitingStockIfNeeded(req.session.user.user_id, itemId, item.item_name, statusInfo);
      return res.status(400).json({ error: 'This item is in Waiting Stock and cannot be sold yet until restocked.' });
    }

    const [[pair]] = await pool.query(
      `SELECT pair_id, selling_price
       FROM pairs
       WHERE item_id = ? AND status = 'AVAILABLE' AND is_deleted = 0
       ORDER BY created_at ASC, pair_id ASC
       LIMIT 1`,
      [itemId]
    );

    if (!pair) {
      const statusInfo = await recomputeItemStatus(itemId);
      await logWaitingStockIfNeeded(req.session.user.user_id, itemId, item.item_name, statusInfo);
      return res.status(400).json({ error: 'This item is in Waiting Stock and cannot be sold yet until restocked.' });
    }

    const priceToUse = sold_price || pair.selling_price;

    await pool.query(
      `UPDATE pairs SET status = 'SOLD', sold_at = NOW(), sold_price = ? WHERE pair_id = ?`,
      [priceToUse, pair.pair_id]
    );

    await pool.query(
      `UPDATE items SET last_movement_type = 'SOLD', last_movement_at = NOW() WHERE item_id = ?`,
      [itemId]
    );

    const statusInfo = await recomputeItemStatus(itemId);

    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'MARK_SOLD',
      item_id: itemId,
      pair_id: pair.pair_id,
      quantity: 1,
      sold_price: priceToUse,
      description: 'Pair marked sold via item endpoint'
    });

    await logWaitingStockIfNeeded(req.session.user.user_id, itemId, item.item_name, statusInfo);

    return res.json({ message: 'Item marked as sold successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to mark item as sold' });
  }
}

async function deleteItem(req, res) {
  const { itemId } = req.params;
  try {
    await pool.query('UPDATE items SET is_deleted = 1 WHERE item_id = ?', [itemId]);
    await pool.query('UPDATE pairs SET is_deleted = 1 WHERE item_id = ?', [itemId]);

    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'DELETE_ITEM',
      item_id: itemId,
      description: 'Deleted item'
    });

    return res.json({ message: 'Item deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete item' });
  }
}

module.exports = {
  getItems,
  createItem,
  updateItem,
  markItemSold,
  deleteItem
};
