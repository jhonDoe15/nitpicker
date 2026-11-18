import { describe, expect, it } from 'vitest';
import { textOf } from '../../../../../../shared/values/readers.mts';
import { callUntyped, findingsOf, type JavaFinding } from '../../../typed/java-values.mts';
import { pmdProcessingErrors } from './pmd-processing-errors.mjs';

const context = { roots: ['/work/app'], sourceRoots: ['src/main/java'], projectRoot: '/work/app' };

function processingErrors(log: unknown, options: object): JavaFinding[] {
  return findingsOf(callUntyped(pmdProcessingErrors, log, options));
}

function notification(file: string | undefined, text: string): object {
  return {
    descriptor: { id: 'ProcessingError' },
    level: 'error',
    message: { text },
    locations:
      file === undefined
        ? []
        : [{ physicalLocation: { artifactLocation: { uri: `file:///work/app/${file}` } } }],
  };
}

function log(...notifications: readonly object[]): object {
  return {
    runs: [
      { invocations: [{ executionSuccessful: false, toolExecutionNotifications: notifications }] },
    ],
  };
}

describe('pmdProcessingErrors', () => {
  it('turns each processing error into a notice that names the file and the first line', () => {
    const findings = processingErrors(
      log(
        notification(
          'api/src/main/java/Role.java',
          'ContextedRuntimeException: java.lang.IllegalStateException: Disambiguation pass failed\nException Context:\n\t[1:Resolving type of Foo]',
        ),
      ),
      context,
    );

    expect(findings).toEqual([
      {
        tool: 'pmd',
        rule: 'processing-error',
        path: 'api/src/main/java/Role.java',
        identity:
          'processing-error:api/src/main/java/Role.java:ContextedRuntimeException: java.lang.IllegalStateException: Disambiguation pass failed',
        message:
          'PMD could not process this file, so it has no PMD findings: ContextedRuntimeException: java.lang.IllegalStateException: Disambiguation pass failed',
        classification: 'descriptive',
      },
    ]);
  });

  it('keeps an error with no file at the project root and drops repeats', () => {
    const findings = processingErrors(
      log(notification(undefined, 'bad ruleset'), notification(undefined, 'bad ruleset')),
      context,
    );

    expect(findings.map(({ path, message }) => [path, message])).toEqual([
      ['.', 'PMD could not process this file, so it has no PMD findings: bad ruleset'],
    ]);
  });

  it('keeps the same identity when the line and column in the cause move', () => {
    const identities = (line: number): string[] =>
      processingErrors(
        log(
          notification(
            'A.java',
            `ParseException: Parse error at line ${String(line)}, column ${String(line + 3)}`,
          ),
        ),
        context,
      ).map(({ identity }) => textOf(identity));

    expect(identities(26)).toEqual(identities(31));
  });

  it.each([{}, 'abc', [null], [{}], [42]])('survives malformed locations %j', (locations) => {
    const findings = processingErrors(
      log({ message: { text: 'bad' }, locations }, { message: 'not a record', locations: 5 }),
      context,
    );

    expect(findings.map(({ path, message }) => [path, message])).toEqual([
      ['.', 'PMD could not process this file, so it has no PMD findings: bad'],
      ['.', 'PMD could not process this file, so it has no PMD findings: no message'],
    ]);
  });

  it('reports nothing for a clean run or a log without invocations', () => {
    expect(processingErrors(log(), context)).toEqual([]);
    expect(processingErrors({ runs: [{ results: [] }] }, context)).toEqual([]);
    expect(processingErrors({ runs: [] }, context)).toEqual([]);
  });
});
