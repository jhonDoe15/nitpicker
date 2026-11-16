import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { commitBranch } from '../../test-support/gradle-e2e.mts';
import { gateRedBase } from './red-base-cases.mts';
import { entriesOf } from '../../../../../shared/values/findings.mts';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';

type GateResult = ReturnType<typeof gateRedBase>;

const BROKEN_BRANCH = 'broken';
const TOOL_ERRORS = 'tool-errors.json';

function compileFindings(result: GateResult): string[] {
  return entriesOf(result.json('new-findings.json'))
    .filter(({ rule }) => rule === 'compile-error')
    .map(
      ({ tool, rule, path: file, location }) =>
        `${textOf(tool)}/${textOf(rule)} ${textOf(file)}:${String(fieldOf(location, 'line'))}`,
    );
}

function snapshotRules(errors: readonly unknown[]): string[] {
  return errors.map(
    (error) => `${textOf(fieldOf(error, 'snapshot'))} ${textOf(fieldOf(error, 'rule'))}`,
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
}: {
  setup: () => string;
  environment: NodeJS.ProcessEnv;
  preset: string;
  source: string;
  broken: string;
  line: number;
  failureRule: string;
}): void {
  let root: string;
  const outputs: string[] = [];

  beforeAll(() => {
    root = setup();
    const file = path.resolve(root, source);
    if (!file.startsWith(`${root}${path.sep}`)) {
      throw new Error(`${source} is outside ${root}`);
    }
    const working = readFileSync(file, 'utf8');
    commitBranch(root, BROKEN_BRANCH, { [source]: broken }, 'main');
    commitBranch(root, 'fixed', { [source]: working }, BROKEN_BRANCH);
  });

  afterAll(() => {
    for (const directory of [root, ...outputs]) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function gate(branch: string, base: string): GateResult {
    const result = gateRedBase({ root, branch, base, environment });
    outputs.push(result.reports);
    return result;
  }

  it('reports a compile error in the change as a finding at its line, with exit 1', () => {
    const result = gate(BROKEN_BRANCH, 'main');

    expect({
      exitCode: result.exitCode,
      findings: compileFindings(result),
      resolved: result.json('resolved-findings.json'),
      toolErrors: snapshotRules(listOf(result.json(TOOL_ERRORS))),
    }).toEqual({
      exitCode: 1,
      findings: [`build/compile-error ${source}:${String(line)}`],
      resolved: [],
      toolErrors: ['head compile-failed-skipped'],
    });
    expect(fieldOf(listOf(result.json(TOOL_ERRORS))[0], 'tool')).toBe(preset);
  });

  it('keeps a base that does not compile a tool error that names the cause', () => {
    const result = gate('fixed', BROKEN_BRANCH);
    const errors = listOf(result.json(TOOL_ERRORS));

    expect({
      exitCode: result.exitCode,
      findings: compileFindings(result),
      toolErrors: snapshotRules(errors),
    }).toEqual({ exitCode: 2, findings: [], toolErrors: [`base ${failureRule}`] });
    expect(fieldOf(errors[0], 'message')).toContain(source);
  });
}
