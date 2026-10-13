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
//   unparsable.txt       one path per line: files the formatter cannot parse (it exits like the real
//                        formatter does and names them on stderr)
//   no-pytest.txt        `python -c "import pytest"` fails
//   pytest-cov.txt, xdist.txt  the pytest probe reports that plugin as installed
//   no-mutmut.txt        the mutmut version probe fails
//   mutmut-version.txt   the version the mutmut probe prints (default 3.8.0)
//   import-graph.json    { "<source path>": ["<imported source path>"] }: what the import scan prints
//   mutants-data.json    { "<source path>": { "exitCodes": {...}, "mutated": "<text>" } }: what
//                        `mutmut run` leaves in mutants/ (default: an empty mutants/)
//   mutmut-exit.txt      exit status of `mutmut run` (default 0); 1 says no mutant is covered, any
//                        other status says the clean test run failed
//   mutmut-output.txt    what `mutmut run` prints instead of those messages
// When FAKE_PYTHON_LOG is set, every call appends a JSON line with the tool, arguments, cwd and
// PYTHONPATH.
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
      pytestAddopts: process.env.PYTEST_ADDOPTS,
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

function ruff() {
  if (args[0] === '--version') {
    process.stdout.write('ruff 0.9.9\n');
  } else if (args[0] === 'check') {
    writeFileSync(valueOf('--output-file'), JSON.stringify(sarif()));
    process.exit(lines('violations.txt').length > 0 ? 1 : 0);
  } else {
    const files = lines('unformatted.txt');
    const unparsable = lines('unparsable.txt');
    process.stdout.write(files.map((file) => `--- ${file}\n+++ ${file}\n@@ -1 +1 @@\n`).join(''));
    process.stderr.write(
      unparsable.map((file) => `error: Failed to parse ${file}:1:7: Expected newline\n`).join(''),
    );
    process.exit(unparsable.length > 0 ? 2 : files.length > 0 ? 1 : 0);
  }
}

function black() {
  if (args[0] === '--version') {
    process.stdout.write('black, 24.1.0 (compiled: yes)\n');
    return;
  }
  const files = lines('unformatted.txt');
  const unparsable = lines('unparsable.txt');
  process.stderr.write(
    [
      ...files.map((file) => `would reformat ${path.join(cwd, file)}\n`),
      ...unparsable.map(
        (file) => `error: cannot format ${path.join(cwd, file)}: Cannot parse: 1:6\n`,
      ),
    ].join(''),
  );
  process.exit(unparsable.length > 0 ? 123 : files.length > 0 ? 1 : 0);
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

function importGraph() {
  const graph = existsSync('import-graph.json')
    ? JSON.parse(readFileSync('import-graph.json', 'utf8'))
    : {};
  const absolute = (file) => path.join(cwd, file);
  return Object.fromEntries(
    Object.entries(graph).map(([file, imported]) => [absolute(file), imported.map(absolute)]),
  );
}

function python() {
  if (args.join(' ').includes('"mutmut"')) {
    if (existsSync('no-mutmut.txt')) {
      process.exit(1);
    }
    process.stdout.write(`${lines('mutmut-version.txt')[0] ?? '3.8.0'}\n`);
    return;
  }
  if (args.join(' ').includes('ast.parse')) {
    process.stdout.write(`${JSON.stringify(importGraph())}\n`);
    return;
  }
  if (existsSync('no-pytest.txt')) {
    process.exit(1);
  }
  const flag = (file) => (existsSync(file) ? 1 : 0);
  process.stdout.write(`8.3.1 ${flag('pytest-cov.txt')} ${flag('xdist.txt')}\n`);
}

const MUTMUT_MESSAGES = {
  0: '',
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
    existsSync('mutmut-output.txt')
      ? readFileSync('mutmut-output.txt', 'utf8')
      : (MUTMUT_MESSAGES[status] ?? 'Failed to run clean test\n'),
  );
  process.exit(status);
}

const tools = { ruff, black, coverage, python, mutmut };
tools[tool]();
