/** @typedef {import('./base').Config} Config */

/**
 * @param {Config} config
 * @param {string} suffix
 * @returns {string}
 */
export function load(config, suffix) {
  return config.host + suffix;
}

export class Counter {
  constructor() {
    this.values = [];
    this._total = 0;
  }

  add(value) {
    this.values.push(value);
    this._total += value;
  }

  get values2() {
    return this.values;
  }
}
