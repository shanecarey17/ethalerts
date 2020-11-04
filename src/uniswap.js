const assert = require('assert');
const fs = require('fs');

const ethers = require('ethers');
const web3 = require('web3');

const tokens = require('./tokens.js');
const constants = require('./constants.js');

const UNISWAP_FACTORY_ADDRESS = ethers.utils.getAddress('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'); 

const WETH_ADDRESS = ethers.utils.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
const DAI_ADDRESS = ethers.utils.getAddress('0x6B175474E89094C44Da98b954EedeAC495271d0F');
const WBTC_ADDRESS = ethers.utils.getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599');

const selectedTokens = [
    WETH_ADDRESS,
    DAI_ADDRESS,
    WBTC_ADDRESS
];

const UNISWAP_PAIR_ABI = JSON.parse(fs.readFileSync('abi/IUniswapV2Pair.json')).abi;

const getUniswapFactory = async (provider) => {
    const factoryAbi = JSON.parse(fs.readFileSync('abi/IUniswapV2Factory.json'));
    const uniswapFactory = new ethers.Contract(UNISWAP_FACTORY_ADDRESS, factoryAbi.abi, provider);

    return uniswapFactory;
};

let getPrice = () => { throw new Error('getPrice not set'); };

const UniswapPairHandler = function(contract, token0, token1) {
    this.contract = contract;

    this.blockNumber = 0;

    this.token0 = token0;
    this.token1 = token1;

    this.reserve0 = constants.ZERO;
    this.reserve1 = constants.ZERO;

    this.sizeAlerts = [];
    this.addAlert = (alertParams, callback) => {
        let options = alertParams.options;
        if (options.type === 'large_trade') {
            options.sizeUSD = Number(options.sizeUSD);

            this.sizeAlerts.push({alertParams, callback});
            this.sizeAlerts.sort((a, b) => a.alertParams.options.sizeUSD - b.alertParams.options.sizeUSD);
        } else {
            throw new Error('invalid type');
        }
    }

    this.onMint = ({sender, amount0, amount1}, log) => {
        console.log('MINT');
    }

    this.onBurn =({}) => {
        console.log('BURN');
    }

    this.onSwap = ({sender, amount0In, amount1In, amount0Out, amount1Out, to}, log) => {
        console.log('SWAP');

        let tokenIn = amount0In.gt(0) ? this.token0 : this.token1;
        let amountIn = amount0In.gt(0) ? amount0In : amount1In;
        let tokenOut = amount0Out.gt(0) ? this.token0 : this.token1;
        let amountOut = amount0Out.gt(0) ? amount0Out : amount1Out;

        let ethPrice = getPrice('ETH-USD');
        let btcPrice = getPrice('BTC-USD');

        let tradeSizeUSD = Number.MAX_SAFE_INTEGER;
        if (tokenIn.symbol === 'WETH') {
            tradeSizeUSD = Number(tokenIn.formatAmount(amountIn)) * ethPrice;
        } else if (tokenOut.symbol === 'WETH') {
            tradeSizeUSD = Number(tokenOut.formatAmount(amountOut)) * ethPrice;
        } else if (tokenIn.symbol === 'WBTC') {
            tradeSizeUSD = Number(tokenIn.formatAmount(amountIn)) * btcPrice;
        } else if (tokenOut.symbol === 'WBTC') {
            tradeSizeUSD = Number(tokenOut.formatAmount(amountOut)) * btcPrice;
        }

        let tradeData = {
            tx: log.transactionHash,
            tradeSizeUSD,
            tokenIn: tokenIn.symbol,
            tokenOut: tokenOut.symbol,
            amountIn: tokenIn.formatAmount(amountIn),
            amountOut: tokenOut.formatAmount(amountOut)
        };

        this.sizeAlerts = this.sizeAlerts.filter(a => !a.cancelled);
        for (let sizeAlert of this.sizeAlerts) {
            if (sizeAlert.alertParams.options.sizeUSD > tradeSizeUSD) {
                break;
            }

            sizeAlert.callback(tradeData, sizeAlert);
        }

        console.log(`TRADE SIZE USD ${tradeSizeUSD}`);
    }

    this.onSync = ({reserve0, reserve1}, log) => {
        console.log('SYNC');

        this.reserve0 = reserve0;
        this.reserve1 = reserve1;

        this.blockNumber = log.blockNumber;
    }

    this.onTransfer = ({}, log) => {
        console.log('TRANSFER');
    }

    this.onApproval = ({}, log) => {
        console.log('APPROVAL');
    }
};

const getUniswapPair = async (factory, token0, token1, provider) => {
    if (token0.address === token1.address) {
        return null;
    }

    let pairAddress = await factory.getPair(token0.address, token1.address);
    
    let pairContract = new ethers.Contract(pairAddress, UNISWAP_PAIR_ABI, provider);

    let sortedTokens = [token0, token1].sort();

    return new UniswapPairHandler(pairContract, sortedTokens[0], sortedTokens[1]);
}

const UniswapTracker = function(priceOracle) {
    getPrice = (asset) => {
        let prices = priceOracle.getPrices();

        let price = prices.find(p => p.asset === asset);

        return price.answer;
    }

    this.init = async () => {
        let provider = new ethers.providers.InfuraProvider('mainnet', 'd31d552b4e5d41b5b34aec1310fbdf8f');

        this.eventHandlers = [];

        let uniswapFactory = await getUniswapFactory(provider);

        this.eventHandlers.push(new (function() {
            this.contract = uniswapFactory;
            this.onPairCreated = ({}) => {
                console.log('PAIR CREATED')
            }
        })());

        let allTokens = [];
        for (let addr of selectedTokens) {
            allTokens.push(await tokens.TokenFactory.loadToken(addr, provider));
        }   

        this.uniswapPairs = [];
        for (let i = 0; i < allTokens.length; ++i) {
          for (let j = i + 1; j < allTokens.length; ++j) {
                let uniswapPair = await getUniswapPair(uniswapFactory, allTokens[i], allTokens[j], provider);
                if (uniswapPair === null) {
                    continue;
                }

                this.eventHandlers.push(uniswapPair);
                this.uniswapPairs.push(uniswapPair);
          }
        }

        return this.eventHandlers;
    };

    this.addAlert = (alertParams, callback) => {
        let eventHandler = this.eventHandlers.find(e => e.contract.address === alertParams.options.address);
        if (eventHandler === undefined) {
            throw new Error('invalid address');
        }
        eventHandler.addAlert(alertParams, callback);
    };

    this.getPairReserves = () => {
        return this.uniswapPairs.map((pairHandler) => {
            return {
                reserve0: pairHandler.reserve0.toString(),
                reserve1: pairHandler.reserve1.toString(),
                token0: pairHandler.token0.address,
                token1: pairHandler.token1.address,
                name: pairHandler.token0.symbol + '-' + pairHandler.token1.symbol,
                blockNumber: pairHandler.blockNumber,
                address: pairHandler.contract.address
            };
        });
    }
};

module.exports.UniswapTracker = UniswapTracker;
