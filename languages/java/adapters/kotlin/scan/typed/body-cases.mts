import { describe, expect, it } from 'vitest';
import { type Check, type Ruled, scanKotlinSource } from './typed-scan.mts';

type Case = [string, string];

export function describeBodyCases(options: {
  title: string;
  check: Check<Ruled>;
  header: string;
  reports: Case[];
  clean: Case[];
}): void {
  function found(body: string): number {
    return options.check(scanKotlinSource(`${options.header}\n${body}\n}\n`)).length;
  }
  describe(options.title, () => {
    it.each(options.reports)('reports %s', (_name, body) => {
      expect(found(body)).toBe(1);
    });
    it.each(options.clean)('leaves %s alone', (_name, body) => {
      expect(found(body)).toBe(0);
    });
  });
}
