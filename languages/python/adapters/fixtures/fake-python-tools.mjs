#!/usr/bin/env node
// Stand-in for the Python toolchain (ruff, black, coverage, python) in tests that run without
// Python. Invoked as `fake-python-tools.mjs <tool> <args...>` (see fake-toolchain.mjs for the
// wrappers). The project directory (cwd) controls it:
//   fail.json            { "<tool>" or "<tool> <subcommand>": "message" }: that call exits 2 with the
//                        message on stderr (`--version` always works)
//   violations.txt       one `rule|path|message` per line: ruff check findings
//   unformatted.txt      one path per line: files ruff format / black would reformat
//   test-exit.txt        exit status of `coverage run` (default 0); its output says the tests failed
//   junit.xml            written as the pytest JUnit report when `coverage run` passes --junitxml
//                        (default: one passing test, or one failing test when test-exit.txt is 1)
//   coverage-data.json   written as the coverage.py JSON report (default: no files)
//   unparsable.txt       one path per line: files the formatter cannot parse (it exits like the real
//                        formatter does and names them on stderr)
//   no-pytest.txt        `python -c "import pytest"` fails
//   pytest-cov.txt, xdist.txt, rerunfailures.txt  the pytest probe reports that plugin as installed
//   sources.txt          one path per line: what `ruff check --show-files` lists (default: every
//                        .py file below the project, except .venv)
//   type-errors.txt      printed by mypy as its report (exit 1 when not empty)
//   pyright.json         { generalDiagnostics } printed by pyright and basedpyright as their
//                        report, relative files made absolute (exit 1 when it has diagnostics)
//   rules.json           written by the nitpicker rules script (default: no findings)
//   structure-data.json  written as the structure metrics report of `python structure_metrics.py`
//                        (default: no functions)
//   classes-data.json    written as its classes report (default: no classes)
//   no-mutmut.txt        the mutmut version probe fails
//   mutmut-version.txt   the version the mutmut probe prints (default 3.8.0)
//   mutants-data.json    { "<source path>": { "exitCodes": {...}, "mutated": "<text>" } }: what
//                        `mutmut run` leaves in mutants/ (default: an empty mutants/)
//   mutmut-exit.txt      exit status of `mutmut run` (default 0); 1 says no mutant is covered, any
//                        other status says the clean test run failed
//   mutmut-output.txt    what `mutmut run` prints instead of those messages
//   mutmut-failing-tests.txt  one test module per line: `mutmut run` fails its stats run until
//                        PYTEST_ADDOPTS ignores each (`python -m pytest` writes junit.xml for them)
//   mutmut-only-failing.txt   with those ignored, no test is left (the stats run collects none)
//   python-version.txt   the `major.minor` the interpreter version probe prints (default 3.12)
//   import-scan.json     printed by the import scan script (default: no imports)
//   distributions.json   printed by the distribution scan script (default: Python 3.12, nothing
//                        installed)
//   lint-imports.txt     printed by lint-imports (default: a report with no broken contracts); its
//                        exit status is 1 when the text says BROKEN
// `python -c` with `sys.executable` prints `$VIRTUAL_ENV/bin/python` and always works.
// When FAKE_PYTHON_LOG is set, every call appends a JSON line with the tool, arguments, cwd,
// PYTHONPATH, MYPYPATH and PYTEST_ADDOPTS.
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
      ...(process.env.MYPYPATH === undefined ? {} : { mypyPath: process.env.MYPYPATH }),
      pytestAddopts: process.env.PYTEST_ADDOPTS,
    })}\n`,
  );
}

const failures = existsSync('fail.json') ? JSON.parse(readFileSync('fail.json', 'utf8')) : {};
const failure = failures[`${tool} ${args[0]}`] ?? failures[tool];
const probesExecutable = tool === 'python' && args[1]?.includes('sys.executable');
if (failure !== undefined && !args.includes('--version') && !probesExecutable) {
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

const JUNIT_CASE = {
  passed:
    '<testcase classname="tests.test_greet" name="test_greet" file="tests/test_greet.py" line="0" time="0.01"/>',
  failed:
    '<testcase classname="tests.test_greet" name="test_greet" file="tests/test_greet.py" line="0" time="0.01"><failure message="assert False"/></testcase>',
};

function writeJunit(status) {
  const option = args.find((argument) => argument.startsWith('--junitxml='));
  if (option === undefined) {
    return;
  }
  const report = existsSync('junit.xml')
    ? readFileSync('junit.xml', 'utf8')
    : `<testsuites><testsuite name="pytest">${JUNIT_CASE[status === 1 ? 'failed' : 'passed']}</testsuite></testsuites>`;
  writeFileSync(option.slice('--junitxml='.length), report);
}

function coverage() {
  if (args[0] === '--version') {
    process.stdout.write('Coverage.py, version 7.6.1 with C extension\n');
  } else if (args[0] === 'run') {
    const status = Number(lines('test-exit.txt')[0] ?? 0);
    writeJunit(status);
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

const PYRIGHT_VERSIONS = {
  pyright: 'pyright 1.1.390\n',
  basedpyright: 'basedpyright 1.40.2\nbased on pyright 1.1.414\n',
};

function pyright() {
  if (args[0] === '--version') {
    process.stdout.write(PYRIGHT_VERSIONS[tool]);
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
  if (args[1]?.endsWith('nitpicker_rules.py')) {
    const report = existsSync('rules.json') ? readFileSync('rules.json', 'utf8') : '[]';
    writeFileSync(args[3], report);
    return;
  }
  if (args[1]?.includes('sys.version_info')) {
    process.stdout.write(`${lines('python-version.txt')[0] ?? '3.12'}\n`);
    return;
  }
  if (args[0] === '-m' && args[1] === 'pytest') {
    writeJunit(Number(lines('test-exit.txt')[0] ?? 0));
    return;
  }
  if (args[1]?.includes('sys.executable')) {
    process.stdout.write(`${process.env.VIRTUAL_ENV ?? '/usr'}/bin/python\n`);
    return;
  }
  if (args.join(' ').includes('"mutmut"')) {
    if (existsSync('no-mutmut.txt')) {
      process.exit(1);
    }
    process.stdout.write(`${lines('mutmut-version.txt')[0] ?? '3.8.0'}\n`);
    return;
  }
  if (args.some((argument) => argument.endsWith('import-scan.py'))) {
    process.stdout.write(
      existsSync('import-scan.json') ? readFileSync('import-scan.json', 'utf8') : '{}',
    );
    return;
  }
  if (args.some((argument) => argument.endsWith('distribution-scan.py'))) {
    process.stdout.write(
      existsSync('distributions.json')
        ? readFileSync('distributions.json', 'utf8')
        : '{"python":[3,12],"stdlib":[],"modules":{},"entryPoints":[],"optional":{},"references":[]}',
    );
    return;
  }
  if (args.some((argument) => argument.includes('"import-linter"'))) {
    process.stdout.write('2.5\n');
    return;
  }
  if (args[0]?.endsWith('.py')) {
    const data = existsSync('structure-data.json')
      ? readFileSync('structure-data.json', 'utf8')
      : '[]';
    writeFileSync(args[1], data);
    if (args[4] !== undefined) {
      writeFileSync(
        args[4],
        existsSync('classes-data.json') ? readFileSync('classes-data.json', 'utf8') : '{}',
      );
    }
    return;
  }
  if (existsSync('no-pytest.txt')) {
    process.exit(1);
  }
  const flag = (file) => (existsSync(file) ? 1 : 0);
  process.stdout.write(
    `8.3.1 ${flag('pytest-cov.txt')} ${flag('xdist.txt')} ${flag('rerunfailures.txt')}\n`,
  );
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
  const failing = lines('mutmut-failing-tests.txt');
  const addopts = process.env.PYTEST_ADDOPTS ?? '';
  const ignored = failing.filter((file) => addopts.includes(`--ignore=${file}`));
  if (failing.length > 0 && ignored.length < failing.length) {
    process.stdout.write('failed to collect stats. runner returned 1\n');
    process.exit(1);
  }
  if (failing.length > 0 && existsSync('mutmut-only-failing.txt')) {
    process.stdout.write('failed to collect stats. runner returned 5\n');
    process.exit(1);
  }
  const status = Number(lines('mutmut-exit.txt')[0] ?? 0);
  process.stdout.write(
    existsSync('mutmut-output.txt')
      ? readFileSync('mutmut-output.txt', 'utf8')
      : (MUTMUT_MESSAGES[status] ?? 'Failed to run clean test\n'),
  );
  process.exit(status);
}

const tools = {
  ruff,
  black,
  coverage,
  mypy,
  pyright,
  basedpyright: pyright,
  python,
  mutmut,
  'lint-imports': lintImports,
};
tools[tool]();
