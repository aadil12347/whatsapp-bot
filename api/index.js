const express = require('express');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '../config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const { registerWebPairingRoutes } = require('../src/Utils/webPairing');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.redirect('/pair');
});

registerWebPairingRoutes(app, () => null, null);

module.exports = app;
