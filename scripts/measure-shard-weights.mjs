#!/usr/bin/env node
// Measures per-analyzer wall time on a consumer project so `shardWeight` in
// languages/typescript/preset/quality-checks.mjs can be re-derived from data. See docs/shard-weights.md.
//
//   node scripts/measure-shard-weights.mjs --fixture self|consumer|generated [--runs 3] [--json out.json] [--keep dir]
//   node scripts/measure-shard-weights.mjs --blend self.json consumer.json generated.json
//   node scripts/measure-shard-weights.mjs --project <git root on a feature branch> [--base main]
//
// Every analyzer is run alone (serially) with `nitpicker --base <ref> --analyzer <name>`, so the
// number is the whole differential cost (base + head). Analyzers with dependencies pull them in,
// so a dependent's own cost is its time minus its dependencies' times.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = path.resolve(import.meta.dirname, '..');
const WEIGHT_SCALE = 100;
const WEIGHT_TOTAL = 200;
const GENERATED_MODULES = 40;
// Tests that read this package's own manifest, binaries or fixtures cannot pass once the sources
// are relocated into a consumer, and a red test run would stop `coverage` from reporting.
const excludedFromSelfFixture = new RegExp(
  [
    '/node_modules(/|$)',
    '/fixtures(/|$)',
    '/(?:cli|installed|pack-contents|tool-resolution|aggregate-shards|run-snapshot|analyzer-scheduler|check)\\.test\\.mjs$',
    '/(?:coding-standards-inventory|defaults-in-place|architecture-rules)\\.test\\.mjs$',
    '-policy\\.test\\.mjs$',
  ].join('|'),
);

export function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Own cost = measured time minus the (transitive) dependencies' times, floored at zero.
export function ownCosts(analyzers, secondsByName) {
  const byName = new Map(analyzers.map((analyzer) => [analyzer.name, analyzer]));
  const closure = (name, seen = new Set()) => {
    for (const dependency of byName.get(name).dependencies ?? []) {
      if (!seen.has(dependency)) {
        seen.add(dependency);
        closure(dependency, seen);
      }
    }
    return seen;
  };
  return Object.fromEntries(
    analyzers.map(({ name }) => {
      const dependencySeconds = [...closure(name)].reduce(
        (sum, dependency) => sum + secondsByName[dependency],
        0,
      );
      return [name, Math.max(0, secondsByName[name] - dependencySeconds)];
    }),
  );
}

// Integer weights proportional to cost; the heaviest analyzer is WEIGHT_SCALE, minimum 1.
export function weightsFromSeconds(costs) {
  const heaviest = Math.max(...Object.values(costs));
  return Object.fromEntries(
    Object.entries(costs).map(([name, seconds]) => [
      name,
      Math.max(1, Math.round((seconds / heaviest) * WEIGHT_SCALE)),
    ]),
  );
}

// Blends several fixtures: each analyzer's weight is its mean share of a fixture's total own cost
// (over the fixtures where it ran), scaled so the weights sum to about WEIGHT_TOTAL. Shares, not
// seconds, because a 4-file consumer and a 160-file package differ by an order of magnitude.
export function blendReports(reports) {
  const shares = {};
  for (const { costs } of reports) {
    const total = Object.values(costs).reduce((sum, seconds) => sum + seconds, 0);
    for (const [name, seconds] of Object.entries(costs)) {
      (shares[name] ??= []).push(seconds / total);
    }
  }
  return Object.fromEntries(
    Object.entries(shares).map(([name, values]) => [
      name,
      Math.max(
        1,
        Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * WEIGHT_TOTAL),
      ),
    ]),
  );
}

function run(cwd, executable, args) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 900_000,
  });
  if (result.error) throw result.error;
  return result;
}

function checked(cwd, executable, args) {
  const result = run(cwd, executable, args);
  if (result.status !== 0) {
    throw new Error(`${executable} ${args.join(' ')} failed\n${result.stdout}${result.stderr}`);
  }
  return result.stdout.trim();
}

