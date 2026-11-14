import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { parseFinding } from '../finding-schema.mjs';

const SCHEMA = JSON.parse(
  readFileSync(new URL('../../../../spec/findings.schema.json', import.meta.url), 'utf8'),
);

const FINDING = {
  tool: 'structure',
  rule: 'near-duplicate',
  path: 'src/a.ts',
  identity: 'near-duplicate:a|b',
  message: 'message',
  classification: 'enforceable',
  planFacts: { verdict: 'same', copies: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }] },
};

describe('planFacts of a finding', () => {
  it('stays on the parsed finding and fits the findings schema', () => {
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(SCHEMA);

    expect(parseFinding(FINDING).planFacts).toEqual(FINDING.planFacts);
    expect(validate({ findings: [FINDING] }), JSON.stringify(validate.errors)).toBe(true);
  });

  it('must be an object', () => {
    expect(() => parseFinding({ ...FINDING, planFacts: 'copies' })).toThrow(
      'planFacts must be an object',
    );
  });
});
