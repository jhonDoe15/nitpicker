import { createRequire } from 'node:module';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readSnippet } from './init/files/agents-md.mts';
import { PACKAGE_ROOT as untypedPackageRoot } from './tooling/tool-resolution.mjs';
import {
  MINIMUM_NODE as untypedMinimumNode,
  supportsRedirect as untypedSupportsRedirect,
} from '../languages/typescript/typescript-api/api-redirect.mjs';
import { fieldAt } from '../scripts/json/fields.mts';
import { listOf, parseJson, textOf } from '../shared/values/readers.mts';
import {
  consumerCommands,
  eslintVersionOf,
  type CommandResult,
} from './test-support/installed-consumer.mts';
import {
  checkoutOutput,
  installedHelpText,
  expectedDirtyFindings,
  expectedDirtyOutput,
  expectedSnapshotOutput,
  installedHelpUri,
  installedLinks,
} from './test-support/installed-expectations.mts';

const MINIMUM_NODE: readonly number[] = untypedMinimumNode;
const supportsRedirect: () => boolean = untypedSupportsRedirect;
const enabled = process.env['NITPICKER_INSTALLED_TEST'] === '1';
const packageRoot: string = untypedPackageRoot;
const manifest = readJson(path.join(packageRoot, 'package.json'));
const links = installedLinks(manifest);
const typedManifest = {
  version: textOf(fieldAt(manifest, 'version')),
  dependency: (name: string) => textOf(fieldAt(manifest, 'dependencies', name)),
};
const layouts = [undefined, 'nested', 'linked'] as const;
const explained = ['pmd/UnusedLocalVariable', 'coverage', 'MagicNumber'];
const installer = 'npm@11';
const cleanSource = 'export function example() {\n  return 1;\n}\n';
const violation = 'export function example(){\n  debugger;\n  return 1\n}\n';

const expectedEslintVersion = eslintVersionOf(typedManifest);
const { command, checked } = consumerCommands({ ...process.env, NO_COLOR: '1' });

function readJson(file: string): unknown {
  return parseJson(readFileSync(file, 'utf8'));
}

function withoutSlowAnalyzerLines(output: string): string {
  return output.replaceAll(/^nitpicker: (?:base|head) [\w-]+ done \([^)]*\), \d+ of \d+\n/gmu, '');
}

function manifestText(...keys: string[]): string {
  return textOf(fieldAt(manifest, ...keys));
}

function write(root: string, relative: string, contents: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function listing(root: string): string[] {
  function walk(directory: string, prefix = ''): string[] {
    return readdirSync(directory).flatMap((name) => {
      const relative = path.posix.join(prefix, name);
      const location = path.join(directory, name);
      if (lstatSync(location).isDirectory()) return walk(location, relative);
      return [`${relative}:${String(lstatSync(location).size)}`];
    });
  }
  return walk(realpathSync(root)).sort();
}

function temporaryFiles(root: string): string[] {
  const result: string[] = [];
  function walk(directory: string): void {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.name === '.git') continue;
      const location = path.join(directory, item.name);
      if (/^\.(?:quality|nitpicker)-/.test(item.name)) result.push(path.relative(root, location));
      if (item.isDirectory()) walk(location);
    }
  }
  walk(root);
  return result;
}

