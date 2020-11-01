const process = require('process'); // eslint

require('console-stamp')(console);

const assert = require('assert');
const fs = require('fs');

const ethers = require('ethers');
const web3 = require('web3');

const WebSocket = require('ws');
const http = require('http');

const mysql = require('mysql');

const tokens = require('./tokens.js');
const constants = require('./constants.js');

const UNISWAP_FACTORY_ADDRESS = ethers.utils.getAddress('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'); 

// tokens
const WETH_ADDRESS = ethers.utils.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
const DAI_ADDRESS = ethers.utils.getAddress('0x6B175474E89094C44Da98b954EedeAC495271d0F');
const WBTC_ADDRESS = ethers.utils.getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599');

const selectedTokens = [
    WETH_ADDRESS,
    DAI_ADDRESS,
    WBTC_ADDRESS
];

const ETHERSCAN_API_KEY = '53XIQJECGSXMH9JX5RE8RKC7SEK8A2XRGQ';
const COINBASE_API_KEY = '9437bb42b52baeec3407dbe344e80f84';

const UNISWAP_PAIR_ABI = JSON.parse(fs.readFileSync('abi/IUniswapV2Pair.json')).abi;

// Start code

const applyLog = (log, eventHandlers) => {
    // Handle the event
    let address = ethers.utils.getAddress(log.address); // TODO confirm case correct

    console.log(`EVENT tx ${log.transactionHash} block ${log.blockNumber} logIdx ${log.logIndex} address ${address} topic ${log.topics[0]}`);

    let eventHandler = eventHandlers[address];

    let ev = eventHandler.contract.interface.parseLog(log);

    let handler = eventHandler['on' + ev.name];

    try {
        handler(ev.args, log);
    } catch (err) {
        console.log(ev);
        throw err;
    }
};

const startWebSocketProvider = (startBlock, eventHandlers) => {
    const apiKey = 'ff49fc5d6a654d2fad397b69912d4e3e';

    let w3 = new web3( 
        new web3.providers.WebsocketProvider(`wss://mainnet.infura.io/ws/v3/${apiKey}`)
    );

    // Subscribe to block headers and logs for 
    // contract addresses. After first block is received,
    // request all logs in range [startBlock, newBlock - 1]
    // and set isSyncing to true. Until the request is
    // fulfilled, queue incoming log messages. Once the
    // request has succeeded: apply, in order, the historical
    // logs, then queued logs, then set isSynced to true so that
    // further log messages are applied directly.

    let syncStarted = false;
    let isSynced = false;
    let logQueue =[];
    
    let blockSubscription = w3.eth.subscribe('newBlockHeaders');

    let addresses = Object.keys(eventHandlers);

    blockSubscription.on('data', (blockHeader) => {
        console.log(`NEW BLOCK ${blockHeader.number}`);

        if (!syncStarted) {
            let syncOptions = {
                fromBlock: startBlock,
                toBlock: blockHeader.number - 1,
                address: addresses
            };

            w3.eth.getPastLogs(syncOptions).then((pastLogs) => {
                let pastLogsSorted = pastLogs.sort((a, b) => {
                    if (a.blockNumber === b.blockNumber) {
                        return a.logIndex - b.logIndex;
                    }

                    return a.blockNumber - b.blockNumber;
                });

                for (let log of pastLogsSorted) {
                    applyLog(log, eventHandlers);
                }

                for (let log of logQueue) {
                    applyLog(log, eventHandlers);
                }

                isSynced = true;

                console.log('SYNCED');
            });

            syncStarted = true;
        }

        if (isSynced) {
            for (let handler of Object.values(eventHandlers)) {
                if (handler.contract.address === UNISWAP_FACTORY_ADDRESS) {
                    continue; // TODO hack
                }
                handler.onConfirmation(blockHeader.number);
            }
        }
    });

    let options = {
        address: addresses,
    };

    let subscription = w3.eth.subscribe('logs', options);

    subscription.on('data', (log) => {
        if (!isSynced) {
            logQueue.push(log);
        } else {
           applyLog(log, eventHandlers); 
        }
    });

    subscription.on('changed', (log) => {
        eventHandlers[log.address].onLogRemoved(log);
    });

    subscription.on('error', (err) => {
        console.log('error');
        console.log(err);
        throw new Error(err);
    });

    return w3;
};

const getUniswapFactory = async (provider) => {
    const factoryAbi = JSON.parse(fs.readFileSync('abi/IUniswapV2Factory.json'));
    const uniswapFactory = new ethers.Contract(UNISWAP_FACTORY_ADDRESS, factoryAbi.abi, provider);

    return uniswapFactory;
};

