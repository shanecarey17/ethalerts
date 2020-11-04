const assert = require('assert');
const fs = require('fs');

const ethers = require('ethers');
const web3 = require('web3');

const tokens = require('./tokens.js');
const constants = require('./constants.js');

const ETH_USD_ADDRESS = ethers.utils.getAddress('0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419');
const BTC_USD_ADDRESS = ethers.utils.getAddress('0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c');

const EAC_AGGREGATOR_ABI = JSON.parse(fs.readFileSync('abi/EACAggregatorProxy.json'));

const ChainlinkAggregatorHandler = function(contract, decimals, name, lastRound) {
    this.contract = contract;
    this.name = name;

    this.blockNumber = 0;

    this.decimals = decimals;

    this.answer = lastRound.answer;
    this.roundId = lastRound.roundId;

    this.getPrice = () => {
        return this.answer.toNumber() / (10**this.decimals);
    };

    this.upperAlerts = [];
    this.lowerAlerts = [];
    this.addAlert = (options, callback) => {
        let alertData = {
            price: Number(options.price),
                        
        };

        this.alerts.push({alertData, callback});

        this.alerts.sort((a, b) => a.price.toNumber() - b.price.toNumber());
    }

    this.onAnswerUpdated = ({current, roundId, updatedAt}) => {
        console.log('ANSWER UPDATED');

        if (this.answer.gt(current)) {
            this.upperAlerts.some((a) => {
                let {alertData, callback} = a;

                idx = i;
                if (alertData.price.lte(current)) {
                    callback();

                    return false;
                }

                return true;
            });

            this.upperAlerts = this.upperAlerts.slice(idx);
        } else {
            let idx = 0;
            this.lowerAlerts.some((a, i) => {
                let {alertData, callback} = a;
                
                idx = i;
                if (alertData.price.lte(current)) {
                    callback();

                    return false;
                }

                return true;
            });

            this.lowerAlerts = this.lowerAlerts.slice(idx);
        }

        this.answer = current;
    }

    this.onNewRound = ({roundId, startedBy, startedAt}) => {
        console.log('NEW ROUND');
    }
};

const ChainlinkTracker = function() {
    this.init = async () => {
        let provider = new ethers.providers.InfuraProvider('mainnet', 'd31d552b4e5d41b5b34aec1310fbdf8f');

        let ethUsdContract = new ethers.Contract(ETH_USD_ADDRESS, EAC_AGGREGATOR_ABI, provider);
        let ethLastRound = await ethUsdContract.latestRoundData();
        let ethUsdDecimals = await ethUsdContract.decimals();
        let ethUsdHandler = new ChainlinkAggregatorHandler(ethUsdContract, ethUsdDecimals, 'ETH-USD', ethLastRound);

        let btcUsdContract = new ethers.Contract(BTC_USD_ADDRESS, EAC_AGGREGATOR_ABI, provider);
        let btcLastRound = await btcUsdContract.latestRoundData();
        let btcUsdDecimals = await btcUsdContract.decimals();
        let btcUsdHandler = new ChainlinkAggregatorHandler(btcUsdContract, btcUsdDecimals, 'BTC-USD', btcLastRound);

        this.eventHandlers = [ethUsdHandler, btcUsdHandler];

        return this.eventHandlers;
    };

    this.addAlert = (options, callback) => {
        let eventHandler = this.eventHandlers.find(e => options.address === e.contract.address);
        if (eventHandler === undefined) {
            throw new Error('invalid address');
        }
        eventHandler.addAlert(options, callback);
    };

    this.getPrices = () => {
        return this.eventHandlers.map(v => {
            return {
                answer: v.getPrice(),
                asset: v.name
            };
        });
    }

};

module.exports.ChainlinkTracker = ChainlinkTracker;
