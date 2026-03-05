const {
  getSummaryMetrics,
  getRecentActivity,
  getSalesTrend,
  getStockStatusDistribution
} = require('../utils/metrics');

function buildStockStatusText(summary, stockStatusSummary) {
  const fallbackMap = new Map((stockStatusSummary || []).map((row) => [row.status_label, Number(row.count || 0)]));

  const inStockItems = Number(summary.in_stock ?? fallbackMap.get('In Stock') ?? 0);
  const waitingStockItems = Number(summary.waiting_stock ?? fallbackMap.get('Waiting Stock') ?? 0);
  const availablePairs = Number(summary.available_pairs || 0);

  return {
    in_stock_items: inStockItems,
    waiting_stock_items: waitingStockItems,
    in_stock_pairs: availablePairs,
    summary_text: `In Stock: ${availablePairs} pair${availablePairs === 1 ? '' : 's'} | Waiting Stock: ${waitingStockItems} item${waitingStockItems === 1 ? '' : 's'}`,
    in_stock_text: `In Stock: ${availablePairs} pair${availablePairs === 1 ? '' : 's'}`,
    waiting_stock_text: `Waiting Stock: ${waitingStockItems} item${waitingStockItems === 1 ? '' : 's'} (Stock below 25%)`
  };
}

async function getOverview(req, res) {
  try {
    const [summary, recentActivity, salesOverview, stockStatusSummary] = await Promise.all([
      getSummaryMetrics(),
      getRecentActivity(5),
      getSalesTrend(7),
      getStockStatusDistribution()
    ]);

    const stockStatusText = buildStockStatusText(summary, stockStatusSummary);

    return res.json({
      summary,
      recent_activity: recentActivity,
      sales_overview: salesOverview,
      stock_status_text: stockStatusText,
      stock_status_summary: stockStatusSummary
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load overview data' });
  }
}

module.exports = { getOverview };
