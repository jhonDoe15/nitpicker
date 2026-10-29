import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateConfig } from '../../../../core/configuration/validate.mjs';
import { normalizeMutation } from '../../adapters/quality-areas/reporting/tests.mjs';
import { resolveHeadPolicy, withHeadCheckoutFacts } from '../head-policy.mjs';
import { ignoredScriptToolNotices } from './ignored-notices.mjs';
import {
  layeredStrykerConfig,
  readStrykerProjectConfig,
  withoutProjectIgnoredMutants,
} from './stryker-project-config.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-stryker-config-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const ORDERINGS = [['nitpicker'], ['project'], ['project', 'nitpicker'], ['nitpicker', 'project']];
const EACH_ORDERING = ORDERINGS.map((precedence) => [precedence]);

const NITPICKER = {
  mutate: ['src/**/*.ts'],
  testRunner: 'jest',
  checkers: ['typescript'],
  plugins: ['/pinned/jest-runner.js'],
  reporters: ['json'],
  thresholds: { break: 0 },
  timeoutMS: 10_000,
  testRunnerNodeArgs: ['--experimental-vm-modules'],
  ignorePatterns: ['reports', '!.nitpicker-diff-stryker.*'],
};

const PROJECT = {
  mutate: ['lib/**'],
  testRunner: 'command',
  checkers: [],
  plugins: ['./my-reporter.js'],
  reporters: ['html'],
  thresholds: { break: 90 },
  tempDirName: 'elsewhere',
  timeoutMS: 60_000,
  concurrency: 2,
  mutator: { excludedMutations: ['StringLiteral'] },
  testRunnerNodeArgs: ['--max-old-space-size=4096'],
  ignorePatterns: ['fixtures'],
};

function settingsFor(precedence, project = PROJECT) {
  const root = projectWith({ 'stryker.config.json': JSON.stringify(project) });
  return resolveHeadPolicy({ tools: { stryker: { precedence } } }, root).tools.stryker;
}

describe('the project Stryker config', () => {
  it.each(EACH_ORDERING)('layers %j over the config nitpicker needs', (precedence) => {
    const layered = layeredStrykerConfig(NITPICKER, settingsFor(precedence));
    const usesProject = precedence.includes('project');

    expect(layered).toEqual({
      ...NITPICKER,
      ...(usesProject
        ? {
            timeoutMS: precedence[0] === 'project' ? 60_000 : 10_000,
            concurrency: 2,
            mutator: { excludedMutations: ['StringLiteral'] },
            testRunnerNodeArgs: ['--experimental-vm-modules', '--max-old-space-size=4096'],
            ignorePatterns: ['fixtures', 'reports', '!.nitpicker-diff-stryker.*'],
          }
        : {}),
    });
  });

  it('reads the first config in Stryker order, from JSON, ES module and CommonJS files', () => {
    const json = projectWith({
      'stryker.conf.json': '{"concurrency": 1}',
      'stryker.config.mjs': 'export default { concurrency: 2 };',
    });
    const esm = projectWith({
      'stryker.config.mjs': "export default { concurrency: 2, reporters: ['html'] };",
    });
    const cjs = projectWith({
      'package.json': '{"type":"module"}',
      '.stryker.conf.cjs': 'module.exports = { ignoreStatic: true, warnings: false };',
    });

    expect(readStrykerProjectConfig(json)).toEqual({ concurrency: 1 });
    expect(readStrykerProjectConfig(esm)).toEqual({ concurrency: 2 });
    expect(readStrykerProjectConfig(cjs)).toEqual({ ignoreStatic: true, warnings: false });
  });

  it('is a tool error when the config is missing, malformed or escapes the project', () => {
    const outside = projectWith({ 'stryker.config.json': '{}' });
    const cases = [
      [{}, '"tools.stryker.precedence" lists "project" but a Stryker config (stryker.conf.json'],
      [{ 'stryker.config.json': '{broken' }, 'stryker.config.json is not valid JSON'],
      [{ 'stryker.config.json': '[]' }, 'stryker.config.json must contain a JSON object'],
      [{ 'stryker.config.mjs': 'export default 3;' }, 'must export an object as its default'],
      [
        { 'stryker.config.mjs': "throw new Error('boom');" },
        'stryker.config.mjs could not be loaded: boom',
      ],
      [{ 'stryker.config.json': '{"ignorePatterns":"x"}' }, '"ignorePatterns" must be an array'],
      [
        { 'stryker.config.json': '{"mutator":{"excludedMutations":[1]}}' },
        '"mutator.excludedMutations" must be an array of strings',
      ],
    ];
    for (const [files, message] of cases) {
      const root = projectWith(files);
      const settings = resolveHeadPolicy({ tools: { stryker: { precedence: ['project'] } } }, root)
        .tools.stryker;
      expect(settings.projectConfigError).toContain(message);
      expect(() => layeredStrykerConfig(NITPICKER, settings)).toThrow(message);
    }
    const linked = projectWith({});
    symlinkSync(
      path.join(outside, 'stryker.config.json'),
      path.join(linked, 'stryker.config.json'),
    );
    expect(() => readStrykerProjectConfig(linked)).toThrow('must stay inside the project');
  });

  it('is not read without the opt-in, even when it cannot be parsed', () => {
    const root = projectWith({ 'stryker.config.json': '{broken' });
    const policy = resolveHeadPolicy({ tools: { stryker: { precedence: ['nitpicker'] } } }, root);

    expect(policy.tools.stryker).toEqual({ precedence: ['nitpicker'] });
    expect(layeredStrykerConfig(NITPICKER, policy.tools.stryker)).toBe(NITPICKER);
  });

  it('applies the head checkout config to the base snapshot', () => {
    const head = resolveHeadPolicy(
      { tools: { stryker: { precedence: ['project'] } } },
      projectWith({ 'stryker.config.json': '{"concurrency": 3}' }),
    );
    const base = withHeadCheckoutFacts(
      { exclude: ['old/**'], tools: { stryker: { precedence: ['project'] } } },
      head,
    );

    expect(base.tools.stryker).toEqual(head.tools.stryker);
    expect(layeredStrykerConfig(NITPICKER, base.tools.stryker).concurrency).toBe(3);
    expect(
      withHeadCheckoutFacts({ tools: { stryker: { precedence: ['nitpicker'] } } }, head).tools,
    ).toEqual({ stryker: { precedence: ['nitpicker'] } });
  });
});

