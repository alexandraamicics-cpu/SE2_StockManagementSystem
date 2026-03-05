const express = require('express');
const { requireAuth } = require('../middleware/auth');
const pairsController = require('../controllers/pairsController');

const router = express.Router();

router.use(requireAuth);

router.get('/item/:itemId', pairsController.getPairsByItem);
router.post('/item/:itemId', pairsController.createPair);
router.put('/:pairId', pairsController.updatePair);
router.post('/:pairId/mark-sold', pairsController.markPairSold);
router.delete('/:pairId', pairsController.deletePair);

module.exports = router;
