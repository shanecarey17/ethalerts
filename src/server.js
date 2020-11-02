const path = require('path');

const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');

const auth = require('./auth.js');

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

const _init = (uniswapTracker) => {
    const app = express();

    let jsonParser = bodyParser.json();

    let urlEncodedParser = bodyParser.urlencoded({ extended: false });

    let authMiddleware = auth.getVerifyMiddleware();

    app.get('/', (req, res) => {
        res.json();
    });

    app.get('/api', (req, res) => {
        console.log('HERE');
        res.json({
            data: 'Hello world'
        });
    });

    app.get('/api/setAlert', jsonParser, (req, res) => {
        let alertParams = {};
        uniswapTracker.addAlert(alertParams, (data) => {
            console.log('alert triggered');
        });
        res.json();
    });

    app.get('/api/pairReserves', (req, res) => {
        res.json(uniswapTracker.getPairReserves());
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
