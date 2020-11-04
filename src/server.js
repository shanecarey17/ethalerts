const path = require('path');

const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');

const auth = require('./auth.js');
const sms = require('./sms.js');

const getMYSQLConnection = () => {
    var connection = mysql.createConnection({
        host     : 'aa1jy7y9lrsopho.c8b1ze3faytr.us-east-1.rds.amazonaws.com',
        user     : 'ethalertsdb',
        password : 'ethalertsdbpassword', 
        port     : 3306
    });

    connection.connect();

    return connection;
};

const _init = (uniswapTracker, chainlinkTracker) => {
    const app = express();

    let jsonParser = bodyParser.json();

    let urlEncodedParser = bodyParser.urlencoded({ extended: false });

    let authMiddleware = auth.getVerifyMiddleware();

    app.get('/api', (req, res) => {
        console.log('HERE');
        res.json({
            data: 'Hello world'
        });
    });

    let alertIDCounter = 0;
    let allAlerts = {};

    app.post('/api/setAlert', jsonParser, (req, res) => {
        let alertID = alertIDCounter++;

        let alertParams = {
            id: alertID,
            user: 'me',
            options: req.body,
            cancelled: false
        };

        allAlerts[alertID] = alertParams;

        try {
            let domain = alertParams.options.domain;

            if (domain === 'uniswap') {
                uniswapTracker.addAlert(alertParams, (data, alert) => {
                    sms.publishSMS(JSON.stringify(data), '+17737469829');
                    console.log('uniswap alert triggered');
                    console.log(JSON.stringify(data));
                });
            } else if (domain === 'chainlink') {
                chainlinkTracker.addAlert(alertParams, (data) => {
                    console.log('chainlink alert triggered');
                });
            } else {
                throw new Error('invalid domain');
            }
        } catch (err) {
            err.statusCode = 400; // For express
            throw err;
        }

        res.json({ alertID });

        console.log(`CREATED ALERT ${JSON.stringify(alertParams)}`);
    });

    app.post('/cancelAlert', jsonParser, (req, res) => {
        let alertID = Number(req.body.alertID);

        let alert = allAlerts[alertID];

        alert.cancelled = true;

        delete allAlerts[alertID];

        res.send('');

        console.log(`DELETED ALERT ${alertID}`);
    });

    app.get('/api/pairReserves', (req, res) => {
        res.json(uniswapTracker.getPairReserves());
    });

    app.get('/api/prices', (req, res) => {
        res.json(chainlinkTracker.getPrices());
    });

    app.use(express.static(path.join(__dirname, '../client/build')));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../client/build/index.html'));
    });

    app.listen(8080, () => {
        console.log('App listening on port 8080');
    });
};

module.exports.init = _init;
