import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateConfig } from '../../../../core/configuration/validate.mjs';
import { normalizeMutation } from '../../adapters/quality-areas/reporting/tests.mjs';
import { resolveHeadPolicy, withHeadCheckoutFacts } from '../head-policy.mjs';
import { strykerIgnoredNotices } from './ignored-notices.mjs';
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

const MALFORMED_CONFIGS = [
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
  [{ 'stryker.config.json': '{"mutator":"all"}' }, '"mutator" must be an object'],
  [{ 'stryker.config.json': '{"mutator":[]}' }, '"mutator" must be an object'],
  [{ 'stryker.config.json': '{"timeoutMS":"fast"}' }, '"timeoutMS" must be a number'],
];

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

  it.each(EACH_ORDERING)('keeps one mutator block whole with %j', (precedence) => {
    const own = { mutator: { excludedMutations: ['ArrowFunction'], plugins: [] } };
    const layered = layeredStrykerConfig(own, settingsFor(precedence));

    expect(layered.mutator).toEqual(precedence[0] === 'project' ? PROJECT.mutator : own.mutator);
  });

  it('never lets the project lower a timeout below what nitpicker or Stryker uses', () => {
    const lowered = { timeoutMS: 1, timeoutFactor: 0.1, dryRunTimeoutMinutes: 0 };
    const raised = { timeoutMS: 20_000, timeoutFactor: 3, dryRunTimeoutMinutes: 30 };
    const layered = (own, project) =>
      layeredStrykerConfig(own, settingsFor(['project', 'nitpicker'], project));

    expect(layered({ timeoutMS: 10_000, timeoutFactor: 2 }, lowered)).toEqual({
      timeoutMS: 10_000,
      timeoutFactor: 2,
      dryRunTimeoutMinutes: 5,
      ignorePatterns: [],
    });
    expect(layered({}, lowered)).toEqual({
      timeoutMS: 5000,
      timeoutFactor: 1.5,
      dryRunTimeoutMinutes: 5,
      ignorePatterns: [],
    });
    expect(layered({ timeoutMS: 10_000 }, raised)).toEqual({ ...raised, ignorePatterns: [] });
    expect(layered({ timeoutMS: 10_000 }, {})).toEqual({ timeoutMS: 10_000, ignorePatterns: [] });
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

  it.each(MALFORMED_CONFIGS)('is a tool error for %j', (files, message) => {
    const root = projectWith(files);
    const settings = resolveHeadPolicy({ tools: { stryker: { precedence: ['project'] } } }, root)
      .tools.stryker;

    expect(settings.projectConfigError).toContain(message);
    expect(() => layeredStrykerConfig(NITPICKER, settings)).toThrow(message);
  });

  it('is a tool error when a symlink moves the config out of the project', () => {
    const outside = projectWith({ 'stryker.config.json': '{}' });
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

  it('follows a head that removed the opt-in, with or without a stryker setting', () => {
    const root = projectWith({ 'stryker.config.json': '{"concurrency": 3}' });
    const base = { tools: { stryker: { precedence: ['project'] } } };

    expect(withHeadCheckoutFacts(base, resolveHeadPolicy({}, root)).tools.stryker).toEqual({
      precedence: ['nitpicker'],
    });
    expect(
      withHeadCheckoutFacts(base, resolveHeadPolicy({ tools: { stryker: {} } }, root)).tools
        .stryker,
    ).toEqual({ precedence: ['nitpicker'] });
    expect(
      withHeadCheckoutFacts(
        base,
        resolveHeadPolicy({ tools: { stryker: { precedence: ['nitpicker'] } } }, root),
      ).tools.stryker,
    ).toEqual({ precedence: ['nitpicker'] });
  });

  it('does not run the project config when mutation is disabled', () => {
    const root = projectWith({ 'stryker.config.mjs': "throw new Error('ran');" });
    const config = { tools: { stryker: { precedence: ['project'] } } };

    expect(resolveHeadPolicy({ ...config, disable: ['mutation'] }, root).tools.stryker).toEqual({
      precedence: ['project'],
    });
    expect(resolveHeadPolicy(config, root).tools.stryker.projectConfigError).toBe(
      'stryker.config.mjs could not be loaded: ran',
    );
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
  const applied = layeredStrykerConfig({ plugins: [] }, settings);
  const excluded = applied.mutator?.excludedMutations ?? [];
  const mutants = [
    strykerMutant(1, 'ConditionalExpression', excluded),
    strykerMutant(1, 'StringLiteral', excluded),
    strykerMutant(3, 'ArrowFunction', excluded, 'legacy'),
    strykerMutant(4, 'StringLiteral', excluded, 'hand-checked'),
  ];
  const report = { files: { 'src/grade.ts': { mutants } } };
  return normalizeMutation(withoutProjectIgnoredMutants(report, applied), 'm')
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
      '4 mutant-ignored StringLiteral',
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
      withoutProjectIgnoredMutants(
        report,
        layeredStrykerConfig({}, settingsFor(['project'], project)),
      ).files['src/a.ts'].mutants.length;

    expect(kept({ ignoreStatic: true })).toBe(0);
    expect(kept({})).toBe(1);
    expect(kept({ mutator: { excludedMutations: ['StringLiteral'] } })).toBe(1);
  });
});

describe('the Stryker precedence setting', () => {
  it.each([[undefined], ['typescript'], ['javascript']])(
    'accepts every ordering with the %s preset',
    (preset) => {
      const configs = ORDERINGS.map((precedence) => ({
        preset,
        tools: { stryker: { precedence } },
      }));

      expect(configs.map((config) => validateConfig(config))).toEqual(configs);
      expect(() => validateConfig({ preset, tools: { stryker: { precedence: [] } } })).toThrow(
        '"tools.stryker.precedence" must list "project", "nitpicker" or both, each once, highest first',
      );
    },
  );

  it('is an unknown tool outside the TypeScript and JavaScript presets', () => {
    expect(() =>
      validateConfig({ preset: 'python', tools: { stryker: { precedence: ['project'] } } }),
    ).toThrow('"tools" names unknown tool "stryker"');
  });

  it('prints a notice for an ignored Stryker config while mutation testing runs', () => {
    const root = projectWith({ '.stryker.config.mjs': 'export default {};' });
    const notices = (config) => strykerIgnoredNotices({ config, projectRoot: root });

    expect(notices({})).toEqual([
      'Ignoring .stryker.config.mjs; opt in with "tools": { "stryker": { "precedence": ["project", "nitpicker"] } }',
    ]);
    expect(notices({ tools: { stryker: { precedence: ['nitpicker', 'project'] } } })).toEqual([]);
    expect(notices({ disable: ['mutation'] })).toEqual([]);
    expect(strykerIgnoredNotices({ config: {}, projectRoot: projectWith({}) })).toEqual([]);
  });
});
