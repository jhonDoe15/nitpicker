import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateConfig } from '../../configuration/validate.mts';
import { conventionStyle } from '../../conventions/definitions.mts';
import {
  resolveHeadPolicy as untypedResolveHeadPolicy,
  withHeadCheckoutFacts as untypedWithHeadCheckoutFacts,
} from '../../../languages/typescript/preset/head-policy.mjs';
import { fieldAt, fieldsOf, listOf } from '../../../scripts/json/fields.mts';
import {
  HEAD_POLICY_ENV,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from '../../../shared/head-policy.mjs';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import {
  layeredJscpdConfig as untypedLayeredJscpdConfig,
  resolveJscpdPolicy as untypedResolveJscpdPolicy,
} from './config.mjs';
import { DUPLICATES_REPORT, DUPLICATES_TOOL, runJscpd as untypedRunJscpd } from './run-jscpd.mjs';

type JscpdRun = {
  cwd: string;
  roots: string[];
  format: string;
  ignore: string[];
  reportRoot: string;
  renamed: undefined;
};

const resolveJscpdPolicy: (settings: unknown, projectRoot: string) => unknown =
  untypedResolveJscpdPolicy;
const layeredJscpdConfig: (base: object, settings: unknown) => unknown = untypedLayeredJscpdConfig;
const resolveHeadPolicy: (config: object, projectRoot: string) => object = untypedResolveHeadPolicy;
const withHeadCheckoutFacts: (policy: object, headPolicy: object) => unknown =
  untypedWithHeadCheckoutFacts;
const NOT_OBJECTS: unknown[][] = [[[]], [null], [42]];
const runJscpd: (run: JscpdRun) => void = untypedRunJscpd;
const withHeadPolicyFile: (policy: unknown, operation: (policyFile: string) => void) => void =
  untypedWithHeadPolicyFile;

const roots: string[] = [];
function temporaryRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jscpd-config-'));
  roots.push(root);
  return root;
}
function projectConfig(root: string, config: unknown) {
  writeFileSync(path.join(root, '.jscpd.json'), JSON.stringify(config));
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const ORDERINGS: [string[], number][] = [
  [['nitpicker'], 50],
  [['project'], 500],
  [['project', 'nitpicker'], 500],
  [['nitpicker', 'project'], 50],
];

describe('jscpd project config', () => {
  it.each(ORDERINGS)(
    'layers %j with the highest-precedence values first',
    (precedence, minTokens) => {
      const root = temporaryRoot();
      projectConfig(root, {
        minTokens: 500,
        ignore: ['vendor/**'],
        threshold: 1,
        path: ['/elsewhere'],
        reporters: ['html'],
      });
      const settings = resolveJscpdPolicy({ precedence }, root);
      expect(fieldAt(settings, 'projectConfig') ?? {}).not.toHaveProperty('threshold');
      const result = layeredJscpdConfig(
        { minTokens: 50, threshold: 100, ignore: ['build/**'] },
        settings,
      );
      expect(result).toEqual({
        minTokens,
        threshold: 100,
        ignore: precedence.includes('project') ? ['build/**', 'vendor/**'] : ['build/**'],
      });
    },
  );

  it.each(['typescript', 'javascript', 'java', 'kotlin', 'python'])(
    'accepts all four orderings for %s',
    (preset) => {
      const accepted = ORDERINGS.map(([precedence]) =>
        validateConfig({ preset, tools: { jscpd: { precedence } } }),
      );
      expect(accepted).toEqual(
        ORDERINGS.map(([precedence]) => ({ preset, tools: { jscpd: { precedence } } })),
      );
    },
  );

  it.each(
    ['typescript', 'javascript', 'java', 'kotlin', 'python'].flatMap((preset) =>
      [[], ['project', 'project'], ['unknown'], 'project'].map((precedence) => [
        preset,
        precedence,
      ]),
    ),
  )('rejects the malformed ordering for %s: %j', (preset, precedence) => {
    expect(() => validateConfig({ preset, tools: { jscpd: { precedence } } })).toThrow(
      'tools.jscpd.precedence',
    );
  });

  it('does not read a malformed project config without opt-in', () => {
    const root = temporaryRoot();
    writeFileSync(path.join(root, '.jscpd.json'), '{broken');
    expect(resolveJscpdPolicy(undefined, root)).toBeUndefined();
    expect(resolveJscpdPolicy({ precedence: ['nitpicker'] }, root)).toEqual({
      precedence: ['nitpicker'],
    });
  });

  it.each(NOT_OBJECTS)('rejects the project config %j that is not an object', (value) => {
    const root = temporaryRoot();
    projectConfig(root, value);
    expect(() => resolveJscpdPolicy({ precedence: ['project'] }, root)).toThrow(
      'must contain a JSON object',
    );
  });

  it('rejects missing, malformed and escaping project configs', () => {
    const root = temporaryRoot();
    const settings = { precedence: ['project'] };
    expect(() => resolveJscpdPolicy(settings, root)).toThrow(
      'create it, or remove "project" from tools.jscpd.precedence',
    );
    writeFileSync(path.join(root, '.jscpd.json'), '{broken');
    expect(() => resolveJscpdPolicy(settings, root)).toThrow('.jscpd.json is not valid JSON');
    const outside = temporaryRoot();
    projectConfig(outside, {});
    rmSync(path.join(root, '.jscpd.json'));
    symlinkSync(path.join(outside, '.jscpd.json'), path.join(root, '.jscpd.json'));
    expect(() => resolveJscpdPolicy(settings, root)).toThrow('must stay inside the project');
  });

  it.each([
    [{ minTokens: 0 }, 'minTokens must be a whole number of 1 or more'],
    [{ minLines: '5' }, 'minLines must be a whole number of 1 or more'],
    [{ maxLines: 0 }, 'maxLines must be a whole number of 1 or more'],
    [{ maxSize: 100000 }, 'maxSize must be a size string such as "100kb"'],
    [{ maxSize: 'lots' }, 'maxSize must be a size string such as "100kb"'],
    [{ mode: 'loose' }, 'mode must be one of strict, mild, weak'],
    [{ ignore: 'vendor/**' }, 'ignore must be a list of file globs'],
    [{ ignorePattern: [1] }, 'ignorePattern must be a list of regular expressions'],
    [{ ignorePattern: ['('] }, 'ignorePattern must be a list of regular expressions'],
    [{ ignoreCase: 'yes' }, 'ignoreCase must be true or false'],
  ])('rejects the project value %j', (config, message) => {
    const root = temporaryRoot();
    projectConfig(root, config);
    expect(() => resolveJscpdPolicy({ precedence: ['project'] }, root)).toThrow(message);
  });

  it.each([undefined, 'typescript', 'javascript', 'java', 'kotlin', 'python'])(
    'tells a %s project without the opt-in that its .jscpd.json is ignored',
    (preset) => {
      const root = temporaryRoot();
      const summary = (tools?: NitpickerConfig['tools']) =>
        (
          conventionStyle(preset, {
            config: { preset, ...(tools === undefined ? {} : { tools }) },
            projectRoot: root,
            headPolicy: undefined,
            source: { paths: () => [], readMany: () => new Map() },
            configRoot: () => ({ path: root, snapshot: 'head', dispose: () => {}, notes: [] }),
          }).summary?.({}) ?? []
        ).filter((line) => line.includes('jscpd'));
      expect(summary()).toEqual([]);
      projectConfig(root, { minTokens: 500 });
      expect(summary()).toEqual([
        'Ignoring .jscpd.json; opt in with "tools": { "jscpd": { "precedence": ["project", "nitpicker"] } }',
      ]);
      expect(summary({ jscpd: { precedence: ['nitpicker', 'project'] } })).toEqual([]);
    },
  );

  it('applies skipComments as the weak mode jscpd 5 reads', () => {
    const root = temporaryRoot();
    const settings = { precedence: ['project'] };
    projectConfig(root, { skipComments: true });
    expect(fieldAt(resolveJscpdPolicy(settings, root), 'projectConfig')).toEqual({ mode: 'weak' });
    projectConfig(root, { skipComments: true, mode: 'strict' });
    expect(fieldAt(resolveJscpdPolicy(settings, root), 'projectConfig')).toEqual({
      mode: 'strict',
    });
  });

  it('keeps the digest when only key order or unapplied keys change', () => {
    const root = temporaryRoot();
    const settings = { precedence: ['project'] };
    projectConfig(root, { minTokens: 500, minLines: 9 });
    const first = fieldAt(resolveJscpdPolicy(settings, root), 'projectConfigDigest');
    projectConfig(root, { reporters: ['html'], minLines: 9, minTokens: 500 });
    expect(fieldAt(resolveJscpdPolicy(settings, root), 'projectConfigDigest')).toBe(first);
  });

  it('captures head config and its digest for both snapshots without replacing base precedence', () => {
    const root = temporaryRoot();
    const config = { preset: 'python', tools: { jscpd: { precedence: ['project', 'nitpicker'] } } };
    projectConfig(root, { minTokens: 500 });
    const first = resolveHeadPolicy(config, root);
    projectConfig(root, { minTokens: 600 });
    const second = resolveHeadPolicy(config, root);
    expect(fieldAt(first, 'tools', 'jscpd', 'projectConfig')).toEqual({ minTokens: 500 });
    expect(fieldAt(second, 'tools', 'jscpd', 'projectConfigDigest')).not.toBe(
      fieldAt(first, 'tools', 'jscpd', 'projectConfigDigest'),
    );
    const base = { tools: { jscpd: { precedence: ['nitpicker', 'project'] } } };
    expect(fieldAt(withHeadCheckoutFacts(base, second), 'tools', 'jscpd')).toEqual({
      ...fieldsOf(fieldAt(second, 'tools', 'jscpd')),
      precedence: ['nitpicker', 'project'],
    });
    expect(fieldAt(withHeadCheckoutFacts({}, second), 'tools')).toBeUndefined();
  });

  it.each([[{}], [{ tools: { jscpd: { precedence: ['nitpicker'] } } }]])(
    'measures the base the head way when the head drops the opt-in (%j)',
    (headConfig) => {
      const root = temporaryRoot();
      const head = resolveHeadPolicy({ preset: 'python', ...headConfig }, root);
      const base = { tools: { jscpd: { precedence: ['project'] } } };
      const settings = fieldAt(withHeadCheckoutFacts(base, head), 'tools', 'jscpd');
      expect(settings).toEqual({ precedence: ['nitpicker'] });
      expect(layeredJscpdConfig({ minTokens: 50 }, settings)).toEqual({ minTokens: 50 });
    },
  );

  it('applies project ignore globs that hold braces', () => {
    const root = temporaryRoot();
    const reportRoot = temporaryRoot();
    mkdirSync(path.join(root, 'src'));
    const source =
      'def total(lines, discount):\n    value = 0\n    for line in lines:\n        if line.price > 0 and line.quantity > 0:\n            value += line.price * line.quantity\n        else:\n            value -= discount\n    if value < 0 and discount > 0:\n        value = 0\n    return value\n';
    for (const name of ['a.test.py', 'b.spec.py', 'c.py']) {
      writeFileSync(path.join(root, 'src', name), source);
    }
    projectConfig(root, { ignore: ['**/*.{test,spec}.py'] });
    const policy = resolveHeadPolicy(
      { preset: 'python', tools: { jscpd: { precedence: ['project', 'nitpicker'] } } },
      root,
    );
    withHeadPolicyFile(policy, (policyFile) => {
      vi.stubEnv(HEAD_POLICY_ENV, policyFile);
      runJscpd({
        cwd: root,
        roots: ['src'],
        format: 'python',
        ignore: [],
        reportRoot,
        renamed: undefined,
      });
    });
    const report: unknown = JSON.parse(
      readFileSync(path.join(reportRoot, DUPLICATES_REPORT), 'utf8'),
    );
    expect(fieldAt(report, 'runs', 0, 'report', DUPLICATES_TOOL)).toEqual([]);
  });

  it.each(ORDERINGS)('runs the pinned tool with %j', (precedence, minTokens) => {
    const root = temporaryRoot();
    const reportRoot = temporaryRoot();
    mkdirSync(path.join(root, 'src'));
    const source =
      'def total(lines, discount):\n    value = 0\n    for line in lines:\n        if line.price > 0 and line.quantity > 0:\n            value += line.price * line.quantity\n        else:\n            value -= discount\n    if value < 0 and discount > 0:\n        value = 0\n    return value\n';
    for (const name of ['a.py', 'b.py']) writeFileSync(path.join(root, 'src', name), source);
    projectConfig(root, {
      minTokens: 500,
      path: ['/invalid'],
      format: ['java'],
      reporters: ['invalid'],
      output: '/invalid',
    });
    const policy = resolveHeadPolicy({ preset: 'python', tools: { jscpd: { precedence } } }, root);
    withHeadPolicyFile(policy, (policyFile) => {
      vi.stubEnv(HEAD_POLICY_ENV, policyFile);
      runJscpd({
        cwd: root,
        roots: ['src'],
        format: 'python',
        ignore: [],
        reportRoot,
        renamed: undefined,
      });
    });
    const report: unknown = JSON.parse(
      readFileSync(path.join(reportRoot, DUPLICATES_REPORT), 'utf8'),
    );
    expect(listOf(fieldAt(report, 'runs', 0, 'report', DUPLICATES_TOOL))).toHaveLength(
      minTokens === 500 ? 0 : 1,
    );
  });
});
