import { createIdentityCounter } from '../../../shared/ingest/common.mjs';

const LINE_REFERENCE = /\s+(?:on|from) line \d+/g;

export function withoutLineNumbers(subject) {
  return subject.replace(LINE_REFERENCE, '');
}

export function createIdentities() {
  const counters = new Map();
  return ({ path, rule, subject }) => {
    const key = `${path}\0${rule}`;
    if (!counters.has(key)) {
      counters.set(key, createIdentityCounter());
    }
    return counters.get(key)(withoutLineNumbers(subject));
  };
}
