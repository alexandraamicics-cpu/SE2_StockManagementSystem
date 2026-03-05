const express = require('express');
const { requireAuth } = require('../middleware/auth');
const overviewController = require('../controllers/overviewController');

const router = express.Router();

router.use(requireAuth);
router.get('/', overviewController.getOverview);

module.exports = router;
