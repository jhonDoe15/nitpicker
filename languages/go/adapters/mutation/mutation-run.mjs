import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildFlags } from '../build/go-vet.mjs';
import { ANY_STATUS, execute, failure, run } from '../execution/go-process.mjs';
import { blockAt, parseCoverProfile } from '../branch-coverage/coverage-profile.mjs';
import { parseTestEvents } from '../tests/test-events.mjs';
import { pathInside } from '../../../../shared/filesystem.mjs';

const MINIMUM_TIMEOUT_SECONDS = 30;
const TIMEOUT_FACTOR = 5;
const BUILD_ALLOWANCE_MS = 5 * 60 * 1000;
const TIMED_OUT = /panic: test timed out/u;
const PACKAGE_FORMAT =
  '{{.ImportPath}}\t{{.Dir}}\t{{join .GoFiles ","}}\t{{join .CgoFiles ","}}\t{{len .TestGoFiles}}\t{{len .XTestGoFiles}}';

function listed(context, { root, format, extra = [] }) {
  const result = run(
    context,
    ['go', 'list', ...extra, ...buildFlags(context.settings), '-f', format, './...'],
    { rule: 'go-list-failed', cwd: root },
  );
  return result.stdout.split('\n').filter((line) => line !== '');
}

export function packagesOf(context, root = context.projectRoot) {
  const files = new Map();
  const tested = new Set();
  for (const line of listed(context, { root, format: PACKAGE_FORMAT })) {
    const [importPath, directory, goFiles, cgoFiles, tests, externalTests] = line.split('\t');
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

export function testersOf(context, root = context.projectRoot) {
  const testers = new Map();
  const format = '{{.ImportPath}}{{range .Deps}}{{"\\t"}}{{.}}{{end}}';
  for (const line of listed(context, { root, format, extra: ['-test'] })) {
    const [binary, ...deps] = line.split('\t');
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

function packageSeconds(text) {
  const seconds = new Map();
  for (const line of text.split('\n').filter((entry) => entry.startsWith('{'))) {
    const event = JSON.parse(line);
    if (event.Test === undefined && (event.Action === 'pass' || event.Action === 'fail')) {
      seconds.set(event.Package, event.Elapsed ?? 0);
    }
  }
  return seconds;
}

export function baselineRun(context, { root = context.projectRoot, packages, modulePath }) {
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
    rule: 'mutation-failed',
    accepted: ANY_STATUS,
    cwd: root,
  });
  const events = parseTestEvents(result.stdout ?? '');
  if (result.status !== 0 && events.events === 0) {
    throw failure({ command, result, rule: 'mutation-failed' });
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

function statusOf(result) {
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
  return events.failures.some(({ output }) => TIMED_OUT.test(output)) ? 'Timeout' : 'Killed';
}

function inside(root, relative) {
  const absolute = pathInside(root, relative);
  if (absolute === undefined) {
    throw Object.assign(new Error(`${relative} is outside ${root}`), { rule: 'mutation-failed' });
  }
  return absolute;
}

function overlayFor({ context, root, mutant, directory }) {
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

function timeoutSeconds(packages, seconds) {
  const baseline = packages.reduce((sum, name) => sum + (seconds.get(name) ?? 0), 0);
  return Math.max(MINIMUM_TIMEOUT_SECONDS, Math.ceil(baseline * TIMEOUT_FACTOR));
}

export function runMutant(context, { mutant, directory, packages, seconds, root }) {
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

export function uncovered(mutant, profile) {
  const block = blockAt(profile.files.get(mutant.file) ?? [], {
    line: mutant.line,
    column: mutant.column,
  });
  return block !== undefined && block.count === 0;
}
