const express = require('express');
const { requireAuth } = require('../middleware/auth');
const itemsController = require('../controllers/itemsController');

const router = express.Router();

router.use(requireAuth);

router.get('/', itemsController.getItems);
router.post('/', itemsController.createItem);
router.put('/:itemId', itemsController.updateItem);
router.post('/:itemId/mark-sold', itemsController.markItemSold);
router.delete('/:itemId', itemsController.deleteItem);

module.exports = router;
