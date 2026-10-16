import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';
import { kotlinGradleArguments } from './kotlin-tools.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = fileURLToPath(new URL('../fixtures/kotlin-style-project', import.meta.url));
const roots = [];
const WORKSPACE = 'build/tmp/nitpickerKotlinStyleWorkspace';
const LAYERS = 'build/tmp/nitpickerDetektLayers';

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function copyOfFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-style-'));
  roots.push(root);
  cpSync(fixture, root, { recursive: true });
  return root;
}

function runStyleTasks(root, options) {
  const result = spawnSync(
    gradle,
    [
      '--console=plain',
      '--quiet',
      '--offline',
      ...kotlinGradleArguments(root, { formatter: 'ktlint', ...options }),
      '-I',
      INIT_SCRIPT,
      'nitpickerKotlinStyleWorkspace',
      'nitpickerDetektLayers',
    ],
    { cwd: root, encoding: 'utf8', timeout: GRADLE_STEP_TIMEOUT_MS },
  );
  expect(result.status, result.stderr).toBe(0);
  const read = (file) => readFileSync(path.join(root, file), 'utf8');
  return {
    editorconfig: read(`${WORKSPACE}/workspace/.editorconfig`),
    defaults: existsSync(path.join(root, `${WORKSPACE}/ktlint-defaults.editorconfig`))
      ? read(`${WORKSPACE}/ktlint-defaults.editorconfig`)
      : undefined,
    mirrored: readdirSync(path.join(root, `${WORKSPACE}/workspace`), { recursive: true }).sort(),
    layers: read(`${LAYERS}/layers.txt`),
    conventionLayer: existsSync(path.join(root, `${LAYERS}/followed-conventions.yml`))
      ? read(`${LAYERS}/followed-conventions.yml`)
      : undefined,
  };
}

const FOLLOWED = {
  'kotlin.indentation': '2',
  'kotlin.trailingCommas': 'never',
  'kotlin.wildcardImports': 'wildcard',
};
const MIRRORED = [
  '.editorconfig',
  'src',
  'src/main',
  'src/main/kotlin',
  'src/main/kotlin/demo',
  'src/main/kotlin/demo/A.kt',
];

describe.skipIf(!enabled)('the files the init script writes for ktlint and detekt', () => {
  it('mirrors the sources under a root .editorconfig of its own and layers nothing by default', () => {
    const outcome = runStyleTasks(copyOfFixture(), {});

    expect(outcome).toEqual({
      editorconfig: 'root = true\n',
      defaults: undefined,
      mirrored: MIRRORED,
      layers: '',
      conventionLayer: '',
    });
  });

  it('writes the conventions as ktlint defaults and as the lowest detekt layer', () => {
    const outcome = runStyleTasks(copyOfFixture(), { conventions: FOLLOWED });

    expect(outcome).toEqual({
      editorconfig: 'root = true\n',
      defaults: [
        '[*.{kt,kts}]',
        'indent_size = 2',
        'ij_kotlin_allow_trailing_comma = false',
        'ij_kotlin_allow_trailing_comma_on_call_site = false',
        'ktlint_standard_no-wildcard-imports = disabled',
        '',
      ].join('\n'),
      mirrored: MIRRORED,
      layers: expect.stringMatching(/^\/.*followed-conventions\.yml\n$/u),
      conventionLayer: 'style:\n  WildcardImport:\n    active: false\n',
    });
  });

  it.each([
    [
      ['project', 'nitpicker'],
      ['conventions', 'project'],
    ],
    [
      ['nitpicker', 'project'],
      ['project', 'conventions'],
    ],
  ])('orders the detekt layers for precedence %j as %j', (precedence, order) => {
    const root = copyOfFixture();
    const { layers } = runStyleTasks(root, {
      conventions: FOLLOWED,
      toolPrecedence: { detekt: precedence },
    });

    const named = { [path.join(root, 'config/detekt/detekt.yml')]: 'project' };
    expect(
      layers
        .trim()
        .split('\n')
        .map((layer) => named[layer] ?? 'conventions'),
    ).toEqual(order);
  });

  it('keeps the project .editorconfig of the head checkout in the workspace when ktlint lists it', () => {
    const outcome = runStyleTasks(copyOfFixture(), {
      conventions: FOLLOWED,
      toolPrecedence: { ktlint: ['project', 'nitpicker'] },
    });

    expect(outcome.editorconfig).toBe('root = true\n\nroot = true\n\n[*.kt]\nindent_size = 8\n');
  });
});
