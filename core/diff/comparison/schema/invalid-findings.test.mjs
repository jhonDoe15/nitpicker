import { describe, expect, it } from 'vitest';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import { parseAnalyzerReportKeepingValid } from './invalid-findings.mts';

const finding = (overrides = {}) => ({
  tool: 'java',
  rule: 'r',
  path: 'src/A.java',
  identity: 'i',
  message: 'Fix it.',
  classification: 'enforceable',
  ...overrides,
});

const entry = { rule: 'archunit/r', paths: ['src/A.java'], reason: '...' };
const sentence = `If this is intended, add ${JSON.stringify(entry)} to "exceptions" in nitpicker.config.json.`;

const invalid = (tool, text) => ({
  tool,
  rule: 'invalid-finding',
  path: '.',
  identity: 'invalid-finding',
  message: withTroubleshooting(text, TROUBLESHOOTING_ANCHORS.analyzerCrashed),
  classification: 'tool-error',
});

describe('parseAnalyzerReportKeepingValid', () => {
  it('keeps the valid findings and names the ones it leaves out in one tool error per tool', () => {
    const report = parseAnalyzerReportKeepingValid(
      {
        findings: [
          finding(),
          finding({
            identity: 'two',
            message: `Move A. ${sentence} ${sentence}`,
            exception: entry,
            exceptionList: 'exceptions',
          }),
          finding({ identity: 'three', path: '' }),
          finding({ tool: 'archunit', identity: 'four', path: '' }),
        ],
      },
      'java',
    );

    expect(report).toEqual({
      findings: [
        finding(),
        invalid(
          'java',
          'java reported 2 findings that nitpicker cannot check, left out of the result; its other findings are kept. First: java findings[1] (java r in src/A.java): exception is set, but the message prints no exception sentence',
        ),
        invalid(
          'archunit',
          'java reported a finding that nitpicker cannot check, left out of the result; its other findings are kept. First: java findings[3].path must be a non-empty string',
        ),
      ],
    });
  });

  it('adds no tool error when every finding is valid, and keeps the module imports', () => {
    const imports = [{ from: 'a.ts', to: 'b.ts' }];
    expect(
      parseAnalyzerReportKeepingValid({ findings: [finding()], moduleImports: imports }, 'java'),
    ).toEqual({ findings: [finding()], moduleImports: imports });
  });

  it('still rejects a report without a findings array', () => {
    expect(() => parseAnalyzerReportKeepingValid({ items: [] }, 'java')).toThrow(
      'java output must contain a findings array',
    );
  });
});
