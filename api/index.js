const express = require('express');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '../config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const { registerWebPairingRoutes, renderPairingPage } = require('../src/Utils/webPairing');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

registerWebPairingRoutes(app, () => null, null);

// Fallback route for Vercel rewrites
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return next();
    }
    const defaultNum = req.query.phone || req.query.number || process.env.NUMBER || process.env.BOT_NUMBER || '';
    res.setHeader('Content-Type', 'text/html');
    res.send(renderPairingPage(defaultNum));
});

module.exports = app;
