#!/usr/bin/env node
// Stand-in for the Python toolchain (ruff, black, coverage, python) in tests that run without
// Python. Invoked as `fake-python-tools.mjs <tool> <args...>` (see fake-toolchain.mjs for the
// wrappers). The project directory (cwd) controls it:
//   fail.json            { "<tool>" or "<tool> <subcommand>": "message" }: that call exits 2 with the
//                        message on stderr (`--version` always works)
//   violations.txt       one `rule|path|message` per line: ruff check findings
//   unformatted.txt      one path per line: files ruff format / black would reformat
//   test-exit.txt        exit status of `coverage run` (default 0); its output says the tests failed
//   coverage-data.json   written as the coverage.py JSON report (default: no files)
//   no-pytest.txt        `python -c "import pytest"` fails
//   sources.txt          one path per line: what `ruff check --show-files` lists (default: every
//                        .py file below the project, except .venv)
//   type-errors.txt      printed by mypy as its report (exit 1 when not empty)
//   pyright.json         { generalDiagnostics } printed by pyright as its report, relative files made
//                        absolute (exit 1 when it has diagnostics)
//   rules.json           written by the nitpicker rules script (default: no findings)
//   structure-data.json  written as the structure metrics report of `python structure_metrics.py`
//                        (default: no functions)
//   lizard-data.csv      printed by `lizard --csv` (default: no functions); `lizard --version` is 1.24.1
//   import-scan.json     printed by the import scan script (default: no imports)
//   lint-imports.txt     printed by lint-imports (default: a report with no broken contracts); its
//                        exit status is 1 when the text says BROKEN
//   no-mutmut.txt        the mutmut version probe fails
//   mutants-data.json    { "<source path>": { "exitCodes": {...}, "mutated": "<text>" } }: what
//                        `mutmut run` leaves in mutants/ (default: an empty mutants/)
//   mutmut-exit.txt      exit status of `mutmut run` (default 0); 1 says no mutant is covered, any
//                        other status says the clean test run failed
// When FAKE_PYTHON_LOG is set, every call appends a JSON line with the tool, arguments, cwd,
// PYTHONPATH and MYPYPATH.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const [tool, ...args] = process.argv.slice(2);
const cwd = process.cwd();
const lines = (file) =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
const valueOf = (flag) => args[args.indexOf(flag) + 1];

if (process.env.FAKE_PYTHON_LOG !== undefined) {
  appendFileSync(
    process.env.FAKE_PYTHON_LOG,
    `${JSON.stringify({
      tool,
      args,
      cwd,
      pythonPath: process.env.PYTHONPATH ?? '',
      mypyPath: process.env.MYPYPATH ?? '',
    })}\n`,
  );
}

const failures = existsSync('fail.json') ? JSON.parse(readFileSync('fail.json', 'utf8')) : {};
const failure = failures[`${tool} ${args[0]}`] ?? failures[tool];
if (failure !== undefined && !args.includes('--version')) {
  process.stderr.write(`${failure}\n`);
  process.exit(2);
}