const suite = enabled ? describe : describe.skip;
suite('packed nitpicker in a separate consumer', () => {
  let packRoot: string | undefined;
  let tarball: string;
  beforeAll(() => {
    packRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-packed-'));
    checked(packageRoot, 'npm', ['pack', '--pack-destination', packRoot]);
    const tarballs = readdirSync(packRoot).filter((file) => file.endsWith('.tgz'));
    if (tarballs.length !== 1)
      throw new Error(`Expected one packed tarball, received ${String(tarballs.length)}`);
    tarball = path.join(packRoot, tarballs[0] ?? '');
  }, 180_000);
  afterAll(() => {
    if (packRoot) rmSync(packRoot, { recursive: true, force: true });
  });

  describe.runIf(supportsRedirect())('a consumer on TypeScript 7', () => {
    const typeScript7 = textOf(fieldAt(manifest, 'dependencies', '@typescript/native')).replace(
      'npm:typescript@',
      '',
    );
    const jsApi = textOf(fieldAt(manifest, 'dependencies', 'typescript-js-api')).replace(
      'npm:typescript@',
      '',
    );
    const twiceSource = (expression: string) =>
      `export function twice(value: number): number {\n  return ${expression};\n}\n`;
    const analyzers = 'typescript-typecheck eslint-lint structure dependency-architecture'.split(
      ' ',
    );
    const mergeFile = 'src/main/merge.ts';
    let root: string;
    let nativeRun: CommandResult | undefined;
    let projectRun: CommandResult | undefined;
    const output = (name: string) => path.join(root, 'reports', name);
    const gate = (name: string) =>
      command(root, 'npx', [
        '--no-install',
        'nitpicker',
        '--base',
        'main',
        ...analyzers.flatMap((analyzer) => ['--analyzer', analyzer]),
        '--output',
        output(name),
      ]);
    const report = (name: string) => readJson(path.join(output(name), 'summary.json'));
    const findings = (name: string) =>
      listOf(readJson(path.join(output(name), 'new-findings.json')));
    const added = (name: string) =>
      findings(name)
        .filter((finding) => fieldAt(finding, 'path') !== mergeFile)
        .map(
          (finding) => `${textOf(fieldAt(finding, 'tool'))}/${textOf(fieldAt(finding, 'rule'))}`,
        );
    const spreads = (name: string) =>
      findings(name)
        .filter((finding) => fieldAt(finding, 'rule') === 'nitpicker/no-accumulating-spread')
        .map(
          (finding) =>
            `${textOf(fieldAt(finding, 'path'))}:${textOf(fieldAt(finding, 'location', 'line'))}`,
        );

    beforeAll(() => {
      root = mkdtempSync(path.join(tmpdir(), 'nitpicker consumer-ts7-'));
      checked(root, 'git', ['init', '-b', 'main']);
      write(root, '.gitignore', 'node_modules/\nreports/\n');
      write(
        root,
        'package.json',
        JSON.stringify({
          name: 'nitpicker-installed-ts7-consumer',
          private: true,
          type: 'module',
          devDependencies: {
            nitpicker: `file:${tarball}`,
            vitest: manifestText('devDependencies', 'vitest'),
            typescript: typeScript7,
          },
        }),
      );
      write(root, 'src/main/example.ts', cleanSource);
      write(root, 'src/main/cycle.ts', twiceSource('value * 2'));
      checked(root, 'npx', ['--yes', installer, 'install', '--no-audit', '--no-fund']);
      checked(root, 'git', ['add', '.']);
      checked(root, 'git', [
        '-c',
        'user.name=Installed Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-m',
        'clean baseline',
      ]);
      checked(root, 'git', ['switch', '-c', 'feature']);
      write(
        root,
        'src/main/example.ts',
        "import { twice } from './cycle.js';\n\nexport function example(): number {\n" +
          '  const unused = twice(1);\n  return "1";\n}\n',
      );
      write(
        root,
        'src/main/cycle.ts',
        `import { example } from './example.js';\n\n${twiceSource('value * example()')}`,
      );
      write(
        root,
        mergeFile,
        'export function merge(parts: readonly object[]): object {\n  let merged = {};\n' +
          '  for (const part of parts) {\n    merged = { ...merged, ...part };\n  }\n' +
          '  return merged;\n}\n',
      );
      nativeRun = gate('native');
      write(
        root,
        'nitpicker.config.json',
        '{ "tools": { "typescript": { "engine": "project" } } }\n',
      );
      projectRun = gate('project');
    }, 900_000);
    afterAll(() => {
      if (root) rmSync(root, { recursive: true, force: true });
    }, 120_000);

    it('type checks, lints and follows imports with no tool error', () => {
      expect(nativeRun?.status, nativeRun?.output).toBe(1);
      expect(fieldAt(report('native'), 'overallStatus')).toBe('completed');
      expect(added('native')).toEqual([
        'dependency-architecture/no-production-cycles',
        'eslint-lint/@typescript-eslint/no-unused-vars',
        'typescript-typecheck/TS2322',
      ]);
      expect(spreads('native')).toEqual([`${mergeFile}:2`]);
      expect(
        fieldAt(
          listOf(fieldAt(report('native'), 'tools')).find(
            (tool) => fieldAt(tool, 'name') === 'eslint-lint',
          ),
          'version',
        ),
      ).toBe(expectedEslintVersion(`js-api-${jsApi}`));
    });
    it('reports the same findings when it type checks with the project compiler', () => {
      expect(projectRun?.status, projectRun?.output).toBe(1);
      expect(fieldAt(report('project'), 'overallStatus')).toBe('completed');
      expect(added('project')).toEqual(added('native'));
      expect(spreads('project')).toEqual(spreads('native'));
    });
  });

  for (const strategy of layouts) {
    describe(`dependency layout: ${strategy ?? 'hoisted'}`, () => {
      let root: string;
      let before: string[];
      let clean: CommandResult | undefined;
      let dirty: CommandResult | undefined;
      let second: CommandResult | undefined;
      let subfolder: CommandResult | undefined;
      let snapshot: CommandResult | undefined;
      let fixed: CommandResult | undefined;
      let initialized: CommandResult | undefined;
      let rules: CommandResult | undefined;
      let explanation: CommandResult | undefined;
      let help: CommandResult | undefined;
      let packageLocation: string;
      let withoutTypeScript: CommandResult | undefined;
      const reports = (name: string) => path.join(root, 'reports', name);
      const lintArgs = (name: string) => [
        '--base',
        'main',
        '--analyzer',
        'prettier-format',
        '--analyzer',
        'eslint-lint',
        '--output',
        reports(name),
      ];
      const invoke = (args: readonly string[], cwd = root) =>
        command(cwd, 'npx', ['--no-install', 'nitpicker', ...args]);
      const summary = (name: string) => readJson(path.join(reports(name), 'summary.json'));
      const findings = (name: string) => readJson(path.join(reports(name), 'new-findings.json'));

      beforeAll(() => {
        root = mkdtempSync(path.join(tmpdir(), `nitpicker consumer-${strategy ?? 'hoisted'}-`));
        checked(root, 'git', ['init', '-b', 'main']);
        write(root, '.gitignore', 'node_modules/\nreports/\n');
        write(
          root,
          'package.json',
          JSON.stringify(
            {
              name: 'nitpicker-installed-consumer',
              private: true,
              type: 'module',
              devDependencies: {
                nitpicker: `file:${tarball}`,
                vitest: manifestText('devDependencies', 'vitest'),
                '@vitest/coverage-v8': manifestText('devDependencies', '@vitest/coverage-v8'),
                typescript: manifestText('devDependencies', 'typescript'),
              },
            },
            null,
            2,
          ) + '\n',
        );
        write(root, 'src/main/example.ts', cleanSource);
        write(root, 'test/example.test.ts', 'export const placeholder = true;\n');
        checked(root, 'npx', [
          '--yes',
          installer,
          'install',
          '--no-audit',
          '--no-fund',
          ...(strategy ? [`--install-strategy=${strategy}`] : []),
        ]);
        checked(root, 'git', ['add', '.']);
        checked(root, 'git', [
          '-c',
          'user.name=Installed Test',
          '-c',
          'user.email=test@example.invalid',
          'commit',
          '-m',
          'clean baseline',
        ]);
        checked(root, 'git', ['switch', '-c', 'feature']);
        packageLocation = path.join(root, 'node_modules/nitpicker');
        before = listing(packageLocation);
        write(root, 'src/main/example.ts', cleanSource.replace('return 1', 'return 2'));
        clean = invoke(lintArgs('clean'));
        write(root, 'src/main/example.ts', violation);
        dirty = invoke(lintArgs('dirty'));
        second = invoke(lintArgs('second'));
        subfolder = invoke(lintArgs('subfolder'), path.join(root, 'src'));
        snapshot = invoke([
          '--all',
          '--analyzer',
          'prettier-format',
          '--output',
          reports('snapshot'),
        ]);
        rules = invoke(['rules', '--preset', 'java']);
        explanation = invoke(['explain', ...explained]);
        help = invoke(['-h']);
        fixed = invoke([
          '--base',
          'main',
          '--fix',
          '--analyzer',
          'prettier-format',
          '--output',
          reports('fixed'),
        ]);
        const typeScriptLinks = [
          ...new Set([
            path.join(root, 'node_modules/typescript'),
            path.join(path.dirname(realpathSync(packageLocation)), 'typescript'),
          ]),
        ].filter((link) => lstatSync(link, { throwIfNoEntry: false }) !== undefined);
        for (const link of typeScriptLinks) renameSync(link, `${link}-aside`);
        withoutTypeScript = invoke(['--base', 'main', '--analyzer', 'eslint-lint']);
        for (const link of typeScriptLinks) renameSync(`${link}-aside`, link);
        initialized = invoke(['init', '--agents-md', '--ci', 'github']);
      }, 600_000);
      afterAll(() => {
        if (root) rmSync(root, { recursive: true, force: true });
      }, 120_000);

      it('installs a packed tarball with the requested dependency layout', () => {
        expect(realpathSync(packageLocation)).not.toBe(realpathSync(packageRoot));
        expect(existsSync(path.join(packageLocation, 'README.md'))).toBe(true);
        expect(existsSync(path.join(packageLocation, 'LICENSE'))).toBe(true);
        expect(readFileSync(path.join(packageLocation, 'LICENSE'), 'utf8')).toBe(
          readFileSync(path.join(packageRoot, 'LICENSE'), 'utf8'),
        );
        const installedManifest = readJson(path.join(packageLocation, 'package.json'));
        expect(fieldAt(installedManifest, 'license')).toBe('PolyForm-Noncommercial-1.0.0');
        expect(fieldAt(installedManifest, 'private')).toBeUndefined();
        expect(
          existsSync(path.join(packageLocation, 'languages/java/gradle/nitpicker.init.gradle')),
        ).toBe(true);
      });
      it.skipIf(strategy !== undefined)(
        'resolves the hoisted ESLint installation from the consumer',
        () => {
          const eslint = realpathSync(
            createRequire(path.join(root, 'package.json')).resolve('eslint/package.json'),
          );
          expect(eslint.startsWith(realpathSync(packageLocation) + path.sep)).toBe(false);
        },
      );
      it('exits zero on clean branch and reports both new findings on dirty branch', () => {
        expect(clean?.status, clean?.output).toBe(0);
        expect(dirty?.status, dirty?.output).toBe(1);
        expect(fieldAt(summary('dirty'), 'overallStatus')).toBe('completed');
        expect(findings('dirty')).toEqual(expectedDirtyFindings(links));
        expect(withoutSlowAnalyzerLines(dirty?.output ?? '')).toEqual(expectedDirtyOutput());
      });
      it('records pinned owned tool versions and the installed TypeScript peer', () => {
        const versions = Object.fromEntries(
          listOf(fieldAt(summary('dirty'), 'tools')).map((tool): [string, unknown] => [
            textOf(fieldAt(tool, 'name')),
            fieldAt(tool, 'version'),
          ]),
        );
        expect(versions['prettier-format']).toBe(manifestText('dependencies', 'prettier'));
        expect(versions['eslint-lint']).toBe(
          expectedEslintVersion(manifestText('devDependencies', 'typescript')),
        );
        const peers = ['typescript', 'vitest', '@vitest/coverage-v8'];
        const installedVersions = peers.map((peer) =>
          fieldAt(readJson(path.join(root, 'node_modules', peer, 'package.json')), 'version'),
        );
        expect(installedVersions).toEqual(
          peers.map((peer) => manifestText('devDependencies', peer)),
        );
      });
      it('stops in one line, before any analyzer, when typescript is missing from node_modules', () => {
        const peerCheck = `typescript is not installed in ${realpathSync(root)}. Run npm install (it is in package.json).`;
        const olderNode =
          'The typescript package nitpicker resolves has no JavaScript API (it is TypeScript 7 or later, ' +
          'or no typescript is installed), so nitpicker reads source files with its own TypeScript 6, ' +
          `which needs Node.js ${MINIMUM_NODE.join('.')} or newer; this is Node.js ${process.versions.node}.`;
        const reasons = supportsRedirect() ? [peerCheck] : [peerCheck, olderNode];
        const oneOfReasons: unknown = expect.toBeOneOf(
          reasons.map((reason) => `nitpicker failed: ${reason}\n`),
        );
        expect(withoutTypeScript).toEqual({
          status: 2,
          output: oneOfReasons,
        });
      });
      it('keeps the policy hash stable across two runs', () => {
        expect(second?.status, second?.output).toBe(1);
        expect(fieldAt(summary('dirty'), 'policyHash')).toBe(
          fieldAt(summary('second'), 'policyHash'),
        );
      });
      it('does not mutate the installed package or leave consumer temporary files/worktrees', () => {
        expect(listing(packageLocation)).toEqual(before);
        expect(temporaryFiles(root)).toEqual([]);
        expect(
          checked(root, 'git', ['worktree', 'list', '--porcelain']).match(/^worktree /gm),
        ).toHaveLength(1);
      });
      it('resolves the consumer root from a subfolder', () => {
        expect(subfolder?.status, subfolder?.output).toBe(1);
        expect(fieldAt(summary('subfolder'), 'overallStatus')).toBe('completed');
        expect(findings('subfolder')).toEqual(findings('dirty'));
      });
      it('supports --all with the packed prettier analyzer', () => {
        expect(snapshot?.status, snapshot?.output).toBe(1);
        expect(withoutSlowAnalyzerLines(snapshot?.output ?? '')).toEqual(expectedSnapshotOutput());
      });
      it('lists and explains rules from the reference data the package ships, linking the release tag', async () => {
        expect(rules?.status, rules?.output).toBe(0);
        expect(rules?.output).toBe(await checkoutOutput(links, ['rules', '--preset', 'java']));
        expect(explanation?.status, explanation?.output).toBe(0);
        expect(explanation?.output).toBe(await checkoutOutput(links, ['explain', ...explained]));
        expect(
          listOf(readJson(path.join(reports('snapshot'), 'findings.json'))).map((finding) =>
            fieldAt(finding, 'helpUri'),
          ),
        ).toEqual([
          installedHelpUri(links, 'prettier-format/prettier/prettier'),
          installedHelpUri(links, 'prettier-format/prettier/prettier'),
        ]);
      });
      it('prints help that links the usage page at its own release tag', () => {
        expect(help?.status, help?.output).toBe(0);
        expect(help?.output).toBe(installedHelpText(links, root));
      });
      it('sets the consumer up with init from the packed files', () => {
        expect(initialized?.status, initialized?.output).toBe(0);
        expect(readFileSync(path.join(root, 'nitpicker.config.json'), 'utf8')).toBe(
          '{ "preset": "typescript" }\n',
        );
        expect(readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe(
          `${readSnippet(packageLocation)}\n`,
        );
        expect(existsSync(path.join(root, '.github/workflows/nitpicker.yml'))).toBe(true);
      });
      it('fixes the consumer Prettier violation with --fix', () => {
        expect(fixed?.status, fixed?.output).toBe(0);
        expect(readFileSync(path.join(root, 'src/main/example.ts'), 'utf8')).toBe(
          'export function example() {\n  debugger;\n  return 1;\n}\n',
        );
      });
    });
  }
});
