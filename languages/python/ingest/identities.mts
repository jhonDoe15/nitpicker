import { createIdentityCounter } from '../../../shared/ingest/common.mjs';

const LINE_REFERENCE = /\s+(?:on|from) line \d+/g;

export function withoutLineNumbers(subject: string): string {
  return subject.replace(LINE_REFERENCE, '');
}

export function createIdentities(): (parts: {
  path: string;
  rule: string;
  subject: string;
}) => string {
  const counters = new Map<string, (identity: string) => string>();
  return ({ path, rule, subject }) => {
    const key = `${path}\0${rule}`;
    let counter = counters.get(key);
    if (counter === undefined) {
      counter = createIdentityCounter();
      counters.set(key, counter);
    }
    return counter(withoutLineNumbers(subject));
  };
}
