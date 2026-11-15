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
import { normalizeArchitectureViolations } from '../../../../languages/typescript/adapters/static-checks-runner.mts';
import { cruiseStrict as cruiseStrictJs } from '../../../../languages/typescript/preset/architecture/test-support/strict-cruise.mts';
import { compareFindings } from '../../comparison/test-support/typed-compare.mts';
import type { Finding } from '../../../../shared/values/findings.mts';
import { fieldAt } from '../../../../scripts/json/fields.mts';
import { fieldOf, listOf, parseJson, textOf } from '../../../../shared/values/readers.mts';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)), '../..');
const fixturesRoot = path.join(
  packageRoot,
  'languages/typescript/preset/architecture/fixtures/strict',
);
type Violation = {
  readonly from: string;
  readonly to: string;
  readonly cycle?: readonly { readonly name: string }[];
  readonly [field: string]: unknown;
};
type Fixture = readonly [string, string, readonly string[]];
type MovedRun = { readonly findings: Finding[]; readonly renamedPath: string };
type Runs = {
  readonly baseline: Map<string, Finding[]>;
  readonly insertedLines: Map<string, Finding[]>;
  readonly moved: Map<string, MovedRun>;
};
type Scenario = {
  readonly kind: 'baseline' | 'insertedLines' | 'moved';
  readonly name: string;
  readonly file: string | undefined;
  readonly dir: string;
  readonly renamedPath: unknown;
};

const cruiseStrict: (request: {
  readonly baseDir: string;
  readonly paths: readonly string[];
  readonly outputType: string;
}) => Promise<{ readonly output: unknown }> = cruiseStrictJs;
const temporaryRoots: string[] = [];

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

const movableFixtures: Fixture[] = strictBoundaryFixtures
  .map(([name = '', rule = '']): Fixture => [
    name,
    rule,
    sourceFiles(path.join(fixturesRoot, name)).filter(
      (file) => !/\/(index|composition-root)\.ts$/.test(file),
    ),
  ])
  .filter(([, , files]) => files.length > 0);

function sourceFiles(root: string, directory = 'src'): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(root, relative) : [relative];
  });
}

const relativeSpecifier = /(from\s+)(['"])(\.{1,2}\/[^'"]+)\2/g;

function resolveSpecifier(file: string, specifier: string) {
  return path.posix.join(path.posix.dirname(file), specifier.replace(/\.js$/, '.ts'));
}

function toSpecifier(fromFile: string, targetFile: string) {
  const relative = path.posix.relative(path.posix.dirname(fromFile), targetFile);
  return (relative.startsWith('.') ? relative : `./${relative}`).replace(/\.ts$/, '.js');
}

function moveFile(root: string, relativePath: string) {
  const movedPath = `${path.posix.dirname(relativePath)}/moved/${path.posix.basename(relativePath)}`;
  const files = sourceFiles(root);
  const imports = files.map((file) => ({
    file,
    text: readFileSync(path.join(root, file), 'utf8'),
  }));
  const newLocation = (file: string) => (file === relativePath ? movedPath : file);
  for (const { file, text } of imports) {
    const rewritten = text.replace(
      relativeSpecifier,
      (_match: string, keyword: string, quote: string, specifier: string) => {
        const target = resolveSpecifier(file, specifier);
        return `${keyword}${quote}${toSpecifier(newLocation(file), newLocation(target))}${quote}`;
      },
    );
    const destination = path.join(root, newLocation(file));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, rewritten);
  }
  rmSync(path.join(root, relativePath));
  return movedPath;
}

function insertLinesAtTop(root: string) {
  for (const file of sourceFiles(root)) {
    const absolute = path.join(root, file);
    writeFileSync(
      absolute,
      `export const unrelatedValue = 1;\n\n\n${readFileSync(absolute, 'utf8')}`,
    );
  }
}

let scenarioRuns: Runs;
function scenarioFindings(): Runs {
  return scenarioRuns;
}

function isViolation(value: unknown): value is Violation {
  return typeof fieldOf(value, 'from') === 'string' && typeof fieldOf(value, 'to') === 'string';
}

function relocatedViolation(violation: Violation, prefix: string): Violation {
  const strip = (value: string) => (value.startsWith(prefix) ? value.slice(prefix.length) : value);
  return {
    ...violation,
    from: strip(violation.from),
    to: strip(violation.to),
    ...(violation.cycle && {
      cycle: violation.cycle.map((item) => ({ ...item, name: strip(item.name) })),
    }),
  };
}

async function runScenarios(): Promise<Runs> {
  const workspace = mkdtempSync(path.join(tmpdir(), 'nitpicker-strict-boundary-'));
  temporaryRoots.push(workspace);
  const scenarios: Scenario[] = [];
  const addScenario = (
    kind: Scenario['kind'],
    name: string,
    file?: string,
    mutate?: (root: string) => unknown,
  ) => {
    const dir = `scenario-${String(scenarios.length)}`;
    cpSync(path.join(fixturesRoot, name), path.join(workspace, dir), { recursive: true });
    const renamedPath = mutate?.(path.join(workspace, dir));
    scenarios.push({ kind, name, file, dir, renamedPath });
  };
  for (const [name = ''] of strictBoundaryFixtures) addScenario('baseline', name);
  for (const [name = ''] of strictBoundaryFixtures)
    addScenario('insertedLines', name, undefined, insertLinesAtTop);
  for (const [name, , files] of movableFixtures) {
    for (const file of files) addScenario('moved', name, file, (root) => moveFile(root, file));
  }

  const report = await cruiseStrict({
    baseDir: workspace,
    paths: scenarios.map(({ dir }) => `${dir}/src`),
    outputType: 'json',
  });
  const violations = listOf(
    fieldAt(parseJson(textOf(report.output)), 'summary', 'violations'),
  ).filter(isViolation);

  const runs: Runs = { baseline: new Map(), insertedLines: new Map(), moved: new Map() };
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
      runs.moved.set(`${scenario.name}\0${textOf(scenario.file)}`, {
        findings,
        renamedPath: textOf(scenario.renamedPath),
      });
    } else {
      runs[scenario.kind].set(scenario.name, findings);
    }
  }
  return runs;
}

describe('strict dependency-cruiser findings keep their fingerprint', () => {
  beforeAll(async () => {
    scenarioRuns = await runScenarios();
  });

  it.each(strictBoundaryFixtures)('%s: across inserted lines', (name, rule) => {
    const { baseline, insertedLines } = scenarioFindings();
    const base = baseline.get(name) ?? [];
    expect(base.map((finding) => finding.rule)).toContain(rule);

    const head = insertedLines.get(name) ?? [];
    const comparison = compareFindings({ baseFindings: base, headFindings: head });
    expect(comparison.newFindings).toEqual([]);
    expect(comparison.resolvedFindings).toEqual([]);
    expect(comparison.unchangedFindings).toHaveLength(base.length);
  });

  describe.each(movableFixtures)('%s', (name, rule, files) => {
    it.each(files)('stays baselined when %s is moved to another directory', (file) => {
      const { baseline, moved } = scenarioFindings();
      const base = baseline.get(name) ?? [];
      expect(base.map((finding) => finding.rule)).toContain(rule);

      const { renamedPath, findings: head } = moved.get(`${name}\0${file}`) ?? {
        renamedPath: file,
        findings: [],
      };

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
