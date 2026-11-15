import { describe, expect, it } from 'vitest';
import { findingFor } from './test-support/finding-for.mts';
import { firstOf } from './test-support/finding-comparison.mts';

describe('a finding anchored on a whole function ignores formatting only', () => {
  it('keeps the identity through quotes, semicolons, trailing commas and arrow parentheses', () => {
    const find = (code: string) =>
      findingFor({ code, reported: code.slice(code.indexOf('items'), code.lastIndexOf(')') + 1) });
    const unformatted = "export const run = () => items.map(item => log('a', item,));\n";
    const formatted = 'export const run = () => items.map((item) => log("a", item))\n';

    expect(firstOf(find(formatted)).identity).toBe(firstOf(find(unformatted)).identity);
    expect(firstOf(find(formatted.replace('"a"', '"b"'))).identity).not.toBe(
      firstOf(find(unformatted)).identity,
    );
  });

  it('tells an empty statement, a line break after return and a spaced operator from formatting', () => {
    const block = (body: string) => `export function run() {${body}}\n`;
    const identity = (body: string) =>
      firstOf(findingFor({ code: block(body), reported: `{${body}}` })).identity;

    expect(identity('\n  if (ready); start();\n')).not.toBe(identity('\n  if (ready) start();\n'));
    expect(identity('\n  return\n  value;\n')).not.toBe(identity('\n  return value;\n'));
    expect(identity(' a + ++b ')).not.toBe(identity(' a++ + b '));
    expect(identity(' start() ')).toBe(identity('\n  start();\n'));
  });
});
