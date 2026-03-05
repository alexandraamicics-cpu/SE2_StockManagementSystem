const {
  getSummaryMetrics,
  getSalesTrend,
  getStockMovementTrend,
  getStockStatusDistribution,
  getBrandDistribution,
  getSizeDistribution,
  getStockAgeAnalysis,
  getProfitPerMonth
} = require('../utils/metrics');

function toAnalyticsSummary(summary) {
  return {
    total_sales: Number(summary.total_sales || 0),
    total_profit: Number(summary.total_profit || 0),
    inventory_value: Number(summary.inventory_value || 0),
    sell_through_rate: Number(summary.sell_through_rate || 0),
    sold_pairs: Number(summary.sold_pairs || 0),
    available_pairs: Number(summary.available_pairs || 0)
  };
}

async function getAnalytics(req, res) {
  try {
    const [rawSummary, salesTrend, stockMovementTrend, stockStatusDistribution, brandDistribution, sizeDistribution, profitPerMonth] = await Promise.all([
      getSummaryMetrics(),
      getSalesTrend(14),
      getStockMovementTrend(14),
      getStockStatusDistribution(),
      getBrandDistribution(),
      getSizeDistribution(),
      getProfitPerMonth(12)
    ]);

    return res.json({
      summary: toAnalyticsSummary(rawSummary),
      sales_trend: salesTrend,
      stock_movement_trend: stockMovementTrend,
      stock_status_distribution: stockStatusDistribution,
      brand_distribution: brandDistribution,
      size_distribution: sizeDistribution,
      profit_per_month: profitPerMonth
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load analytics data' });
  }
}

async function getAnalyticsSummary(req, res) {
  try {
    const summary = await getSummaryMetrics();
    return res.json(toAnalyticsSummary(summary));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load summary' });
  }
}

async function getAnalyticsCharts(req, res) {
  try {
    const [movement, sizes, brands, ages] = await Promise.all([
      getStockMovementTrend(14),
      getSizeDistribution(),
      getBrandDistribution(),
      getStockAgeAnalysis()
    ]);

    return res.json({ movement, sizes, brands, ages });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load charts' });
  }
}

module.exports = {
  getAnalytics,
  getAnalyticsSummary,
  getAnalyticsCharts
};
