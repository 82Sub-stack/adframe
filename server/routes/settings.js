const router = require('express').Router();
const { getPublicSettings } = require('../services/settings-store');
router.get('/', (req, res) => res.json({ settings: getPublicSettings() }));
router.put('/', (req, res) => res.status(405).set('Allow', 'GET').json({ error: 'Server settings are managed by the deployment administrator.' }));
module.exports = router;