const getUniswapPair = async (factory, token0, token1, provider) => {
    if (token0.address === token1.address) {
        return constants.ZERO_ADDRESS;
    }

/*
    const sortedTokens = [token0, token1].sort();
    const salt = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address', 'address'], sortedTokens));
    const initCodeHash = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f';
    const pairAddress = ethers.utils.getCreate2Address(UNISWAP_FACTORY_ADDRESS, salt, initCodeHash);
*/
    let pairAddress = await factory.getPair(token0.address, token1.address);

    if (pairAddress === constants.ZERO_ADDRESS) {
        return constants.ZERO_ADDRESS;
    }

    let sortedTokens = [token0, token1].sort();

    const uniswapPairContract = new ethers.Contract(pairAddress, UNISWAP_PAIR_ABI, provider);

    console.log(`UNISWAP PAIR ${pairAddress}`);

    return new (function() {
        this.contract = uniswapPairContract;

        this.blockNumber = 0;

        this.token0 = sortedTokens[0];
        this.token1 = sortedTokens[1];

        this.reserve0 = constants.ZERO;
        this.reserve1 = constants.ZERO;

        this.updateQueue = [];
        this.confirmationsThreshold = 5;
        this.lastPublishedBlock = 0;

        this.onConfirmation = (blockNumber) => {
            let lastUpdate = null;
            for (let update of this.updateQueue) {
                if (update.block >= blockNumber - this.confirmationsThreshold) {
                    break;
                }

                lastUpdate = update;
            }

            if (lastUpdate === null) {
                if (this.lastPublishedBlock <= blockNumber - this.confirmationsThreshold * 2) {
                    this._publishMessage(this.reserve0, this.reserve1, this.lastPublishedBlock);
                }

                return;
            }

            this.reserve0 = lastUpdate.reserve0;
            this.reserve1 = lastUpdate.reserve1;
            this.lastPublishedBlock = lastUpdate.log.blockNumber;

            this._publishMessage(this.reserve0, this.reserve1, this.lastPublishedBlock);

            this.updateQueue = this.updateQueue.slice(this.updateQueue.indexOf(lastUpdate) + 1, this.updateQueue.length);
        } 

        this.onLogRemoved = (log) => {
            this.updateQueue = this.updateQueue.filter((update) => {
                return update.log.transactionHash !== log.transactionHash &&
                    update.log.logIndex !== log.logIndex;
            });
        }

        this._publishMessage = (reserve0, reserve1, blockNumber) => {
            publishMessage({
                block: blockNumber,
                type: 'sync',
                name: this.token0.symbol + '-' + this.token1.symbol,
                pair: this.contract.address,
                token0: this.token0.address,
                token1: this.token1.address,
                reserve0: reserve0.toString(),
                reserve1: reserve1.toString()
            });
        }

        this.onMint = ({sender, amount0, amount1}, log) => {
            console.log('MINT');
        }
        this.onBurn = ({sender, amount0, amount1, to}, log) => {
            console.log('BURN');
        }
        this.onSwap = ({sender, amount0In, amount1In, amount0Out, amount1Out, to}, log) => {
            console.log('SWAP');
        }
        this.onSync = ({reserve0, reserve1}, log) => {
            console.log('SYNC');

            this.updateQueue.push({
                log,
                block: log.blockNumber,
                reserve0,
                reserve1
            });
        }
        this.onTransfer = ({}, log) => {
            console.log('TRANSFER');
        }
        this.onApproval = ({}, log) => {
            console.log('APPROVAL');
        }
    })();
};

const clientConnections = new Set();
const publishMessage = (data) => {
    for (let client of clientConnections) {
        client.send(JSON.stringify(data));
    }
};

const handleHTTPRequest = (req, res) => {
    res.writeHead(200);
    res.end();
};

const connectDatabase = () => {
    var connection = mysql.createConnection({
        host     : 'aa1jy7y9lrsopho.c8b1ze3faytr.us-east-1.rds.amazonaws.com',
        user     : 'ethalertsdb',
        password : 'ethalertsdbpassword', 
        port     : 3306
    });
}

const run = async () => {
    let provider = new ethers.providers.InfuraProvider('mainnet', 'd31d552b4e5d41b5b34aec1310fbdf8f');

    let eventHandlers = {};

    let uniswapFactory = await getUniswapFactory(provider);

    eventHandlers[uniswapFactory.address] = new (function() {
        this.contract = uniswapFactory;
        this.onPairCreated = ({}) => {
            console.log('PAIR CREATED')
        }
    })();

    let allTokens = [];
    for (let addr of selectedTokens) {
        allTokens.push(await tokens.TokenFactory.loadToken(addr, provider));
    }   

    let uniswapPairs = {};
    for (let t0 of allTokens) {
        for (let t1 of allTokens) {
            let uniswapPair = await getUniswapPair(uniswapFactory, t0, t1, provider);
            if (uniswapPair == constants.ZERO_ADDRESS) {
                continue;
            }

            eventHandlers[uniswapPair.contract.address] = uniswapPair;
        }
    }

    const wss = new WebSocket.Server({ port: 8081 });

    wss.on('connection', (ws) => {
        clientConnections.add(ws);

        ws.send(JSON.stringify({
            data: 'subscribed'
        }));
    });

    const httpServer = http.createServer(handleHTTPRequest);
    httpServer.listen(8080); // AWS default port

    console.log('INITIALIZED');

    // Get websocket provider
    let blockNumber = await provider.getBlockNumber();
    let webSocketProvider = startWebSocketProvider(blockNumber, eventHandlers);

    while (true) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // TODO forever
    }

    console.log('EXITING');
};

const main = async (isLive) => {
    console.log('COMPILING...');

    console.log(`STARTING live=${isLive}`);

    isLiveGlobal = isLive;

    // Kill immediately on error
    process.on('unhandledRejection', async (err) => {
        console.error(`UNHANDLED REJECTION ${err}`);
        console.log(err);

        process.exit();
    });

    try {
        await run();
    } catch (err) {
        console.error(`EXCEPTION ${err}`);
        console.log(err);

        throw err;
    }
};

main();
