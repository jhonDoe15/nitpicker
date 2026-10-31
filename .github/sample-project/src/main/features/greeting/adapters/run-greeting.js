import { describeResult, greet } from '../domain/greet.js';
import { initials } from '../domain/initials.cjs';
import { pad } from '../domain/pad.cjs';

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
    writer.write(`${pad(initials(name), 1)} ${describeResult(greet(name))}\n`);
  }
}
