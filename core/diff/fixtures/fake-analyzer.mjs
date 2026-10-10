import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * Runs the fake analyzer on `argv` and returns what its process would: `{ status, signal,
 * stdoutText, stderrText }`, or undefined for the `hang` mode, which only a process can do.
 */
export function runFakeAnalyzer(argv) {
  try {
    return analyze(argv);
  } catch (error) {
    // An uncaught error in the process: exit 1, nothing on stdout, the stack on stderr.
    return { status: 1, signal: null, stdoutText: '', stderrText: `${error?.stack ?? error}\n` };
  }
}

function analyze(argv) {
  const arguments_ = parseArguments(argv);
  const policy = JSON.parse(
    readFileSync(path.join(arguments_.policyRoot, 'quality-policy.json'), 'utf8'),
  );

  if (policy.mode === 'crash') {
    return { status: 2, signal: null, stdoutText: '', stderrText: 'fake analyzer crash\n' };
  }
  if (policy.mode === 'malformed') {
    return { status: 0, signal: null, stdoutText: '{not-json', stderrText: '' };
  }
  if (policy.mode === 'hang') {
    return undefined;
  }

  const dependencyMarker =
    typeof policy.markerDependency === 'string'
      ? readFileSync(
          path.join(arguments_.toolRoot, 'node_modules', policy.markerDependency),
          'utf8',
        ).trim()
      : undefined;
  const marker =
    dependencyMarker ?? (typeof policy.marker === 'string' ? policy.marker : 'QUALITY_FINDING');
  const findings = [];
  for (const filePath of selectedFiles(arguments_.root)) {
    const relativePath = normalizePath(path.relative(arguments_.root, filePath));
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const markerIndex = line.indexOf(`${marker} `);
      if (markerIndex === -1) {
        continue;
      }
      const encodedFinding = line.slice(markerIndex + marker.length + 1);
      const finding = JSON.parse(encodedFinding);
      findings.push({
        tool: finding.tool,
        rule: finding.rule,
        path: finding.path ?? relativePath,
        symbol: finding.symbol,
        identity: finding.identityFromPath === true ? `path:${relativePath}` : finding.identity,
        message: finding.message,
        location: finding.location ?? { line: index + 1, column: markerIndex + 1 },
        classification: finding.classification,
        metric: finding.metric,
      });
    }
  }

  return {
    status: policy.exitCodeWhenFindings === 1 && findings.length > 0 ? 1 : 0,
    signal: null,
    stdoutText: `${JSON.stringify({ findings })}\n`,
    stderrText: '',
  };
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  const arguments_ = process.argv.slice(2);
  const policy = JSON.parse(
    readFileSync(path.join(parseArguments(arguments_).policyRoot, 'quality-policy.json'), 'utf8'),
  );
  if (policy.mode === 'hang') {
    setInterval(() => {}, 60_000);
  } else {
    const result = analyze(arguments_);
    process.stdout.write(result.stdoutText);
    process.stderr.write(result.stderrText);
    process.exitCode = result.status;
  }
}

function selectedFiles(root) {
  const files = [];
  const pendingDirectories = [root];
  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      const relativePath = normalizePath(path.relative(root, entryPath));
      if (isExcluded(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  return files.sort();
}

function isExcluded(relativePath) {
  return (
    relativePath.endsWith('.d.ts') ||
    /(?:^|\/)(?:\.git|node_modules|dist|build|generated|coverage|reports|target)(?:\/|$)/.test(
      relativePath,
    )
  );
}

function parseArguments(arguments_) {
  const values = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (
      (name !== '--root' && name !== '--policy-root' && name !== '--tool-root') ||
      value === undefined
    ) {
      throw new Error(`Invalid fake analyzer argument: ${name ?? '<missing>'}`);
    }
    values[name.slice(2)] = path.resolve(value);
  }
  if (
    values.root === undefined ||
    values['policy-root'] === undefined ||
    values['tool-root'] === undefined
  ) {
    throw new Error('Fake analyzer requires --root, --policy-root, and --tool-root');
  }
  return {
    root: values.root,
    policyRoot: values['policy-root'],
    toolRoot: values['tool-root'],
  };
}

function normalizePath(value) {
  return value.replaceAll('\\', '/');
}
