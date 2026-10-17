import { renderGreeting } from './features/greeting/index.js';

/**
 * @param {HTMLElement} page
 * @returns {void}
 */
export function main(page) {
  renderGreeting(page, ['Ada']);
}
