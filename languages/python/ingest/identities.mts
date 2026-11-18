import { createIdentityCounter } from '../../../shared/ingest/common.mjs';

const newCounter: () => (identity: string) => string = createIdentityCounter;
const LINE_REFERENCE = /\s+(?:on|from) line \d+/g;

export function withoutLineNumbers(subject: string): string {
  return subject.replace(LINE_REFERENCE, '');
}

type IdentityParts = { path: string; rule: string; subject: string };

export function createIdentities(): (parts: IdentityParts) => string {
  const counters = new Map<string, (identity: string) => string>();
  return ({ path, rule, subject }: IdentityParts) => {
    const key = `${path}\0${rule}`;
    const counter = counters.get(key) ?? newCounter();
    counters.set(key, counter);
    return counter(withoutLineNumbers(subject));
  };
}
