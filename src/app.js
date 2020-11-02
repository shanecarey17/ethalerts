const server = require('./server.js');
const chain = require('./chain.js');
const uniswap = require('./uniswap.js');

const main = async () => {
    process.on('unhandledRejection', async (err) => {
        console.error(`UNHANDLED REJECTION ${err}`);
        console.log(err);

        process.exit();
    });

    let uniswapTracker = new uniswap.UniswapTracker();

    let eventHandlers = await uniswapTracker.init();

    let listener = new chain.ChainListener(eventHandlers);

    server.init(uniswapTracker);
};

main();
