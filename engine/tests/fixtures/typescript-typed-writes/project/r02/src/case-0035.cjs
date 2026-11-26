const pRetry = require('p-retry');
const { sendOrder } = require('./store');
module.exports = async function run(id) { await pRetry(() => sendOrder(id)); };