const server = require('./server.js');
const chain = require('./chain.js');
const uniswap = require('./uniswap.js');
const chainlink = require('./chainlink.js');

const main = async () => {
    process.on('unhandledRejection', async (err) => {
        console.error(`UNHANDLED REJECTION ${err}`);
        console.log(err);

        process.exit();
    });

    let chainlinkTracker = new chainlink.ChainlinkTracker();

    let uniswapTracker = new uniswap.UniswapTracker(chainlinkTracker);

    let eventHandlers = await uniswapTracker.init();

    let moreEventHandlers = await chainlinkTracker.init();

    let listener = new chain.ChainListener([...eventHandlers, ...moreEventHandlers]);

    server.init(uniswapTracker, chainlinkTracker);
};

main();
