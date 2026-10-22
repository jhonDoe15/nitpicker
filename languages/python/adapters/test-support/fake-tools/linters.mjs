import { readdirSync } from 'node:fs';
import path from 'node:path';
import { err, exists, lines, out, read, readOr, valueOf, write } from './call.mjs';

const PYRIGHT_REPORT_FAILURE = 1;
const RUFF_UNPARSABLE_STATUS = 2;
const BLACK_UNPARSABLE_STATUS = 123;

const PYRIGHT_VERSIONS = {
  pyright: 'pyright 1.1.390\n',
  basedpyright: 'basedpyright 1.40.2\nbased on pyright 1.1.414\n',
};

function sarif(call) {
  const { cwd } = call;
  return {
    runs: [
      {
        tool: { driver: { name: 'ruff' } },
        results: lines(call, 'violations.txt').map((line, index) => {
          const [rule, file, message] = line.split('|');
          return {
            ruleId: rule,
            level: 'error',
            message: { text: message },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: `file://${path.join(cwd, file)}` },
                  region: { startLine: index + 1, startColumn: 1 },
                },
              },
            ],
          };
        }),
      },
    ],
  };
}

function sources(call) {
  const { cwd } = call;
  const listed = lines(call, 'sources.txt');
  const found = readdirSync(cwd, { recursive: true }).filter(
    (file) => file.endsWith('.py') && !file.startsWith('.venv'),
  );
  return (listed.length > 0 ? listed : found.sort()).map((file) => path.join(cwd, file));
}

function formatStatus({ unparsable, files }, unparsableStatus) {
  if (unparsable.length > 0) {
    return unparsableStatus;
  }
  return files.length > 0 ? 1 : 0;
}

export function ruff(call) {
  const { args, result } = call;
  if (args[0] === '--version') {
    out(call, 'ruff 0.9.9\n');
  } else if (args[0] === 'rule') {
    if (exists(call, 'ruff-rules.json')) {
      out(call, read(call, 'ruff-rules.json'));
    } else {
      err(call, 'error: unrecognized subcommand\n');
      result.status = 2;
    }
  } else if (args.includes('--show-files')) {
    out(
      call,
      sources(call)
        .map((file) => `${file}\n`)
        .join(''),
    );
  } else if (args[0] === 'check') {
    write(call, valueOf(call, '--output-file'), JSON.stringify(sarif(call)));
    result.status = lines(call, 'violations.txt').length > 0 ? 1 : 0;
  } else {
    const files = lines(call, 'unformatted.txt');
    const unparsable = lines(call, 'unparsable.txt');
    out(call, files.map((file) => `--- ${file}\n+++ ${file}\n@@ -1 +1 @@\n`).join(''));
    err(
      call,
      unparsable.map((file) => `error: Failed to parse ${file}:1:7: Expected newline\n`).join(''),
    );
    result.status = formatStatus({ unparsable, files }, RUFF_UNPARSABLE_STATUS);
  }
}

export function black(call) {
  const { args, cwd, result } = call;
  if (args[0] === '--version') {
    out(call, 'black, 24.1.0 (compiled: yes)\n');
    return;
  }
  const files = lines(call, 'unformatted.txt');
  const unparsable = lines(call, 'unparsable.txt');
  err(
    call,
    [
      ...files.map((file) => `would reformat ${path.join(cwd, file)}\n`),
      ...unparsable.map(
        (file) => `error: cannot format ${path.join(cwd, file)}: Cannot parse: 1:6\n`,
      ),
    ].join(''),
  );
  result.status = formatStatus({ unparsable, files }, BLACK_UNPARSABLE_STATUS);
}

export function mypy(call) {
  const { args, result } = call;
  if (args[0] === '--version') {
    out(call, `mypy ${lines(call, 'mypy-version.txt')[0] ?? '1.13.0'} (compiled: yes)\n`);
    return;
  }
  const report = readOr(call, 'type-errors.txt', '');
  out(call, report);
  result.status = report === '' ? 0 : 1;
}

export function pyright(call) {
  const { tool, args, cwd, result } = call;
  if (args[0] === '--version') {
    out(call, PYRIGHT_VERSIONS[tool]);
    return;
  }
  const { generalDiagnostics = [] } = exists(call, 'pyright.json')
    ? JSON.parse(read(call, 'pyright.json'))
    : {};
  const absolute = generalDiagnostics.map((item) => ({
    ...item,
    file: path.resolve(cwd, item.file),
  }));
  out(call, JSON.stringify({ generalDiagnostics: absolute }));
  result.status = absolute.length === 0 ? 0 : PYRIGHT_REPORT_FAILURE;
}

export function lintImports(call) {
  const { args, result } = call;
  if (args[0] === '--version') {
    out(call, 'lint-imports, version 2.5\n');
    return;
  }
  const report = exists(call, 'lint-imports.txt')
    ? read(call, 'lint-imports.txt')
    : 'Contracts: 0 kept, 0 broken.\n';
  out(call, report);
  result.status = report.includes(' BROKEN') ? 1 : 0;
}
