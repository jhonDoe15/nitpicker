import { describe, expect, it } from 'vitest';
import { schemaAccepts, validatorAccepts } from './test-support/schema-harness.mjs';

const entry = { paths: ['src/a.py'], reason: 'Kept on purpose' };

const LOOSE = [
  [
    'a python.exceptions rule id the preset does not report',
    { preset: 'python', python: { exceptions: [{ rule: 'NOPE123', ...entry }] } },
  ],
  [
    'an exception glob whose "{" is never closed',
    { exceptions: [{ rule: 'file-lines-limit', paths: ['src/{a'], reason: 'Kept on purpose' }] },
  ],
  [
    'a test console text that keeps fewer than 3 characters once numbers and ids are masked',
    { testConsole: { allow: [{ contains: 'id 12345', reason: 'Printed by a library' }] } },
  ],
  [
    'a test timeouts project glob whose "{" is never closed',
    {
      tools: {
        tests: { timeouts: { projects: { e2e: { language: 'typescript', include: ['e2e/{a'] } } } },
      },
    },
  ],
];

describe('the checks the schema leaves to the run', () => {
  it.each(LOOSE)('%s: the schema accepts it and the validator rejects it', (_name, config) => {
    expect({ schema: schemaAccepts(config), validator: validatorAccepts(config) }).toEqual({
      schema: true,
      validator: false,
    });
  });
});
