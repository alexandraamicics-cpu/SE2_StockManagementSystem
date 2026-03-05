const express = require('express');
const { requireAuth } = require('../middleware/auth');
const activityController = require('../controllers/activityController');

const router = express.Router();

router.use(requireAuth);
router.get('/', activityController.getActivity);

module.exports = router;
