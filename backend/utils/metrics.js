const pool = require('../db');

function toNumber(value) {
  return Number(value || 0);
}

async function getSummaryMetrics() {
  const [[sales]] = await pool.query(
    `SELECT
       COALESCE(SUM(COALESCE(sold_price, selling_price)), 0) AS total_sales,
       COALESCE(SUM(COALESCE(sold_price, selling_price) - cost_price), 0) AS total_profit,
       COUNT(*) AS sold_pairs
     FROM pairs
     WHERE status = 'SOLD' AND is_deleted = 0`
  );

  const [[inventory]] = await pool.query(
    `SELECT
       COALESCE(SUM(cost_price), 0) AS inventory_value,
       COUNT(*) AS available_pairs
     FROM pairs
     WHERE status = 'AVAILABLE' AND is_deleted = 0`
  );

  const [[itemsCount]] = await pool.query(
    `SELECT
       COUNT(*) AS total_items,
       COALESCE(SUM(CASE WHEN status = 'IN_STOCK' THEN 1 ELSE 0 END), 0) AS in_stock,
       COALESCE(SUM(CASE WHEN status = 'WAITING_STOCK' THEN 1 ELSE 0 END), 0) AS waiting_stock
     FROM items
     WHERE is_deleted = 0`
  );

  const soldPairs = toNumber(sales.sold_pairs);
  const availablePairs = toNumber(inventory.available_pairs);
  const totalPairs = soldPairs + availablePairs;
  const sellThroughRate = totalPairs > 0 ? (soldPairs / totalPairs) * 100 : 0;

  return {
    total_sales: toNumber(sales.total_sales),
    total_profit: toNumber(sales.total_profit),
    inventory_value: toNumber(inventory.inventory_value),
    sell_through_rate: sellThroughRate,
    total_items: toNumber(itemsCount.total_items),
    in_stock: toNumber(itemsCount.in_stock),
    waiting_stock: toNumber(itemsCount.waiting_stock),
    sold_pairs: soldPairs,
    available_pairs: availablePairs
  };
}

async function getRecentActivity(limit = 5) {
  const [rows] = await pool.query(
    `SELECT
       al.log_id,
       al.timestamp,
       al.action_type,
       al.item_id,
       al.pair_id,
       al.quantity,
       al.sold_price,
       al.description,
       i.item_name,
       i.colorway,
       p.us_size,
       p.gender,
       b.brand_name
     FROM activity_log al
     LEFT JOIN items i ON al.item_id = i.item_id
     LEFT JOIN pairs p ON al.pair_id = p.pair_id
     LEFT JOIN brands b ON i.brand_id = b.brand_id
     WHERE al.action_type NOT IN ('LOGIN', 'LOGOUT', 'REGISTER')
     ORDER BY al.timestamp DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map((row) => {
    const parts = [];
    if (row.brand_name) parts.push(row.brand_name);
    if (row.item_name) parts.push(row.item_name);
    if (row.colorway) parts.push(row.colorway);
    if (row.us_size) parts.push([row.us_size, row.gender].filter(Boolean).join(' '));

    return {
      log_id: row.log_id,
      timestamp: row.timestamp,
      action_type: row.action_type,
      item_id: row.item_id,
      pair_id: row.pair_id,
      item_display: parts.join(' ').trim(),
      quantity: toNumber(row.quantity) || 1,
      sold_price: row.sold_price === null ? null : toNumber(row.sold_price),
      description: row.description || ''
    };
  });
}

async function getSalesTrend(limitDays = 7) {
  const [rows] = await pool.query(
    `SELECT trend.date,
            trend.sales_amount,
            trend.items_sold
     FROM (
       SELECT
         DATE(sold_at) AS date,
         COALESCE(SUM(COALESCE(sold_price, selling_price)), 0) AS sales_amount,
         COUNT(*) AS items_sold
       FROM pairs
       WHERE status = 'SOLD' AND is_deleted = 0 AND sold_at IS NOT NULL
       GROUP BY DATE(sold_at)
       ORDER BY DATE(sold_at) DESC
       LIMIT ?
     ) AS trend
     ORDER BY trend.date ASC`,
    [limitDays]
  );

  return rows.map((row) => ({
    date: row.date,
    sales_amount: toNumber(row.sales_amount),
    items_sold: toNumber(row.items_sold)
  }));
}

async function getStockMovementTrend(limitDays = 14) {
  const [rows] = await pool.query(
    `SELECT d.day_date AS date,
            COALESCE(SUM(CASE WHEN al.action_type IN ('MARK_SOLD', 'SOLD') THEN 1 ELSE 0 END), 0) AS sold,
            COALESCE(SUM(CASE WHEN al.action_type = 'STOCK_IN' THEN 1 ELSE 0 END), 0) AS stock_in
     FROM (
       SELECT DATE(timestamp) AS day_date
       FROM activity_log
       WHERE action_type IN ('MARK_SOLD', 'SOLD', 'STOCK_IN')
       GROUP BY DATE(timestamp)
       ORDER BY DATE(timestamp) DESC
       LIMIT ?
     ) d
     LEFT JOIN activity_log al
       ON DATE(al.timestamp) = d.day_date
      AND al.action_type IN ('MARK_SOLD', 'SOLD', 'STOCK_IN')
     GROUP BY d.day_date
     ORDER BY d.day_date ASC`,
    [limitDays]
  );

  return rows.map((row) => ({
    date: row.date,
    sold: toNumber(row.sold),
    stock_in: toNumber(row.stock_in)
  }));
}

async function getStockStatusDistribution() {
  const [[row]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'IN_STOCK' THEN 1 ELSE 0 END), 0) AS in_stock,
       COALESCE(SUM(CASE WHEN status = 'WAITING_STOCK' THEN 1 ELSE 0 END), 0) AS waiting_stock
     FROM items
     WHERE is_deleted = 0`
  );

  return [
    { status_label: 'In Stock', count: toNumber(row.in_stock) },
    { status_label: 'Waiting Stock', count: toNumber(row.waiting_stock) }
  ];
}

