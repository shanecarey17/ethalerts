const assert = require('assert');

const ethers = require('ethers');
const web3 = require('web3');

const ChainListener = function(eventHandlers, startBlock) {
    this.eventHandlers = eventHandlers;

    this.applyLog = (log) => {
        // Handle the event
        let address = ethers.utils.getAddress(log.address); // TODO confirm case correct

        console.log(`EVENT tx ${log.transactionHash} block ${log.blockNumber} logIdx ${log.logIndex} address ${address} topic ${log.topics[0]}`);

        let eventHandler = this.eventHandlers[address];

        let ev = eventHandler.contract.interface.parseLog(log);

        let handler = eventHandler['on' + ev.name];

        try {
            handler(ev.args, log);
        } catch (err) {
            console.log(ev);
            throw err;
        }
    };
    
    this.updateQueue = [];
    this.confirmationsThreshold = 5;

    this.onConfirmation = (blockNumber) => {
        let lastUpdate = null;
        for (let update of this.updateQueue) {
            if (update.block >= blockNumber - this.confirmationsThreshold) {
                break;
            }

            this.applyLog(update);
        }

        this.updateQueue = this.updateQueue.slice(this.updateQueue.indexOf(lastUpdate) + 1, this.updateQueue.length);
    } 

    this.onLogRemoved = (log) => {
        this.updateQueue = this.updateQueue.filter((update) => {
            return update.log.transactionHash !== log.transactionHash &&
                update.log.logIndex !== log.logIndex;
        });

        // TODO die if log was already passed along
    }

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
                    this.applyLog(log);
                }

                for (let log of logQueue) {
                    this.applyLog(log);
                }

                isSynced = true;

                console.log('SYNCED');
            });

            syncStarted = true;
        }

        if (isSynced) {
            this.onConfirmation(blockHeader.number);
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
           this.updateQueue.push(log);
        }
    });

    subscription.on('changed', (log) => {
        assert(log.removed === true);
        this.onLogRemoved(log);
    });

    subscription.on('error', (err) => {
        console.log('error');
        console.log(err);
        throw new Error(err);
    });
};

module.exports.ChainListener = ChainListener;