const sarif = () => ({
  runs: [
    {
      tool: { driver: { name: 'ruff' } },
      results: lines('violations.txt').map((line, index) => {
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
});

function sources() {
  const listed = lines('sources.txt');
  const found = readdirSync(cwd, { recursive: true }).filter(
    (file) => file.endsWith('.py') && !file.startsWith('.venv'),
  );
  return (listed.length > 0 ? listed : found.sort()).map((file) => path.join(cwd, file));
}

function ruff() {
  if (args[0] === '--version') {
    process.stdout.write('ruff 0.9.9\n');
  } else if (args.includes('--show-files')) {
    process.stdout.write(
      sources()
        .map((file) => `${file}\n`)
        .join(''),
    );
  } else if (args[0] === 'check') {
    writeFileSync(valueOf('--output-file'), JSON.stringify(sarif()));
    process.exit(lines('violations.txt').length > 0 ? 1 : 0);
  } else {
    const files = lines('unformatted.txt');
    process.stdout.write(files.map((file) => `--- ${file}\n+++ ${file}\n@@ -1 +1 @@\n`).join(''));
    process.exit(files.length > 0 ? 1 : 0);
  }
}

function black() {
  if (args[0] === '--version') {
    process.stdout.write('black, 24.1.0 (compiled: yes)\n');
    return;
  }
  const files = lines('unformatted.txt');
  process.stderr.write(files.map((file) => `would reformat ${path.join(cwd, file)}\n`).join(''));
  process.exit(files.length > 0 ? 1 : 0);
}

function coverage() {
  if (args[0] === '--version') {
    process.stdout.write('Coverage.py, version 7.6.1 with C extension\n');
  } else if (args[0] === 'run') {
    const status = Number(lines('test-exit.txt')[0] ?? 0);
    process.stdout.write(status === 0 ? '1 passed\n' : '1 failed: test_greet\n');
    process.exit(status);
  } else {
    const data = existsSync('coverage-data.json')
      ? readFileSync('coverage-data.json', 'utf8')
      : '{"files":{}}';
    writeFileSync(valueOf('-o'), data);
  }
}

function mypy() {
  if (args[0] === '--version') {
    process.stdout.write('mypy 1.13.0 (compiled: yes)\n');
    return;
  }
  const report = existsSync('type-errors.txt') ? readFileSync('type-errors.txt', 'utf8') : '';
  process.stdout.write(report);
  process.exit(report === '' ? 0 : 1);
}

function pyright() {
  if (args[0] === '--version') {
    process.stdout.write('pyright 1.1.390\n');
    return;
  }
  const { generalDiagnostics = [] } = existsSync('pyright.json')
    ? JSON.parse(readFileSync('pyright.json', 'utf8'))
    : {};
  const absolute = generalDiagnostics.map((item) => ({
    ...item,
    file: path.resolve(cwd, item.file),
  }));
  process.stdout.write(JSON.stringify({ generalDiagnostics: absolute }));
  process.exit(absolute.length === 0 ? 0 : 1);
}

function lintImports() {
  if (args[0] === '--version') {
    process.stdout.write('lint-imports, version 2.5\n');
    return;
  }
  const report = existsSync('lint-imports.txt')
    ? readFileSync('lint-imports.txt', 'utf8')
    : 'Contracts: 0 kept, 0 broken.\n';
  process.stdout.write(report);
  process.exit(report.includes(' BROKEN') ? 1 : 0);
}

function python() {
  if (args.some((argument) => argument.endsWith('import-scan.py'))) {
    process.stdout.write(
      existsSync('import-scan.json') ? readFileSync('import-scan.json', 'utf8') : '{}',
    );
    return;
  }
  if (args.join(' ').includes('"mutmut"')) {
    if (existsSync('no-mutmut.txt')) {
      process.exit(1);
    }
    process.stdout.write('3.8.0\n');
    return;
  }
  if (args[0] === '-I') {
    const report = existsSync('rules.json') ? readFileSync('rules.json', 'utf8') : '[]';
    writeFileSync(args[3], report);
    return;
  }
  if (args[0]?.endsWith('.py')) {
    const data = existsSync('structure-data.json')
      ? readFileSync('structure-data.json', 'utf8')
      : '[]';
    writeFileSync(args[1], data);
    return;
  }
  if (existsSync('no-pytest.txt')) {
    process.exit(1);
  }
  process.stdout.write('8.3.1\n');
}

function lizard() {
  if (args[0] === '--version') {
    process.stdout.write('1.24.1\n');
  } else if (existsSync('lizard-data.csv')) {
    process.stdout.write(readFileSync('lizard-data.csv', 'utf8'));
  }
}

const MUTMUT_MESSAGES = {
  1: 'Stopping early, because we could not find any test case for any mutant.\n',
};

function seededMutants() {
  return existsSync('mutants')
    ? readdirSync('mutants', { recursive: true }).filter((file) => file.endsWith('.meta'))
    : [];
}

function mutmut() {
  if (process.env.FAKE_PYTHON_LOG !== undefined) {
    appendFileSync(
      process.env.FAKE_PYTHON_LOG,
      `${JSON.stringify({ tool: 'mutmut-seeded', seeded: seededMutants() })}\n`,
    );
  }
  const data = existsSync('mutants-data.json')
    ? JSON.parse(readFileSync('mutants-data.json', 'utf8'))
    : {};
  mkdirSync('mutants', { recursive: true });
  for (const [file, { exitCodes, mutated }] of Object.entries(data)) {
    mkdirSync(path.dirname(path.join('mutants', file)), { recursive: true });
    writeFileSync(
      path.join('mutants', `${file}.meta`),
      JSON.stringify({ exit_code_by_key: exitCodes }),
    );
    writeFileSync(path.join('mutants', file), mutated);
  }
  const status = Number(lines('mutmut-exit.txt')[0] ?? 0);
  process.stdout.write(
    MUTMUT_MESSAGES[status] ?? (status === 0 ? '' : 'Failed to run clean test\n'),
  );
  process.exit(status);
}

const tools = {
  ruff,
  black,
  coverage,
  mypy,
  pyright,
  python,
  lizard,
  'lint-imports': lintImports,
  mutmut,
};
tools[tool]();
