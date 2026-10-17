import { describeResult, greet } from '../domain/greet.js';

/**
 * @typedef {{ readonly write: (text: string) => void }} Writer
 */

/**
 * @param {readonly string[]} names
 * @param {Writer} writer
 * @returns {void}
 */
export function runGreeting(names, writer) {
  for (const name of names) {
    writer.write(`${describeResult(greet(name))}\n`);
  }
}
