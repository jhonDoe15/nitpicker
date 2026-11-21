'use strict';
const path = require('node:path');
const { join: joined } = require(`node:path`);
function helper(first, second = first) { return joined(first, second); }
const table = { helper, path };
module.exports = { helper, table };
exports.other = function other() { return helper(1); };
