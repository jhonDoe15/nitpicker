import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  command,
  commitBranch,
  gate,
  createWorkspace,
  goRepository,
  newFindings,
  newMessages,
  removeWorkspace,
  temporaryDirectory,
  toolErrorMessages,
  toolErrors,
} from './test-support/go-e2e-support.mjs';
import {
  BASE_FILES,
  DISCOUNT,
  GOFUMPT_ONLY,
  SHORT_DISCARDED_TEST,
  SHORT_LOGGED_TEST,
  SHORT_SKIPPED_TEST,
  SLOW_INTEGRATION_TEST,
  SLOW_TEST,
} from './test-support/go-fixtures.mjs';

const goE2eEnabled = process.env.NITPICKER_GO_E2E === '1';
const GO_NOT_FOUND =
  'go was not found on the PATH: install Go (https://go.dev/dl/) or put its bin folder on the PATH';
const INSPECT_SOURCE = path.resolve(import.meta.dirname, '../../inspect');
const LINT_SOURCE = path.resolve(import.meta.dirname, '../../lint');

function pathWithoutGo(workspace) {
  const bin = temporaryDirectory(workspace, 'bin-');
  for (const program of ['git', 'node']) {
    symlinkSync(command(bin, 'which', [program]).trim(), path.join(bin, program));
  }
  return bin;
}

describe.skipIf(!goE2eEnabled)('Go preset project setups end to end', () => {
  let workspace;
  let project;
  beforeAll(() => {
    workspace = createWorkspace();
    project = goRepository(workspace, {
      ...BASE_FILES,
      'shop/padded.go': GOFUMPT_ONLY.replace('Rounded', 'Padded'),
    });
    commitBranch(project, 'slow', { 'shop/slow_test.go': SLOW_TEST });
    commitBranch(project, 'slow-integration', {
      'shop/slow_integration_test.go': SLOW_INTEGRATION_TEST,
      'nitpicker.config.json':
        '{ "preset": "go", "disable": ["mutation"], "go": { "buildTags": ["integration"] } }\n',
    });
    commitBranch(project, 'short-skip', { 'shop/skipped_test.go': SHORT_SKIPPED_TEST });
    commitBranch(project, 'short-no-skip', {
      'shop/logged_test.go': SHORT_LOGGED_TEST,
      'shop/discarded_test.go': SHORT_DISCARDED_TEST,
    });
    commitBranch(project, 'gofumpt', {
      '.golangci.yml': 'version: "2"\nformatters:\n  enable: [gofumpt]\n',
      'shop/rounded.go': GOFUMPT_ONLY,
    });
    commitBranch(project, 'adopt-gofumpt', {
      '.golangci.yml': 'version: "2"\nformatters:\n  enable: [gofumpt]\n',
    });
    commitBranch(project, 'no-go', { 'shop/discount.go': DISCOUNT });
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails a new unit test slower than the unit budget', () => {
    const result = gate(project, 'slow');
    expect(newFindings(result)).toEqual(['test-runtime/slow-test shop/slow_test.go']);
    expect(
      newMessages(result).map((message) => message.replace(/took \d+\.\d s/u, 'took N s')),
    ).toEqual([
      'TestSlow took N s; a unit test may take 5 s. Remove time.Sleep and other waits (inject the clock, or wait on a channel or sync.WaitGroup) and fake network, database and disk access with an interface or httptest, or move it to an integration test (an integration or e2e folder, a *_integration_test.go file, an integration or e2e build tag, or a first statement if testing.Short() { t.Skip(...) }) if it is one. If this is intended, add {"rule":"slow-test","paths":["shop/slow_test.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it.each([
    ['holds a test behind an integration build tag to the integration budget', 'slow-integration'],
    ['holds a test that skips under testing.Short() to the integration budget', 'short-skip'],
    [
      'checks the merge base with the formatter the change adopts, so untouched files stay quiet',
      'adopt-gofumpt',
    ],
  ])('%s', (_title, branch) => {
    expect(newFindings(gate(project, branch))).toEqual([]);
  });

  it('keeps the unit budget for a test that reads testing.Short() without skipping', () => {
    expect(newFindings(gate(project, 'short-no-skip'))).toEqual([
      'test-runtime/slow-test shop/discarded_test.go',
      'test-runtime/slow-test shop/logged_test.go',
    ]);
  });

  it('follows gofumpt when the golangci-lint config enables it', () => {
    const result = gate(project, 'gofumpt');
    expect(newFindings(result)).toEqual(['gofumpt/format shop/rounded.go']);
    expect(newMessages(result)).toEqual([
      "File is not formatted with gofumpt (the project's formatter, from .golangci.yml). Run `gofumpt -w <file>` to format the file.",
    ]);
  });

  it('reports a missing Go toolchain as a tool error', () => {
    vi.stubEnv('PATH', pathWithoutGo(workspace));
    const result = gate(project, 'no-go');
    expect(toolErrors(result)).toEqual(['go/go-missing .', 'go/go-missing .']);
    expect(toolErrorMessages(result)).toEqual([GO_NOT_FOUND, GO_NOT_FOUND]);
  });

  it('ships a metrics program whose own Go tests pass', () => {
    const output = command(INSPECT_SOURCE, 'go', ['test', '-count=1', './...']);
    expect(output.replaceAll(/\t\S+$/gmu, '')).toBe(
      [
        'ok  \tgithub.com/jhonDoe15/nitpicker/languages/go/inspect',
        'ok  \tgithub.com/jhonDoe15/nitpicker/languages/go/inspect/design',
        ...['calls', 'chain', 'decide', 'index', 'reads', 'scope', 'uses'].map(
          (name) =>
            `?   \tgithub.com/jhonDoe15/nitpicker/languages/go/inspect/design/${name}\t[no test files]`,
        ),
        'ok  \tgithub.com/jhonDoe15/nitpicker/languages/go/inspect/mutants',
        '',
      ].join('\n'),
    );
  });

  it('ships a lint program whose fixtures fail and pass as marked', () => {
    const output = command(LINT_SOURCE, 'go', ['test', '-count=1', '.']);
    expect(output.replace(/\t\S+\n$/u, '\n')).toBe(
      'ok  \tgithub.com/jhonDoe15/nitpicker/languages/go/lint\n',
    );
  });
});
