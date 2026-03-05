const express = require('express');
const { requireAuth } = require('../middleware/auth');
const settingsController = require('../controllers/settingsController');

const router = express.Router();

router.use(requireAuth);

router.put('/profile', settingsController.updateProfile);
router.put('/password', settingsController.updatePassword);

module.exports = router;
