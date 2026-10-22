import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../../test-support/gradle-e2e.mjs';
import {
  kotlinGradleArguments,
  kotlinStyleFile,
  resolveKotlinTools,
} from '../../kotlin/kotlin-tools.mjs';
import { gradle, kotlinE2eEnabled } from '../test-support/kotlin-e2e-project.mjs';

const fixture = fileURLToPath(new URL('../../fixtures/kotlin-style-project', import.meta.url));
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
  const resolved = { formatter: 'ktlint', ...options };
  const tools = resolveKotlinTools(root, resolved);
  const styleDirectory = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-style-file-'));
  roots.push(styleDirectory);
  const style = kotlinStyleFile(tools, resolved.conventions ?? {});
  const styleFile = path.join(styleDirectory, 'style.json');
  writeFileSync(styleFile, JSON.stringify(style ?? {}));
  const result = spawnSync(
    gradle,
    [
      '--console=plain',
      '--quiet',
      '--offline',
      ...kotlinGradleArguments(root, { ...resolved, styleFile }, tools),
      '-I',
      INIT_SCRIPT,
      'nitpickerKotlinStyleWorkspace',
      'nitpickerDetektLayers',
    ],
    { cwd: root, encoding: 'utf8', timeout: GRADLE_STEP_TIMEOUT_MS },
  );
  expect(result.status, result.stderr).toBe(0);
  const read = (file) => readFileSync(path.join(root, file), 'utf8');
  const workspace = path.join(root, `${WORKSPACE}/workspace`);
  return {
    editorconfig: existsSync(workspace) ? read(`${WORKSPACE}/workspace/.editorconfig`) : undefined,
    defaults: existsSync(path.join(root, `${WORKSPACE}/ktlint-defaults.editorconfig`))
      ? read(`${WORKSPACE}/ktlint-defaults.editorconfig`)
      : undefined,
    mirrored: existsSync(workspace)
      ? readdirSync(workspace, { recursive: true }).sort()
      : undefined,
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

describe.skipIf(!kotlinE2eEnabled)('the files the init script writes for ktlint and detekt', () => {
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

  it('writes the line length as a ktlint default and as a detekt MaxLineLength layer', () => {
    const outcome = runStyleTasks(copyOfFixture(), { conventions: { 'kotlin.lineLength': '120' } });

    expect(outcome.defaults).toBe('[*.{kt,kts}]\nmax_line_length = 120\n');
    expect(outcome.conventionLayer).toBe('style:\n  MaxLineLength:\n    maxLineLength: 120\n');
  });

  it.each([
    [
      ['project', 'nitpicker'],
      ['conventions', 'project', 'enforced'],
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

    const named = {
      [path.join(root, 'config/detekt/detekt.yml')]: 'project',
      [path.join(root, LAYERS, 'followed-conventions.yml')]: 'conventions',
      [path.join(root, LAYERS, 'enforced-conventions.yml')]: 'enforced',
    };
    expect(
      layers
        .trim()
        .split('\n')
        .map((layer) => named[layer] ?? layer),
    ).toEqual(order);
  });

  it('keeps the project .editorconfig of the head checkout in the workspace when ktlint lists it', () => {
    const outcome = runStyleTasks(copyOfFixture(), {
      conventions: { 'kotlin.trailingCommas': 'never', 'kotlin.wildcardImports': 'wildcard' },
      toolPrecedence: { ktlint: ['project', 'nitpicker'] },
    });

    expect(outcome.editorconfig).toBe('root = true\n\nroot = true\n\n[*.kt]\nindent_size = 8\n');
  });

  it('appends the followed value after a project .editorconfig of the head checkout that changes it', () => {
    const outcome = runStyleTasks(copyOfFixture(), {
      conventions: FOLLOWED,
      toolPrecedence: { ktlint: ['project', 'nitpicker'] },
    });

    expect(outcome.editorconfig).toBe(
      'root = true\n\nroot = true\n\n[*.kt]\nindent_size = 8\n\n[*.{kt,kts}]\nindent_size = 2\n',
    );
  });

  it('mirrors the nested and the ancestor .editorconfig files at their repository paths, root = true on the top one', () => {
    const repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-style-repo-'));
    roots.push(repository);
    const root = path.join(repository, 'services/api');
    cpSync(fixture, root, { recursive: true });
    mkdirSync(path.join(repository, '.git'));
    writeFileSync(path.join(repository, '.git/HEAD'), '');
    writeFileSync(
      path.join(repository, '.editorconfig'),
      '[services/api/**.kt]\nindent_size = 2\n',
    );
    writeFileSync(path.join(root, 'src/main/kotlin/.editorconfig'), '[*.kt]\nindent_size = 4\n');

    const outcome = runStyleTasks(root, { toolPrecedence: { ktlint: ['project'] } });

    expect(outcome.editorconfig).toBe('root = true\n\n[services/api/**.kt]\nindent_size = 2\n');
    expect(outcome.mirrored).toEqual([
      '.editorconfig',
      'services',
      'services/api',
      'services/api/.editorconfig',
      'services/api/src',
      'services/api/src/main',
      'services/api/src/main/kotlin',
      'services/api/src/main/kotlin/.editorconfig',
      'services/api/src/main/kotlin/demo',
      'services/api/src/main/kotlin/demo/A.kt',
    ]);
    expect(
      readFileSync(
        path.join(root, `${WORKSPACE}/workspace/services/api/src/main/kotlin/.editorconfig`),
        'utf8',
      ),
    ).toBe('[*.kt]\nindent_size = 4\n');
  });

  it('copies no sources for ktfmt unless it reads the .editorconfig files', () => {
    expect(runStyleTasks(copyOfFixture(), { formatter: 'ktfmt' }).mirrored).toBeUndefined();
    expect(
      runStyleTasks(copyOfFixture(), {
        formatter: 'ktfmt',
        toolPrecedence: { ktfmt: ['project'] },
      }).mirrored,
    ).toEqual([
      '.editorconfig',
      'src',
      'src/main',
      'src/main/kotlin',
      'src/main/kotlin/demo',
      'src/main/kotlin/demo/A.kt',
    ]);
  });
});
