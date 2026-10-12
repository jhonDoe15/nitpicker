import { createIdentityCounter } from '../../java/ingest/common.mjs';

export function createIdentities() {
  const counters = new Map();
  return ({ path, rule, subject }) => {
    const key = `${path}\0${rule}`;
    if (!counters.has(key)) {
      counters.set(key, createIdentityCounter());
    }
    return counters.get(key)(subject);
  };
}