function write(root, relative, contents) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function generatedModule(index) {
  return `export type Grade${index} = 'low' | 'mid' | 'high';

export function grade${index}(value: number): Grade${index} {
  if (value < ${index + 10}) {
    return 'low';
  }
  if (value < ${index + 100}) {
    return 'mid';
  }
  return 'high';
}

export function clamp${index}(value: number, minimum: number, maximum: number): number {
  if (minimum > maximum) {
    throw new RangeError('minimum exceeds maximum');
  }
  return Math.min(Math.max(value, minimum), maximum);
}

export function summarize${index}(values: readonly number[]): { total: number; grades: Grade${index}[] } {
  let total = 0;
  const grades: Grade${index}[] = [];
  for (const value of values) {
    if (Number.isNaN(value)) {
      continue;
    }
    total += clamp${index}(value, 0, ${index + 1000});
    grades.push(grade${index}(value));
  }
  return { total, grades };
}
`;
}

function generatedTest(index) {
  return `import { describe, expect, it } from 'vitest';
import { clamp${index}, grade${index}, summarize${index} } from './rules.js';

describe('feature ${index}', () => {
  it('grades values', () => {
    expect(grade${index}(0)).toBe('low');
    expect(grade${index}(${index + 50})).toBe('mid');
    expect(grade${index}(${index + 500})).toBe('high');
  });
  it('clamps and validates bounds', () => {
    expect(clamp${index}(5, 0, 3)).toBe(3);
    expect(clamp${index}(-5, 0, 3)).toBe(0);
    expect(() => clamp${index}(1, 3, 0)).toThrow(RangeError);
  });
  it('summarizes while skipping NaN', () => {
    expect(summarize${index}([1, Number.NaN, ${index + 200}])).toEqual({
      total: ${index + 201},
      grades: ['low', 'high'],
    });
  });
});
`;
}

