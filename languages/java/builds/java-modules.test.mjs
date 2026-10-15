import { describe, expect, it } from 'vitest';
import { prefixedFinding } from './java-modules.mjs';

const ROUTE =
  'If a reviewer agrees this is intended, add {"rule":"function-lines-limit","paths":["src/main/java/demo/Big.java"],"function":"Big.big","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.';
const MOVED_ROUTE =
  'If a reviewer agrees this is intended, add {"rule":"function-lines-limit","paths":["core/src/main/java/demo/Big.java"],"function":"Big.big","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.';

describe('prefixedFinding', () => {
  it('moves the path of a module finding and the file its exception sentence names', () => {
    const finding = {
      tool: 'structure',
      rule: 'function-lines-limit',
      path: 'src/main/java/demo/Big.java',
      identity: 'function:Big.big:occurrence:1:source:abc',
      message: `Big.big has 51 lines; limit is 50. ${ROUTE}`,
      classification: 'enforceable',
      ratchet: {
        key: 'function:Big.big:occurrence:1:lines',
        value: 51,
        heldMessage: 'Big.big: 51 lines (limit 50), allowed because base was {base}.',
        worseMessage: `Big.big grew from {base} to 51 lines (limit 50). ${ROUTE}`,
      },
    };

    expect(prefixedFinding(finding, 'core')).toEqual({
      ...finding,
      path: 'core/src/main/java/demo/Big.java',
      message: `Big.big has 51 lines; limit is 50. ${MOVED_ROUTE}`,
      ratchet: {
        ...finding.ratchet,
        worseMessage: `Big.big grew from {base} to 51 lines (limit 50). ${MOVED_ROUTE}`,
      },
    });
  });

  it('leaves a root module finding as it is', () => {
    const finding = {
      tool: 'pmd',
      rule: 'UnusedPrivateField',
      path: 'src/main/java/demo/A.java',
      identity: 'fp:nitpicker/subject=Avoid unused field: added',
      message: 'Avoid unused field: added',
      classification: 'enforceable',
    };

    expect(prefixedFinding(finding, '')).toEqual(finding);
  });
});
