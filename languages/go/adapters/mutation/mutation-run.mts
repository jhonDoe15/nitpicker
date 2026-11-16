import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildFlags } from '../build/go-vet.mts';
import { ANY_STATUS, execute, failure, run } from '../execution/go-process.mts';
import { blockAt, parseCoverProfile } from '../branch-coverage/coverage-profile.mts';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { parseEventLines, parseTestEvents } from '../tests/test-events.mts';
import type { CoverProfile, GoContext, ProcessResult, RunContext } from '../go-types.mts';
import type { Baseline, Mutant, Packages, Testers } from './mutation-types.mts';

const MINIMUM_TIMEOUT_SECONDS = 30;
const TIMEOUT_FACTOR = 5;
const BUILD_ALLOWANCE_MS = 5 * 60 * 1000;
const TIMED_OUT = 'panic: test timed out';
const MUTATION_FAILED = 'mutation-failed';
const PACKAGE_FORMAT =
  '{{.ImportPath}}\t{{.Dir}}\t{{join .GoFiles ","}}\t{{join .CgoFiles ","}}\t{{len .TestGoFiles}}\t{{len .XTestGoFiles}}';

function listed(
  context: GoContext,
  { root, format, extra = [] }: { root: string; format: string; extra?: readonly string[] },
) {
  const result = run(
    context,
    ['go', 'list', ...extra, ...buildFlags(context.settings), '-f', format, './...'],
    { rule: 'go-list-failed', cwd: root },
  );
  return (result.stdout ?? '').split('\n').filter((line) => line !== '');
}

export function packagesOf(
  context: GoContext,
  root: string | undefined = context.projectRoot,
): Packages {
  const files = new Map<string, string>();
  const tested = new Set<string>();
  for (const line of listed(context, { root, format: PACKAGE_FORMAT })) {
    const [importPath = '', directory = '', goFiles = '', cgoFiles = '', tests, externalTests] =
      line.split('\t');
    const relative = path.relative(root, directory).split(path.sep).join('/');
    for (const name of [...goFiles.split(','), ...cgoFiles.split(',')].filter(Boolean)) {
      files.set(relative === '' ? name : `${relative}/${name}`, importPath);
    }
    if (Number(tests) + Number(externalTests) > 0) {
      tested.add(importPath);
    }
  }
  return { files, tested };
}

export function testersOf(
  context: GoContext,
  root: string | undefined = context.projectRoot,
): Map<string, string[]> {
  const testers = new Map<string, string[]>();
  const format = '{{.ImportPath}}{{range .Deps}}{{"\\t"}}{{.}}{{end}}';
  for (const line of listed(context, { root, format, extra: ['-test'] })) {
    const [binary = '', ...deps] = line.split('\t');
    if (!binary.endsWith('.test')) {
      continue;
    }
    const tester = binary.replace(/\.test$/u, '');
    for (const dependency of deps.map((entry) => entry.replace(/ \[.*\]$/u, ''))) {
      testers.set(dependency, [...new Set([...(testers.get(dependency) ?? []), tester])]);
    }
  }
  return testers;
}

function packageSeconds(text: string) {
  const seconds = new Map<string, number>();
  for (const event of parseEventLines(text)) {
    if (event.Test === undefined && (event.Action === 'pass' || event.Action === 'fail')) {
      seconds.set(event.Package ?? '', event.Elapsed ?? 0);
    }
  }
  return seconds;
}