// The default vitest project only collects `*.test.ts`, so the `.mjs` sources are renamed to `.ts`
// (specifiers rewritten to match) to give the fixture a TypeScript test suite to run.
function convertToTypeScript(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
    const file = path.join(entry.parentPath, entry.name);
    const converted = readFileSync(file, 'utf8').replace(/\.mjs(['"`])/g, '.ts$1');
    writeFileSync(file, converted);
    renameSync(file, file.replace(/\.mjs$/, '.ts'));
  }
}

export function buildFixture(kind, root) {
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  mkdirSync(root, { recursive: true });
  const tarballRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-weights-pack-'));
  checked(packageRoot, 'npm', ['pack', '--pack-destination', tarballRoot]);
  const tarball = path.join(tarballRoot, `nitpicker-${manifest.version}.tgz`);
  checked(root, 'git', ['init', '-b', 'main']);
  write(root, '.gitignore', 'node_modules/\nreports/\n');
  write(
    root,
    'package.json',
    JSON.stringify(
      {
        name: `nitpicker-weights-${kind}`,
        private: true,
        type: 'module',
        devDependencies: {
          nitpicker: `file:${tarball}`,
          vitest: manifest.devDependencies.vitest,
          '@vitest/coverage-v8': manifest.devDependencies['@vitest/coverage-v8'],
          typescript: manifest.devDependencies.typescript,
          '@types/node': manifest.devDependencies['@types/node'],
        },
      },
      null,
      2,
    ) + '\n',
  );
  let edited;
  if (kind === 'consumer') {
    // The same minimal consumer the installed-consumer test uses.
    write(root, 'src/main/example.ts', 'export function example() {\n  return 1;\n}\n');
    // Unlike the installed-consumer test's placeholder, this has a real test: with no tests the
    // coverage, crap and mutation analyzers fail fast and their cost cannot be measured.
    write(
      root,
      'test/example.test.ts',
      "import { expect, it } from 'vitest';\nimport { example } from '../src/main/example.js';\n\nit('returns one', () => {\n  expect(example()).toBe(1);\n});\n",
    );
    edited = ['src/main/example.ts'];
  } else if (kind === 'generated') {
    // A type-clean TypeScript project with real branching logic and tests, big enough for
    // mutation testing to take measurable time (the relocated `self` sources do not type-check).
    for (let index = 0; index < GENERATED_MODULES; index += 1) {
      write(root, `src/main/feature${index}/rules.ts`, generatedModule(index));
      write(root, `src/main/feature${index}/rules.test.ts`, generatedTest(index));
    }
    edited = ['src/main/feature0/rules.ts', 'src/main/feature1/rules.ts'];
  } else {
    // This package's own sources, laid out as a consumer's src/ tree (tests stay co-located).
    for (const directory of ['core', 'shared', 'languages']) {
      cpSync(path.join(packageRoot, directory), path.join(root, 'src/main/nitpicker', directory), {
        recursive: true,
        filter: (source) => !excludedFromSelfFixture.test(source),
      });
    }
    convertToTypeScript(path.join(root, 'src/main/nitpicker'));
    edited = [
      'src/main/nitpicker/core/diff/sharding.ts',
      'src/main/nitpicker/languages/typescript/preset/layout.ts',
      'src/main/nitpicker/core/tooling/policy-links.ts',
    ];
  }
  checked(root, 'npx', [
    '--yes',
    'npm@11',
    'install',
    '--no-audit',
    '--no-fund',
    '--prefer-offline',
  ]);
  checked(root, 'git', ['add', '.']);
  const identity = ['-c', 'user.name=Weights', '-c', 'user.email=weights@example.invalid'];
  checked(root, 'git', [...identity, 'commit', '-m', 'baseline']);
  checked(root, 'git', ['switch', '-c', 'feature']);
  edited.forEach((file, index) => {
    const current = readFileSync(path.join(root, file), 'utf8');
    write(root, file, `${current}\nexport const measuredChange${index} = ${index};\n`);
  });
  rmSync(tarballRoot, { recursive: true, force: true });
}

export function measureProject(analyzers, project, { base = 'main', runs = 3 } = {}) {
  const secondsByName = {};
  const samples = {};
  const failures = new Set();
  for (const { name } of analyzers) {
    samples[name] = [];
    for (let attempt = 0; attempt < runs; attempt += 1) {
      const output = mkdtempSync(path.join(tmpdir(), 'nitpicker-weights-out-'));
      const started = process.hrtime.bigint();
      // Exit 1 means "new findings", which is fine here; 2 means a tool error (timing kept).
      const result = run(project, 'npx', [
        '--no-install',
        'nitpicker',
        '--base',
        base,
        '--analyzer',
        name,
        '--output',
        output,
      ]);
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      rmSync(output, { recursive: true, force: true });
      if (result.status !== 0 && result.status !== 1) {
        failures.add(name);
        process.stderr.write(`${name}: exit ${String(result.status)}\n`);
      }
      samples[name].push(seconds);
    }
    secondsByName[name] = median(samples[name]);
    process.stderr.write(`${name}: ${secondsByName[name].toFixed(1)}s\n`);
  }
  // A tool error makes the timing meaningless (the analyzer bailed out early), so those analyzers
  // and anything depending on them are reported as failed and left out of the weights.
  const failed = analyzers.filter(({ name }) => failures.has(name)).map(({ name }) => name);
  const usable = analyzers.filter(
    ({ name, dependencies = [] }) => ![name, ...dependencies].some((n) => failed.includes(n)),
  );
  const costs = ownCosts(usable, secondsByName);
  return { samples, failed, secondsByName, costs, weights: weightsFromSeconds(costs) };
}

async function main() {
  if (process.argv[2] === '--blend') {
    const reports = process.argv.slice(3).map((file) => JSON.parse(readFileSync(file, 'utf8')));
    process.stdout.write(`${JSON.stringify(blendReports(reports), null, 2)}\n`);
    return;
  }
  const options = { runs: 3, base: 'main' };
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index].replace(/^--/, '');
    options[key] = key === 'runs' ? Number(argv[index + 1]) : argv[index + 1];
  }
  const { configuredAnalyzers } = await import(
    pathToFileURL(
      path.join(packageRoot, 'languages/typescript/preset/diff/configured-analyzers.mjs'),
    ).href
  );
  let project = options.project;
  let temporary;
  if (project === undefined) {
    if (!['self', 'consumer', 'generated'].includes(options.fixture)) {
      throw new Error('Pass --project <dir> or --fixture self|consumer|generated');
    }
    // `--keep <dir>` builds the fixture there and leaves it for inspection.
    if (options.keep === undefined) {
      temporary = mkdtempSync(path.join(tmpdir(), `nitpicker-weights-${options.fixture}-`));
    }
    project = options.keep ?? temporary;
    mkdirSync(project, { recursive: true });
    buildFixture(options.fixture, project);
  }
  if (!existsSync(path.join(project, '.git'))) throw new Error(`${project} is not a git root`);
  try {
    const result = measureProject(configuredAnalyzers(), project, options);
    const report = { fixture: options.fixture ?? project, runs: options.runs, ...result };
    if (options.json) writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
