const { shipments } = require('./schemas');
async function run() { for (const s of await shipments.find()) { await s.carrier; s.first.then(() => 1); } }
module.exports = { run };
export {};
