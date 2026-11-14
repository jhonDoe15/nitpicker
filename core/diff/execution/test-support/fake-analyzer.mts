import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fieldsOf, parseJson } from '../../../../shared/values/readers.mts';

type FakeAnalyzerResult = {
  readonly status: number;
  readonly signal: undefined;
  readonly stdoutText: string;
  readonly stderrText: string;
};
type Arguments = { root: string; policyRoot: string; toolRoot: string };
type MarkedLine = { marker: string; markerIndex: number; index: number; relativePath: string };
type Policy = {
  mode?: unknown;
  exitCodeWhenFindings?: unknown;
  markerDependency?: unknown;
  marker?: unknown;
};
type MarkedFinding = {
  tool?: unknown;
  rule?: unknown;
  path?: unknown;
  symbol?: unknown;
  identityFromPath?: unknown;
  identity?: unknown;
  message?: unknown;
  allowedForm?: unknown;
  location?: unknown;
  classification?: unknown;
  metric?: unknown;
};

const ARGUMENT_NAMES = ['--root', '--policy-root', '--tool-root'];
const MODE_OUTPUTS = new Map<unknown, FakeAnalyzerResult>([
  ['crash', { status: 2, signal: undefined, stdoutText: '', stderrText: 'fake analyzer crash\n' }],
  ['malformed', { status: 0, signal: undefined, stdoutText: '{not-json', stderrText: '' }],
]);
const HANG_INTERVAL_MS = 60_000;
const DEFAULT_MARKER = 'QUALITY_FINDING';
const EXCLUDED_PATH =
  /(?:^|\/)(?:\.git|node_modules|dist|build|generated|coverage|reports|target)(?:\/|$)/;

export function runFakeAnalyzer(argv: readonly string[]): FakeAnalyzerResult | undefined {
  try {
    return analyze(argv);
  } catch (error) {
    return {
      status: 1,
      signal: undefined,
      stdoutText: '',
      stderrText: `${error instanceof Error ? (error.stack ?? String(error)) : String(error)}\n`,
    };
  }
}

function analyze(argv: readonly string[]): FakeAnalyzerResult | undefined {
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

function readPolicy(policyRoot: string): Policy {
  return fieldsOf(parseJson(readFileSync(path.join(policyRoot, 'quality-policy.json'), 'utf8')));
}

function markerFor(policy: Policy, toolRoot: string): string {
  if (typeof policy.markerDependency === 'string') {
    return readFileSync(
      path.join(toolRoot, 'node_modules', policy.markerDependency),
      'utf8',
    ).trim();
  }
  return typeof policy.marker === 'string' ? policy.marker : DEFAULT_MARKER;
}

function findingsInFile(
  filePath: string,
  { root, marker }: { root: string; marker: string },
): object[] {
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

function findingFromMarkedLine(
  line: string,
  { marker, markerIndex, index, relativePath }: MarkedLine,
): object {
  const finding: MarkedFinding = fieldsOf(parseJson(line.slice(markerIndex + marker.length + 1)));
  return {
    tool: finding.tool,
    rule: finding.rule,
    path: finding.path ?? relativePath,
    symbol: finding.symbol,
    identity: finding.identityFromPath === true ? `path:${relativePath}` : finding.identity,
    message: finding.message,
    allowedForm: finding.allowedForm,
    location: finding.location ?? { line: index + 1, column: markerIndex + 1 },
    classification: finding.classification,
    metric: finding.metric,
  };
}

function runAsProcess(argv: readonly string[]): void {
  if (readPolicy(parseArguments(argv).policyRoot).mode === 'hang') {
    setInterval(() => {}, HANG_INTERVAL_MS);
    return;
  }
  const result = analyze(argv);
  if (result === undefined) {
    return;
  }
  process.stdout.write(result.stdoutText);
  process.stderr.write(result.stderrText);
  process.exitCode = result.status;
}

function selectedFiles(root: string): string[] {
  const files: string[] = [];
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

function isExcluded(relativePath: string): boolean {
  return relativePath.endsWith('.d.ts') || EXCLUDED_PATH.test(relativePath);
}

function parseArguments(argv: readonly string[]): Arguments {
  const values = new Map(
    Array.from({ length: Math.ceil(argv.length / 2) }, (_, pair) => argumentPair(argv, pair)),
  );
  if (!ARGUMENT_NAMES.every((name) => values.has(name))) {
    throw new Error('Fake analyzer requires --root, --policy-root, and --tool-root');
  }
  return {
    root: values.get('--root') ?? '',
    policyRoot: values.get('--policy-root') ?? '',
    toolRoot: values.get('--tool-root') ?? '',
  };
}

function argumentPair(argv: readonly string[], pair: number): [string, string] {
  const [name, value] = [argv[pair * 2], argv[pair * 2 + 1]];
  if (name === undefined || !ARGUMENT_NAMES.includes(name) || value === undefined) {
    throw new Error(`Invalid fake analyzer argument: ${name ?? '<missing>'}`);
  }
  return [name, path.resolve(value)];
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  runAsProcess(process.argv.slice(2));
}
