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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeArchitectureViolations } from '../../languages/typescript/adapters/static-checks-runner.mjs';
import { cruiseStrict } from '../../languages/typescript/preset/architecture/fixtures/strict-cruise.mjs';
import { compareFindings } from './compare.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const fixturesRoot = path.join(
  packageRoot,
  'languages/typescript/preset/architecture/fixtures/strict',
);
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

function sourceFiles(root, directory = 'src') {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(root, relative) : [relative];
  });
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

function insertLinesAtTop(root) {
  for (const file of sourceFiles(root)) {
    const absolute = path.join(root, file);
    writeFileSync(
      absolute,
      `export const unrelatedValue = 1;\n\n\n${readFileSync(absolute, 'utf8')}`,
    );
  }
}

// Every scenario (a pristine fixture, a fixture with lines inserted, a fixture with one file moved) is
// written to its own directory under one workspace, and dependency-cruiser runs once over all of them.
// Its rules match paths by pattern, so each scenario's findings are the same as a run on that scenario
// alone. The violations are split back per directory and their paths made relative to it again.
let scenarioRuns;
function scenarioFindings() {
  scenarioRuns ??= runScenarios();
  return scenarioRuns;
}

function relocatedViolation(violation, prefix) {
  const strip = (value) => (value.startsWith(prefix) ? value.slice(prefix.length) : value);
  return {
    ...violation,
    from: strip(violation.from),
    to: strip(violation.to),
    ...(violation.cycle && {
      cycle: violation.cycle.map((item) => ({ ...item, name: strip(item.name) })),
    }),
  };
}

async function runScenarios() {
  const workspace = mkdtempSync(path.join(tmpdir(), 'nitpicker-strict-boundary-'));
  temporaryRoots.push(workspace);
  const scenarios = [];
  const addScenario = (kind, name, file, mutate) => {
    const dir = `scenario-${String(scenarios.length)}`;
    cpSync(path.join(fixturesRoot, name), path.join(workspace, dir), { recursive: true });
    const renamedPath = mutate?.(path.join(workspace, dir));
    scenarios.push({ kind, name, file, dir, renamedPath });
  };
  for (const [name] of strictBoundaryFixtures) addScenario('baseline', name);
  for (const [name] of strictBoundaryFixtures)
    addScenario('insertedLines', name, undefined, insertLinesAtTop);
  for (const [name, , files] of movableFixtures) {
    for (const file of files) addScenario('moved', name, file, (root) => moveFile(root, file));
  }

  const report = await cruiseStrict({
    baseDir: workspace,
    paths: scenarios.map(({ dir }) => `${dir}/src`),
    outputType: 'json',
  });
  const violations = JSON.parse(report.output).summary.violations;

  const runs = { baseline: new Map(), insertedLines: new Map(), moved: new Map() };
  for (const scenario of scenarios) {
    const prefix = `${scenario.dir}/`;
    const own = violations
      .filter((violation) => violation.from.startsWith(prefix))
      .map((violation) => relocatedViolation(violation, prefix));
    const findings = normalizeArchitectureViolations(
      { summary: { violations: own } },
      'architecture-strict',
    );
    if (scenario.kind === 'moved') {
      runs.moved.set(`${scenario.name}\0${scenario.file}`, {
        findings,
        renamedPath: scenario.renamedPath,
      });
    } else {
      runs[scenario.kind].set(scenario.name, findings);
    }
  }
  return runs;
}

describe('strict dependency-cruiser findings keep their fingerprint', () => {
  // One dependency-cruiser run over every scenario, shared by all tests below. It is file setup, so it
  // is not charged to the first test that happens to read it.
  beforeAll(() => scenarioFindings());

  it.each(strictBoundaryFixtures)('%s: across inserted lines', async (name, rule) => {
    const { baseline, insertedLines } = await scenarioFindings();
    const base = baseline.get(name);
    expect(base.map((finding) => finding.rule)).toContain(rule);

    const head = insertedLines.get(name);
    const comparison = compareFindings({ baseFindings: base, headFindings: head });
    expect(comparison.newFindings).toEqual([]);
    expect(comparison.resolvedFindings).toEqual([]);
    expect(comparison.unchangedFindings).toHaveLength(base.length);
  });

  describe.each(movableFixtures)('%s', (name, rule, files) => {
    it.each(files)('stays baselined when %s is moved to another directory', async (file) => {
      const { baseline, moved } = await scenarioFindings();
      const base = baseline.get(name);
      expect(base.map((finding) => finding.rule)).toContain(rule);

      const { renamedPath, findings: head } = moved.get(`${name}\0${file}`);

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
