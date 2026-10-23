import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pythonUsable } from '../../metrics/python-helpers.mjs';
import { ingestRulesReport } from '../../ingest/rules-report.mjs';
import { applyFindingPolicy } from '../../../../shared/findings/finding-policy.mjs';
import { applyRuleHints } from '../rule-hints.mjs';

describe.skipIf(!pythonUsable())('Python type laundering', () => {
  it('checks imported identities, annotations, scope, overlap and legitimate narrowing', () => {
    const script = path.join(import.meta.dirname, '../test-support/type_laundering_cases.py');
    const result = spawnSync('python3', ['-I', script], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });
});

describe('Python type laundering findings', () => {
  const raw = (rule, line) => ({ rule, path: 'src/value.py', subject: 'decode', line });
  const collect = (line) =>
    ingestRulesReport(JSON.stringify([raw('no-typing-cast', line), raw('no-explicit-any', line)]));

  it('keeps differential identities when lines move', () => {
    expect(collect(3).map(({ rule, identity }) => [rule, identity])).toEqual([
      ['no-typing-cast', 'decode'],
      ['no-explicit-any', 'decode'],
    ]);
    expect(collect(30).map(({ identity }) => identity)).toEqual(['decode', 'decode']);
  });

  it('offers actionable guidance and a reviewed path exception', () => {
    const findings = applyRuleHints(collect(3));
    expect(findings.map(({ message }) => message)).toEqual([
      '`decode` bypasses type checking with `typing.cast`. Narrow a trusted value with a type check, or parse untrusted input once at the boundary with a schema validator; a cast does not validate the value. If this is intended, add {"rule":"no-typing-cast","paths":["src/value.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.',
      '`decode` explicitly opts out of type checking with `Any`. Use a concrete type, a `Protocol` or a `TypeVar`; narrow a trusted union with a check, or parse untrusted input at the boundary. If this is intended, add {"rule":"no-explicit-any","paths":["src/value.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.',
    ]);
    expect(
      applyFindingPolicy(findings, {
        exceptions: [
          { rule: 'no-typing-cast', paths: ['src/value.py'], reason: 'Interop contract' },
        ],
      }).map(({ rule }) => rule),
    ).toEqual(['no-explicit-any']);
  });
});
