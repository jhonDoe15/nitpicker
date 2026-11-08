import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { commitBranch } from '../../test-support/gradle-e2e.mjs';
import { gateRedBase } from './red-base-cases.mjs';

function compileFindings(result) {
  return result
    .json('new-findings.json')
    .filter(({ rule }) => rule === 'compile-error')
    .map(
      ({ tool, rule, path: file, location }) => `${tool}/${rule} ${file}:${String(location.line)}`,
    );
}

export function compileErrorCases({
  setup,
  environment,
  preset,
  source,
  broken,
  line,
  failureRule,
}) {
  let root;
  const outputs = [];

  beforeAll(() => {
    root = setup();
    const file = path.resolve(root, source);
    if (!file.startsWith(`${root}${path.sep}`)) {
      throw new Error(`${source} is outside ${root}`);
    }
    const working = readFileSync(file, 'utf8');
    commitBranch(root, 'broken', { [source]: broken }, 'main');
    commitBranch(root, 'fixed', { [source]: working }, 'broken');
  });

  afterAll(() => {
    for (const directory of [root, ...outputs]) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function gate(branch, base) {
    const result = gateRedBase({ root, branch, base, environment });
    outputs.push(result.reports);
    return result;
  }

  it('reports a compile error in the change as a finding at its line, with exit 1', () => {
    const result = gate('broken', 'main');

    expect({
      exitCode: result.exitCode,
      findings: compileFindings(result),
      resolved: result.json('resolved-findings.json'),
      toolErrors: result
        .json('tool-errors.json')
        .map(({ snapshot, rule }) => `${snapshot} ${rule}`),
    }).toEqual({
      exitCode: 1,
      findings: [`build/compile-error ${source}:${String(line)}`],
      resolved: [],
      toolErrors: ['head compile-failed-skipped'],
    });
    expect(result.json('tool-errors.json')[0].tool).toBe(preset);
  });

  it('keeps a base that does not compile a tool error that names the cause', () => {
    const result = gate('fixed', 'broken');
    const errors = result.json('tool-errors.json');

    expect({
      exitCode: result.exitCode,
      findings: compileFindings(result),
      toolErrors: errors.map(({ snapshot, rule }) => `${snapshot} ${rule}`),
    }).toEqual({ exitCode: 2, findings: [], toolErrors: [`base ${failureRule}`] });
    expect(errors[0].message).toContain(source);
  });
}
