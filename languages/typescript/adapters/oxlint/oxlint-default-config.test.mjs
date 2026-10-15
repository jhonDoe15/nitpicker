import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { oxlintBinary, spawnJson } from './oxlint-process.mjs';
import { nativeRuleIndex, PARITY_BRIDGED_RULES, translatePlan } from './oxlint-translation.mjs';
import { stageConfig } from './stage/oxlint-stage.mjs';

const DEFAULT_CONFIG = path.join(import.meta.dirname, '../../preset/defaults/eslint.config.mjs');
const SOURCES = {
  'package.json': '{ "type": "module" }\n',
  'tsconfig.json': '{ "compilerOptions": { "strict": true }, "include": ["src", "test"] }\n',
  'src/one.ts': 'export const one = 1;\n',
  'test/one.test.ts':
    "import { expect, it } from 'vitest';\nit('one', () => { expect(1).toBe(1); });\n",
};

let root;
let run;
let bridged;

function nativeOnly(partition) {
  return {
    ...partition,
    overrides: partition.overrides.map((override) => ({
      ...override,
      rules: Object.fromEntries(
        Object.entries(override.rules).filter(([name]) => !name.startsWith('js-')),
      ),
    })),
  };
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-default-')));
  for (const [relativePath, text] of Object.entries(SOURCES)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
  const environment = {
    ...process.env,
    NITPICKER_DIFF_ESLINT_POLICY_CONFIG: DEFAULT_CONFIG,
    NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
  };
  const plan = spawnJson([path.join(import.meta.dirname, 'oxlint-plan.mjs'), root, '**/*.ts'], {
    cwd: root,
    env: environment,
    context: 'oxlint planning',
  });
  const listed = spawnJson([oxlintBinary(), '--rules', '--format', 'json'], {
    cwd: root,
    env: environment,
    context: 'oxlint rule listing',
  });
  bridged = new Set(PARITY_BRIDGED_RULES);
  const translation = translatePlan(plan, {
    nativeRules: nativeRuleIndex(listed),
    bridgedRules: bridged,
  });
  const configs = translation.partitions.map((partition, index) => {
    const configPath = path.join(root, `oxlintrc-${String(index)}.json`);
    writeFileSync(configPath, JSON.stringify(stageConfig(nativeOnly(partition), [])));
    return { configPath, files: partition.files };
  });
  run = configs.map(({ configPath, files }) =>
    spawnSync(
      oxlintBinary(),
      ['--config', configPath, '--format', 'json', '--no-ignore', ...files],
      {
        cwd: root,
        encoding: 'utf8',
      },
    ),
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the oxlint translation of the default ESLint config', () => {
  it('is accepted by oxlint on the first run, without bridging rules up front', () => {
    expect(
      run.map(({ status, stdout }) => ({ status, built: !stdout.includes('Failed to build') })),
    ).toEqual(run.map(() => ({ status: 0, built: true })));
    expect([...bridged].sort()).toEqual([...PARITY_BRIDGED_RULES].sort());
  });
});
