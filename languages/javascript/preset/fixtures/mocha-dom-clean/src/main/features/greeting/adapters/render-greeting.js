import { describeResult, greet } from '../domain/greet.js';

/**
 * @param {HTMLElement} container
 * @param {readonly string[]} names
 * @returns {void}
 */
export function renderGreeting(container, names) {
  for (const name of names) {
    const line = container.ownerDocument.createElement('p');
    line.textContent = describeResult(greet(name));
    container.append(line);
  }
}