export function baselineRun(
  context: GoContext,
  {
    root = context.projectRoot,
    packages,
    modulePath,
  }: { root?: string | undefined; packages: readonly string[]; modulePath?: string | undefined },
): Baseline {
  const profile = path.join(context.reportRoot, 'mutation-coverage.out');
  const coverage = modulePath === undefined ? [] : ['-covermode=atomic', '-coverpkg=./...'];
  const command = [
    'go',
    'test',
    '-vet=off',
    '-json',
    '-count=1',
    ...buildFlags(context.settings),
    ...coverage,
    ...(coverage.length === 0 ? [] : [`-coverprofile=${profile}`]),
    ...packages,
  ];
  const result = run(context, command, {
    rule: MUTATION_FAILED,
    accepted: ANY_STATUS,
    cwd: root,
  });
  const events = parseTestEvents(result.stdout ?? '');
  if (result.status !== 0 && events.events === 0) {
    throw failure({ command, result, rule: MUTATION_FAILED });
  }
  return {
    failing: new Set([
      ...events.buildFailures,
      ...events.failures.map(({ package: name }) => name),
    ]),
    seconds: packageSeconds(result.stdout ?? ''),
    profile:
      coverage.length === 0
        ? undefined
        : parseCoverProfile(readFileSync(profile, 'utf8'), modulePath),
  };
}

function statusOf(result: ProcessResult) {
  if (result.error?.code === 'ETIMEDOUT') {
    return 'Timeout';
  }
  if (result.status === 0) {
    return 'Survived';
  }
  const events = parseTestEvents(result.stdout ?? '');
  if (events.buildFailures.length > 0 || events.events === 0) {
    return 'CompileError';
  }
  return (result.stdout ?? '').includes(TIMED_OUT) ? 'Timeout' : 'Killed';
}

function inside(root: string, relative: string) {
  const absolute = pathInside(root, relative);
  if (absolute === undefined) {
    throw Object.assign(new Error(`${relative} is outside ${root}`), { rule: MUTATION_FAILED });
  }
  return absolute;
}

function overlayFor({
  context,
  root,
  mutant,
  directory,
}: {
  context: RunContext;
  root: string;
  mutant: Mutant;
  directory: string;
}) {
  const file = inside(root, mutant.file);
  const bytes = readFileSync(file);
  const mutated = Buffer.concat([
    bytes.subarray(0, mutant.start),
    Buffer.from(mutant.replacement, 'utf8'),
    bytes.subarray(mutant.end),
  ]);
  const folder = inside(context.reportRoot, `mutants/${directory}`);
  mkdirSync(folder, { recursive: true });
  const replacement = inside(folder, path.basename(mutant.file));
  writeFileSync(replacement, mutated);
  const overlay = inside(folder, 'overlay.json');
  writeFileSync(overlay, JSON.stringify({ Replace: { [file]: replacement } }));
  return overlay;
}

function timeoutSeconds(packages: readonly string[], seconds: ReadonlyMap<string, number>) {
  const baseline = packages.reduce((sum, name) => sum + (seconds.get(name) ?? 0), 0);
  return Math.max(MINIMUM_TIMEOUT_SECONDS, Math.ceil(baseline * TIMEOUT_FACTOR));
}

export function runMutant(
  context: RunContext,
  {
    mutant,
    directory,
    packages,
    seconds,
    root,
  }: {
    mutant: Mutant;
    directory: string;
    packages: readonly string[];
    seconds: ReadonlyMap<string, number>;
    root?: string | undefined;
  },
): string {
  const projectRoot = root ?? context.projectRoot;
  const limit = timeoutSeconds(packages, seconds);
  const overlay = overlayFor({ context, root: projectRoot, mutant, directory });
  const result = execute(
    context,
    [
      'go',
      'test',
      '-json',
      '-vet=off',
      '-count=1',
      '-failfast',
      `-overlay=${overlay}`,
      `-timeout=${String(limit)}s`,
      ...buildFlags(context.settings),
      ...packages,
    ],
    { timeout: limit * 1000 + BUILD_ALLOWANCE_MS, cwd: projectRoot },
  );
  return statusOf(result);
}

export function runnersOf(testers: Testers, packages: Packages, file: string): readonly string[] {
  const name = packages.files.get(file);
  return (name === undefined ? undefined : testers.get(name)) ?? [];
}

export function uncovered(
  mutant: Pick<Mutant, 'file' | 'line' | 'column'>,
  profile: CoverProfile | undefined,
): boolean {
  const block = blockAt(profile?.files.get(mutant.file) ?? [], {
    line: mutant.line,
    column: mutant.column,
  });
  return block !== undefined && block.count === 0;
}
