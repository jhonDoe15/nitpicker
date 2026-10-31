const { basename } = require('node:path');

/**
 * @param {string} name
 * @returns {string}
 */
function initials(name) {
  return basename(name).slice(0, 1).toUpperCase();
}

module.exports = { initials };
