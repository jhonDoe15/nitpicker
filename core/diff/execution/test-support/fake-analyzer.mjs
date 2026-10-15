import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const ARGUMENT_NAMES = ['--root', '--policy-root', '--tool-root'];
const MODE_OUTPUTS = new Map([
  ['crash', { status: 2, signal: undefined, stdoutText: '', stderrText: 'fake analyzer crash\n' }],
  ['malformed', { status: 0, signal: undefined, stdoutText: '{not-json', stderrText: '' }],
]);
const DEFAULT_MARKER = 'QUALITY_FINDING';
const EXCLUDED_PATH =
  /(?:^|\/)(?:\.git|node_modules|dist|build|generated|coverage|reports|target)(?:\/|$)/;

export function runFakeAnalyzer(argv) {
  try {
    return analyze(argv);
  } catch (error) {
    return {
      status: 1,
      signal: undefined,
      stdoutText: '',
      stderrText: `${error?.stack ?? error}\n`,
    };
  }
}

function analyze(argv) {
  const { root, policyRoot, toolRoot } = parseArguments(argv);
  const policy = readPolicy(policyRoot);
  if (policy.mode === 'hang') {
    return undefined;
  }
  const modeOutput = MODE_OUTPUTS.get(policy.mode);
  if (modeOutput !== undefined) {
    return modeOutput;
  }
  const marker = markerFor(policy, toolRoot);
  const findings = selectedFiles(root).flatMap((filePath) =>
    findingsInFile(filePath, { root, marker }),
  );
  return {
    status: policy.exitCodeWhenFindings === 1 && findings.length > 0 ? 1 : 0,
    signal: undefined,
    stdoutText: `${JSON.stringify({ findings })}\n`,
    stderrText: '',
  };
}

function readPolicy(policyRoot) {
  return JSON.parse(readFileSync(path.join(policyRoot, 'quality-policy.json'), 'utf8'));
}

function markerFor(policy, toolRoot) {
  if (typeof policy.markerDependency === 'string') {
    return readFileSync(
      path.join(toolRoot, 'node_modules', policy.markerDependency),
      'utf8',
    ).trim();
  }
  return typeof policy.marker === 'string' ? policy.marker : DEFAULT_MARKER;
}

function findingsInFile(filePath, { root, marker }) {
  const relativePath = normalizePath(path.relative(root, filePath));
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const markerIndex = line.indexOf(`${marker} `);
      return markerIndex === -1
        ? []
        : [findingFromMarkedLine(line, { marker, markerIndex, index, relativePath })];
    });
}

function findingFromMarkedLine(line, { marker, markerIndex, index, relativePath }) {
  const finding = JSON.parse(line.slice(markerIndex + marker.length + 1));
  return {
    tool: finding.tool,
    rule: finding.rule,
    path: finding.path ?? relativePath,
    symbol: finding.symbol,
    identity: finding.identityFromPath === true ? `path:${relativePath}` : finding.identity,
    message: finding.message,
    location: finding.location ?? { line: index + 1, column: markerIndex + 1 },
    classification: finding.classification,
    metric: finding.metric,
  };
}

function runAsProcess(argv) {
  if (readPolicy(parseArguments(argv).policyRoot).mode === 'hang') {
    setInterval(() => {}, 60_000);
    return;
  }
  const result = analyze(argv);
  process.stdout.write(result.stdoutText);
  process.stderr.write(result.stderrText);
  process.exitCode = result.status;
}

function selectedFiles(root) {
  const files = [];
  const directories = [root];
  for (const directory of directories) {
    const entries = readdirSync(directory, { withFileTypes: true })
      .map((entry) => ({ entry, entryPath: path.join(directory, entry.name) }))
      .filter(({ entryPath }) => !isExcluded(normalizePath(path.relative(root, entryPath))));
    directories.push(
      ...entries.filter(({ entry }) => entry.isDirectory()).map(({ entryPath }) => entryPath),
    );
    files.push(...entries.filter(({ entry }) => entry.isFile()).map(({ entryPath }) => entryPath));
  }
  return files.sort();
}

function isExcluded(relativePath) {
  return relativePath.endsWith('.d.ts') || EXCLUDED_PATH.test(relativePath);
}

function parseArguments(argv) {
  const values = new Map(
    Array.from({ length: Math.ceil(argv.length / 2) }, (_, pair) => argumentPair(argv, pair)),
  );
  if (!ARGUMENT_NAMES.every((name) => values.has(name))) {
    throw new Error('Fake analyzer requires --root, --policy-root, and --tool-root');
  }
  return {
    root: values.get('--root'),
    policyRoot: values.get('--policy-root'),
    toolRoot: values.get('--tool-root'),
  };
}

function argumentPair(argv, pair) {
  const [name, value] = [argv[pair * 2], argv[pair * 2 + 1]];
  if (!ARGUMENT_NAMES.includes(name) || value === undefined) {
    throw new Error(`Invalid fake analyzer argument: ${name ?? '<missing>'}`);
  }
  return [name, path.resolve(value)];
}

function normalizePath(value) {
  return value.replaceAll('\\', '/');
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  runAsProcess(process.argv.slice(2));
}
