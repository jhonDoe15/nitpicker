const { afterEach, beforeEach } = require('node:test');
const { installNodeTestCapture } = require('./node-test-capture.mjs');

module.exports = installNodeTestCapture({
  hooks: { beforeEach, afterEach },
  target: globalThis.console,
  environment: process.env,
  argv: process.argv,
  directory: process.cwd(),
});
