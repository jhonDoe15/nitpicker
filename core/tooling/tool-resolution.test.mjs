import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { PACKAGE_ROOT, resolveProjectRoot, resolveTool } from './tool-resolution.mjs';
import {
  applyLegacyInventory,
  configuredAnalyzers,
} from '../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { runQualitySnapshot } from '../snapshot/run-snapshot.mjs';
import { execFileSync } from 'node:child_process';

const temporaryRoots = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('resolves installed tool versions and binaries outside snapshots', () => {
  const tool = resolveTool('eslint', { bin: 'bin/eslint.js' });
  expect(tool.version).toBe('10.9.1');
  expect(tool.binPath.startsWith(tool.root + path.sep)).toBe(true);
  const prettier = resolveTool('prettier', { bin: 'bin/prettier.cjs' });
  expect(prettier.binPath.startsWith(prettier.root + path.sep)).toBe(true);
  expect(resolveTool('vitest', { projectRoot: PACKAGE_ROOT }).version).toBe('4.1.11');
});

it('records the TypeScript version imported by structure instead of the consumer version', () => {
  const liveProjectRoot = createTemporaryRoot('nitpicker-live-typescript-');
  const consumerTypeScriptVersion = '5.0.0-consumer';
  writeFileSync(path.join(liveProjectRoot, 'package.json'), '{"name":"consumer"}');
  writeManifest(path.join(liveProjectRoot, 'node_modules/typescript'), {
    name: 'typescript',
    version: consumerTypeScriptVersion,
  });
  const structureModule = path.join(
    PACKAGE_ROOT,
    'languages/typescript/preset/structure/analyze.mjs',
  );
  const structureRequire = createRequire(structureModule);
  const importedTypeScriptVersion = JSON.parse(
    readFileSync(structureRequire.resolve('typescript/package.json'), 'utf8'),
  ).version;
  const structure = configuredAnalyzers.find(({ name }) => name === 'structure');
  const typecheck = configuredAnalyzers.find(({ name }) => name === 'typescript-typecheck');
  const report = runQualitySnapshot({
    analyzers: [
      {
        ...structure,
        createInvocation: () => ({
          command: process.execPath,
          args: ['-e', 'process.stdout.write(JSON.stringify({ findings: [] }))'],
          cwd: PACKAGE_ROOT,
        }),
      },
    ],
    projectRoot: liveProjectRoot,
    policyRoot: PACKAGE_ROOT,
    toolRoot: PACKAGE_ROOT,
    liveProjectRoot,
  });

  expect(typecheck.resolveVersion(liveProjectRoot)).toBe(consumerTypeScriptVersion);
  expect(report.summary.tools[0].version).toBe(importedTypeScriptVersion);
});

it('rejects tools resolved from a generated snapshot', () => {
  const snapshotRoot = createSnapshotRoot();
  writeManifest(path.join(snapshotRoot, 'node_modules/vitest'), {
    name: 'vitest',
    version: '4.1.11',
  });

  expect(() => resolveTool('vitest', { projectRoot: snapshotRoot })).toThrow(
    'must not resolve from an analyzed snapshot',
  );
});

it('rejects an owned tool whose installed version differs from its exact declaration', () => {
  const packageRoot = createOwnedToolPackage({
    declaredVersion: '1.2.3',
    installedVersion: '1.2.4',
  });

  expect(() => resolveTool('owned-tool', { packageRoot })).toThrow(
    'version 1.2.4 does not match declared 1.2.3',
  );
});

it('rejects a tool binary symlink that escapes its package', () => {
  const packageRoot = createOwnedToolPackage({
    declaredVersion: '1.2.3',
    installedVersion: '1.2.3',
  });
  const outsideRoot = createTemporaryRoot('nitpicker-outside-bin-');
  const outsideBin = path.join(outsideRoot, 'tool.js');
  writeFileSync(outsideBin, 'process.exit(0);');
  const binPath = path.join(packageRoot, 'node_modules/owned-tool/bin/tool.js');
  rmSync(binPath);
  symlinkSync(outsideBin, binPath);

  expect(() => resolveTool('owned-tool', { packageRoot, bin: 'bin/tool.js' })).toThrow(
    'binary must stay inside its package',
  );
});