function strykerMutant(line, mutatorName, excluded, comment) {
  const reason =
    comment ??
    (excluded.includes(mutatorName)
      ? `Ignored because of excluded mutation "${mutatorName}"`
      : undefined);
  return {
    mutatorName,
    replacement: `${mutatorName} replacement`,
    location: { start: { line, column: 1 }, end: { line, column: 9 } },
    ...(reason === undefined
      ? { status: 'Survived' }
      : { status: 'Ignored', statusReason: reason }),
  };
}

function mutationFindings(precedence) {
  const settings = settingsFor(precedence, { mutator: { excludedMutations: ['StringLiteral'] } });
  const excluded = layeredStrykerConfig({ plugins: [] }, settings).mutator?.excludedMutations ?? [];
  const mutants = [
    strykerMutant(1, 'ConditionalExpression', excluded),
    strykerMutant(1, 'StringLiteral', excluded),
    strykerMutant(3, 'ArrowFunction', excluded, 'legacy'),
  ];
  const report = { files: { 'src/grade.ts': { mutants } } };
  return normalizeMutation(withoutProjectIgnoredMutants(report, settings), 'm')
    .filter(({ classification }) => classification === 'enforceable')
    .map(
      ({ rule, identity, location }) =>
        `${String(location.line)} ${rule} ${identity.split('|')[0]}`,
    )
    .toSorted();
}

describe('mutants the project config excludes', () => {
  it.each(EACH_ORDERING)('with %j, are reported only without the opt-in', (precedence) => {
    expect(mutationFindings(precedence)).toEqual([
      '1 mutant-survived ConditionalExpression',
      ...(precedence.includes('project') ? [] : ['1 mutant-survived StringLiteral']),
      '3 mutant-ignored ArrowFunction',
    ]);
  });

  it('drops a static mutant only when the project ignores static mutants', () => {
    const staticMutant = {
      mutatorName: 'StringLiteral',
      status: 'Ignored',
      static: true,
      statusReason: 'Static mutant (and "ignoreStatic" was enabled)',
    };
    const report = { files: { 'src/a.ts': { mutants: [staticMutant] } } };
    const kept = (project) =>
      withoutProjectIgnoredMutants(report, settingsFor(['project'], project)).files['src/a.ts']
        .mutants.length;

    expect(kept({ ignoreStatic: true })).toBe(0);
    expect(kept({})).toBe(1);
  });
});

describe('the Stryker precedence setting', () => {
  it('accepts every ordering with the TypeScript and JavaScript presets only', () => {
    for (const preset of [undefined, 'typescript', 'javascript']) {
      for (const precedence of ORDERINGS) {
        const config = { preset, tools: { stryker: { precedence } } };
        expect(validateConfig(config)).toEqual(config);
      }
      expect(() => validateConfig({ preset, tools: { stryker: { precedence: [] } } })).toThrow(
        '"tools.stryker.precedence" must list "project", "nitpicker" or both, each once, highest first',
      );
    }
    expect(() =>
      validateConfig({ preset: 'python', tools: { stryker: { precedence: ['project'] } } }),
    ).toThrow('"tools" names unknown tool "stryker"');
  });

  it('prints a notice for an ignored Stryker config while mutation testing runs', () => {
    const root = projectWith({ '.stryker.config.mjs': 'export default {};' });
    const notices = (config) => ignoredScriptToolNotices({ config, projectRoot: root });

    expect(notices({})).toEqual([
      'Ignoring .stryker.config.mjs; opt in with "tools": { "stryker": { "precedence": ["project", "nitpicker"] } }',
    ]);
    expect(notices({ tools: { stryker: { precedence: ['nitpicker', 'project'] } } })).toEqual([]);
    expect(notices({ disable: ['mutation'] })).toEqual([]);
    expect(ignoredScriptToolNotices({ config: {}, projectRoot: projectWith({}) })).toEqual([]);
  });
});
