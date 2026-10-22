import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DESIGN_RULE_IDS,
  DESIGN_RULES,
} from '../../../../../../shared/project-rules/design-rules.mjs';
import { validateFacts } from '../../../../../../shared/rules/facts/schema.mjs';
import { KOTLIN_EXCEPTION_RULES, validateKotlinOptions } from '../../kotlin-options.mjs';
import {
  DESIGN_FAILURE_RULE,
  DESIGN_TOOL,
  kotlinDesignBundle,
  kotlinDesignFindings,
} from './kotlin-design.mjs';

const RECORDED = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../fixtures/kotlin-design/design-facts.json'),
    'utf8',
  ),
);
const EMPTY = { modules: [], types: [], callables: [] };
const PREFIX = 'The design rules did not run on the Kotlin sources: ';
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function reportWith(facts) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-design-'));
  temporaryRoots.push(root);
  const reportRoot = path.join(root, 'build/nitpicker');
  mkdirSync(reportRoot, { recursive: true });
  writeFileSync(path.join(reportRoot, 'kotlin-facts.json'), facts);
  return { root, reportRoot };
}

function policyFile(root, policy) {
  const file = path.join(root, 'policy.json');
  writeFileSync(file, JSON.stringify(policy));
  return { NITPICKER_POLICY: file };
}

function failure(message) {
  return {
    tool: DESIGN_TOOL,
    rule: DESIGN_FAILURE_RULE,
    path: '.',
    identity: DESIGN_FAILURE_RULE,
    message: `${PREFIX}${message}`,
    classification: 'tool-error',
  };
}

describe('the recorded design facts of the fixture sources', () => {
  it('pass the facts schema as the bundle the rules read', () => {
    expect(() => validateFacts(kotlinDesignBundle(RECORDED))).not.toThrow();
    expect(kotlinDesignBundle(RECORDED).packages).toEqual([]);
  });
});

describe('kotlinDesignFindings', () => {
  it('hands the design facts and the head policy to the shared design rules for kotlin', () => {
    const { root, reportRoot } = reportWith(JSON.stringify({ files: [], design: RECORDED }));
    const policy = {
      exceptions: [{ rule: DESIGN_RULE_IDS.dataClump, paths: ['src/shop/*'], reason: 'agreed' }],
    };
    const finding = { tool: DESIGN_TOOL, rule: DESIGN_RULE_IDS.dataClump, path: 'src/a.kt' };
    const evaluator = vi.fn(() => [finding]);

    const findings = kotlinDesignFindings(reportRoot, {
      environment: policyFile(root, policy),
      evaluator,
    });

    expect(findings).toEqual([finding]);
    expect(evaluator.mock.calls).toEqual([
      [
        kotlinDesignBundle(RECORDED),
        { language: 'kotlin', analyzerName: DESIGN_TOOL, rules: DESIGN_RULES, policy },
      ],
    ]);
  });

  it('runs the registered shared rules on the recorded facts without a tool error', () => {
    const { reportRoot } = reportWith(JSON.stringify({ files: [], design: RECORDED }));

    const findings = kotlinDesignFindings(reportRoot, { environment: {} });

    expect(findings.filter(({ classification }) => classification === 'tool-error')).toEqual([]);
  });

  it('runs on a project without production sources, which has empty design facts', () => {
    const { reportRoot } = reportWith(JSON.stringify({ files: [], design: EMPTY }));
    const evaluator = vi.fn(() => []);

    expect(kotlinDesignFindings(reportRoot, { environment: {}, evaluator })).toEqual([]);
    expect(evaluator.mock.calls[0][0]).toEqual({ ...EMPTY, packages: [] });
  });

  it('reports the error the program wrote instead of design facts as a tool error', () => {
    const { reportRoot } = reportWith(JSON.stringify({ files: [], design: { error: 'boom' } }));
    const evaluator = vi.fn(() => []);

    expect(kotlinDesignFindings(reportRoot, { environment: {}, evaluator })).toEqual([
      failure('boom'),
    ]);
    expect(evaluator.mock.calls).toEqual([]);
  });

  it('reports a facts report without a design key as a tool error', () => {
    const { reportRoot } = reportWith(JSON.stringify({ files: [] }));

    expect(kotlinDesignFindings(reportRoot, { environment: {} })).toEqual([
      failure('the facts report has no "design" key, so it was written by an older plugin'),
    ]);
  });

  it('reports a facts report that cannot be read as a tool error', () => {
    const { reportRoot } = reportWith('{ not json');

    const [finding] = kotlinDesignFindings(reportRoot, { environment: {} });

    expect(finding.message).toMatch(
      /^The design rules did not run on the Kotlin sources: the facts report cannot be read \(.+\)$/u,
    );
  });

  it('reports design facts the schema refuses as a tool error', () => {
    const { reportRoot } = reportWith(JSON.stringify({ files: [], design: RECORDED }));
    const evaluator = () => {
      throw new TypeError('callables[0].target must be an id');
    };

    expect(kotlinDesignFindings(reportRoot, { environment: {}, evaluator })).toEqual([
      failure('callables[0].target must be an id'),
    ]);
  });
});

describe('Kotlin exceptions for the design rules', () => {
  it('accepts an exception for each design rule', () => {
    for (const rule of DESIGN_RULES) {
      expect(KOTLIN_EXCEPTION_RULES).toContain(rule);
      expect(() => {
        validateKotlinOptions({
          preset: 'kotlin',
          exceptions: [{ rule, paths: ['src/**'], reason: 'intended' }],
        });
      }).not.toThrow();
    }
  });
});
