/**
 * @param {string} value
 * @param {number} width
 * @returns {string}
 */
function pad(value, width) {
  return value.padStart(width, ' ');
}

module.exports = { pad };
