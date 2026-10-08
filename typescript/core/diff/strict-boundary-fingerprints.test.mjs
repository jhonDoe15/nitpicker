import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeArchitectureViolations } from '../../adapters/diff/static-checks-runner.mjs';
import { compareFindings } from './compare.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const dependencyCruiser = path.join(
  packageRoot,
  'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
);
const strictConfig = path.join(
  packageRoot,
  'preset/architecture/fixtures/dependency-cruiser.strict.fixture.config.mjs',
);
const fixturesRoot = path.join(packageRoot, 'preset/architecture/fixtures/strict');
const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const strictBoundaryFixtures = [
  ['internal-import-from-feature', 'features-do-not-import-other-feature-internals'],
  ['internal-import-from-shared', 'feature-internals-only-through-index'],
  ['shared-imports-feature', 'shared-does-not-import-features'],
  ['feature-imports-composition-root', 'features-do-not-import-composition-root'],
  ['domain-imports-adapters', 'domain-does-not-import-adapters'],
  ['domain-imports-node-io', 'domain-does-not-import-node-io'],
  ['domain-imports-client', 'domain-does-not-import-network-or-database-clients'],
  ['domain-imports-logger', 'domain-does-not-import-the-logger'],
  ['domain-imports-state', 'domain-does-not-import-module-state'],
  ['import-cycle', 'no-production-cycles'],
];

// index.ts and composition-root.ts are not moved: their file name is what makes them a public entry
// point or the composition root, so moving them legitimately changes which rule applies.
const movableFixtures = strictBoundaryFixtures
  .map(([name, rule]) => [
    name,
    rule,
    sourceFiles(path.join(fixturesRoot, name)).filter(
      (file) => !/\/(index|composition-root)\.ts$/.test(file),
    ),
  ])
  .filter(([, , files]) => files.length > 0);

function copyFixture(name) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-strict-boundary-'));
  temporaryRoots.push(root);
  cpSync(path.join(fixturesRoot, name), root, { recursive: true });
  return root;
}

function sourceFiles(root, directory = 'src') {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(root, relative) : [relative];
  });
}

function violationsIn(root) {
  const result = spawnSync(
    process.execPath,
    [dependencyCruiser, 'src', '--config', strictConfig, '--output-type', 'json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  return normalizeArchitectureViolations(JSON.parse(result.stdout), 'architecture-strict');
}

const relativeSpecifier = /(from\s+)(['"])(\.{1,2}\/[^'"]+)\2/g;

function resolveSpecifier(file, specifier) {
  return path.posix.join(path.posix.dirname(file), specifier.replace(/\.js$/, '.ts'));
}

function toSpecifier(fromFile, targetFile) {
  const relative = path.posix.relative(path.posix.dirname(fromFile), targetFile);
  return (relative.startsWith('.') ? relative : `./${relative}`).replace(/\.ts$/, '.js');
}

// Moves the file into a `moved/` subdirectory of its directory (keeping its name, so name-based
// rules such as logger or state files still apply) and rewrites every relative import to match.
function moveFile(root, relativePath) {
  const movedPath = `${path.posix.dirname(relativePath)}/moved/${path.posix.basename(relativePath)}`;
  const files = sourceFiles(root);
  const imports = files.map((file) => ({
    file,
    text: readFileSync(path.join(root, file), 'utf8'),
  }));
  const newLocation = (file) => (file === relativePath ? movedPath : file);
  for (const { file, text } of imports) {
    const rewritten = text.replace(relativeSpecifier, (_match, keyword, quote, specifier) => {
      const target = resolveSpecifier(file, specifier);
      return `${keyword}${quote}${toSpecifier(newLocation(file), newLocation(target))}${quote}`;
    });
    const destination = path.join(root, newLocation(file));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, rewritten);
  }
  rmSync(path.join(root, relativePath));
  return movedPath;
}

describe('strict dependency-cruiser findings keep their fingerprint', () => {
  it.each(strictBoundaryFixtures)('%s: across inserted lines', (name, rule) => {
    const root = copyFixture(name);
    const base = violationsIn(root);
    expect(base.map((finding) => finding.rule)).toContain(rule);

    for (const file of sourceFiles(root)) {
      const absolute = path.join(root, file);
      writeFileSync(
        absolute,
        `export const unrelatedValue = 1;\n\n\n${readFileSync(absolute, 'utf8')}`,
      );
    }
    const head = violationsIn(root);

    const comparison = compareFindings({ baseFindings: base, headFindings: head });
    expect(comparison.newFindings).toEqual([]);
    expect(comparison.resolvedFindings).toEqual([]);
    expect(comparison.unchangedFindings).toHaveLength(base.length);
  });

  describe.each(movableFixtures)('%s', (name, rule, files) => {
    it.each(files)('stays baselined when %s is moved to another directory', (file) => {
      const root = copyFixture(name);
      const base = violationsIn(root);
      expect(base.map((finding) => finding.rule)).toContain(rule);

      const renamedPath = moveFile(root, file);
      const head = violationsIn(root);

      const comparison = compareFindings({
        baseFindings: base,
        headFindings: head,
        baseToHeadRenames: new Map([[file, renamedPath]]),
      });
      expect(comparison.newFindings).toEqual([]);
      expect(comparison.resolvedFindings).toEqual([]);
      expect(comparison.unchangedFindings).toHaveLength(base.length);
    });
  });
});