async function getBrandDistribution() {
  const [rows] = await pool.query(
    `SELECT
       b.brand_name,
       COALESCE(SUM(
         CASE
           WHEN p.status = 'AVAILABLE' AND p.is_deleted = 0 AND i.is_deleted = 0 THEN 1
           ELSE 0
         END
       ), 0) AS count
     FROM brands b
     LEFT JOIN items i ON i.brand_id = b.brand_id
     LEFT JOIN pairs p ON p.item_id = i.item_id
     GROUP BY b.brand_id, b.brand_name
     ORDER BY b.brand_id ASC`
  );

  return rows.map((row) => ({
    brand_name: row.brand_name,
    count: toNumber(row.count)
  }));
}

async function getSizeDistribution() {
  const [rows] = await pool.query(
    `SELECT us_size, gender, COUNT(*) AS count
     FROM pairs
     WHERE status = 'AVAILABLE' AND is_deleted = 0
     GROUP BY us_size, gender`
  );

  return rows.map((row) => ({
    us_size: row.us_size,
    gender: row.gender,
    size_gender_label: [row.us_size, row.gender].filter(Boolean).join(' '),
    count: toNumber(row.count)
  }));
}


async function getStockAgeAnalysis() {
  const [[row]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), created_at) BETWEEN 0 AND 30 THEN 1 ELSE 0 END), 0) AS days_0_30,
       COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), created_at) BETWEEN 31 AND 60 THEN 1 ELSE 0 END), 0) AS days_31_60,
       COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), created_at) BETWEEN 61 AND 90 THEN 1 ELSE 0 END), 0) AS days_61_90,
       COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), created_at) > 90 THEN 1 ELSE 0 END), 0) AS days_90_plus
     FROM pairs
     WHERE status = 'AVAILABLE' AND is_deleted = 0`
  );

  return {
    days_0_30: toNumber(row.days_0_30),
    days_31_60: toNumber(row.days_31_60),
    days_61_90: toNumber(row.days_61_90),
    days_90_plus: toNumber(row.days_90_plus)
  };
}

async function getProfitPerMonth(limitMonths = 12) {
  const [rows] = await pool.query(
    `SELECT monthly.month_key,
            monthly.month_label,
            monthly.sold_pairs,
            monthly.total_sales,
            monthly.total_cost,
            monthly.total_profit
     FROM (
       SELECT
         DATE_FORMAT(sold_at, '%Y-%m') AS month_key,
         DATE_FORMAT(sold_at, '%b %Y') AS month_label,
         COUNT(*) AS sold_pairs,
         COALESCE(SUM(COALESCE(sold_price, selling_price)), 0) AS total_sales,
         COALESCE(SUM(cost_price), 0) AS total_cost,
         COALESCE(SUM(COALESCE(sold_price, selling_price) - cost_price), 0) AS total_profit
       FROM pairs
       WHERE status = 'SOLD' AND is_deleted = 0 AND sold_at IS NOT NULL
       GROUP BY DATE_FORMAT(sold_at, '%Y-%m'), DATE_FORMAT(sold_at, '%b %Y')
       ORDER BY DATE_FORMAT(sold_at, '%Y-%m') DESC
       LIMIT ?
     ) AS monthly
     ORDER BY monthly.month_key ASC`,
    [limitMonths]
  );

  return rows.map((row) => ({
    month_key: row.month_key,
    month_label: row.month_label,
    sold_pairs: toNumber(row.sold_pairs),
    total_sales: toNumber(row.total_sales),
    total_cost: toNumber(row.total_cost),
    total_profit: toNumber(row.total_profit)
  }));
}

module.exports = {
  getSummaryMetrics,
  getRecentActivity,
  getSalesTrend,
  getStockMovementTrend,
  getStockStatusDistribution,
  getBrandDistribution,
  getSizeDistribution,
  getStockAgeAnalysis,
  getProfitPerMonth
};
