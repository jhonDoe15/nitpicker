import { runGreeting } from './features/greeting/index.js';

/**
 * @param {readonly string[]} names
 * @returns {void}
 */
export function main(names) {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}
