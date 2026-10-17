import { renderGreeting } from './features/greeting/index.js';

/**
 * @returns {void}
 */
export function main() {
  renderGreeting(document.body, ['Ada']);
}