it('rejects a snapshot tool symlink that points outside the temporary root', () => {
  const snapshotRoot = createSnapshotRoot();
  mkdirSync(path.join(snapshotRoot, 'node_modules'), { recursive: true });
  symlinkSync(
    path.join(PACKAGE_ROOT, 'node_modules/vitest'),
    path.join(snapshotRoot, 'node_modules/vitest'),
    'dir',
  );

  expect(() => resolveTool('vitest', { projectRoot: snapshotRoot })).toThrow(
    'must not resolve from an analyzed snapshot',
  );
});

it('includes a project-owned coding inventory in the selected policy hash', () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-inventory-')));
  temporaryRoots.push(root);
  const analyzer = configuredAnalyzers.find(({ name }) => name === 'coding-standards');
  const resolveHash = /** @type {{ resolveConfigurationHash: (root: string) => string }} */ (
    analyzer
  ).resolveConfigurationHash;
  const original = resolveHash(root);
  writeFileSync(path.join(root, 'nitpicker.legacy.json'), '{"sites":[]}');
  expect(resolveHash(root)).not.toBe(original);
});

it('reads the legacy inventory from the configured path and ignores the old internal one', () => {
  const root = createTemporaryRoot('nitpicker-inventory-path-');
  const [analyzer] = applyLegacyInventory(
    configuredAnalyzers.filter(({ name }) => name === 'coding-standards'),
    'config/legacy.json',
  );
  const original = analyzer.resolveConfigurationHash(root);
  mkdirSync(path.join(root, 'languages/typescript/preset/coding-standards'), { recursive: true });
  writeFileSync(
    path.join(root, 'languages/typescript/preset/coding-standards/legacy-sites.json'),
    '{"sites":[]}',
  );
  writeFileSync(path.join(root, 'nitpicker.legacy.json'), '{"sites":[]}');
  expect(analyzer.resolveConfigurationHash(root)).toBe(original);
  mkdirSync(path.join(root, 'config'));
  writeFileSync(path.join(root, 'config/legacy.json'), '{"sites":[]}');
  expect(analyzer.resolveConfigurationHash(root)).not.toBe(original);
  const invocation = analyzer.createInvocation({
    projectRoot: root,
    policyRoot: root,
    toolRoot: root,
    snapshot: 'head',
  });
  expect(invocation.args.slice(-2)).toEqual(['--legacy-inventory', 'config/legacy.json']);
});

function createTemporaryRoot(prefix) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  temporaryRoots.push(root);
  return root;
}

function createSnapshotRoot() {
  const root = path.join(createTemporaryRoot('nitpicker-diff-tool-'), 'base');
  mkdirSync(root);
  return root;
}

function createOwnedToolPackage({ declaredVersion, installedVersion }) {
  const packageRoot = createTemporaryRoot('nitpicker-tool-package-');
  writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({
      name: 'nitpicker-fixture',
      dependencies: { 'owned-tool': declaredVersion },
    }),
  );
  const toolRoot = path.join(packageRoot, 'node_modules/owned-tool');
  writeManifest(path.join(toolRoot), {
    name: 'owned-tool',
    version: installedVersion,
  });
  mkdirSync(path.join(toolRoot, 'bin'), { recursive: true });
  writeFileSync(path.join(toolRoot, 'bin/tool.js'), 'process.exit(0);');
  return packageRoot;
}

function writeManifest(packageRoot, manifest) {
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify(manifest));
}

it('finds the nearest package bounded by the git repository', () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-project-')));
  temporaryRoots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(path.join(root, 'package.json'), '{}');
  mkdirSync(path.join(root, 'packages/leaf'), { recursive: true });
  writeFileSync(path.join(root, 'packages/package.json'), '{}');
  expect(resolveProjectRoot(path.join(root, 'packages/leaf'))).toBe(path.join(root, 'packages'));
  mkdirSync(path.join(root, 'app/src'), { recursive: true });
  writeFileSync(path.join(root, 'app/nitpicker.config.json'), '{}');
  expect(resolveProjectRoot(path.join(root, 'app/src'))).toBe(path.join(root, 'app'));
  const emptyRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-empty-project-')));
  temporaryRoots.push(emptyRoot);
  execFileSync('git', ['init', '-q'], { cwd: emptyRoot });
  expect(() => resolveProjectRoot(emptyRoot)).toThrow(
    'No package.json or nitpicker.config.json found',
  );
});
