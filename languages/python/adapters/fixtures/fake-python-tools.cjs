#!/usr/bin/env node
// Stand-in for the Python toolchain (ruff, black, coverage, python) in tests that run without
// Python. `runFake({ tool, args, cwd, env })` answers one call and returns
// { status, stdout, stderr }; tests that spawn through python-process.mjs get it in process (see
// fake-toolchain.mjs), and run as `fake-python-tools.cjs <tool> <args...>` it is the program the
// wrappers in a `.venv/bin` start. The project directory (cwd) controls it:
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
//   mypy-version.txt     the version mypy prints for --version (default 1.13.0)
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
//                        PYTEST_ADDOPTS ignores each (`python pytest_timings.py` writes junit.xml for them)
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
const {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} = require('node:fs');
const path = require('node:path');

const MUTMUT_MESSAGES = {
  0: '',
  1: 'Stopping early, because we could not find any test case for any mutant.\n',
};
const JUNIT_CASE = {
  passed:
    '<testcase classname="tests.test_greet" name="test_greet" file="tests/test_greet.py" line="0" time="0.01"/>',
  failed:
    '<testcase classname="tests.test_greet" name="test_greet" file="tests/test_greet.py" line="0" time="0.01"><failure message="assert False"/></testcase>',
};
const NO_DISTRIBUTIONS =
  '{"python":[3,12],"stdlib":[],"modules":{},"entryPoints":[],"optional":{},"references":[]}';
const PYRIGHT_REPORT_FAILURE = 1;
const PYRIGHT_VERSIONS = {
  pyright: 'pyright 1.1.390\n',
  basedpyright: 'basedpyright 1.40.2\nbased on pyright 1.1.414\n',
};

function runFake({ tool, args, cwd, env }) {
  const result = { status: 0, stdout: '', stderr: '' };
  const out = (text) => {
    result.stdout += text;
  };
  const err = (text) => {
    result.stderr += text;
  };
  const at = (file) => path.resolve(cwd, file);
  const exists = (file) => existsSync(at(file));
  const read = (file) => readFileSync(at(file), 'utf8');
  const write = (file, text) => writeFileSync(at(file), text);
  const lines = (file) => (exists(file) ? read(file).split('\n').filter(Boolean) : []);
  const valueOf = (flag) => args[args.indexOf(flag) + 1];

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
      out('ruff 0.9.9\n');
    } else if (args.includes('--show-files')) {
      out(
        sources()
          .map((file) => `${file}\n`)
          .join(''),
      );
    } else if (args[0] === 'check') {
      write(valueOf('--output-file'), JSON.stringify(sarif()));
      result.status = lines('violations.txt').length > 0 ? 1 : 0;
    } else {
      const files = lines('unformatted.txt');
      const unparsable = lines('unparsable.txt');
      out(files.map((file) => `--- ${file}\n+++ ${file}\n@@ -1 +1 @@\n`).join(''));
      err(
        unparsable.map((file) => `error: Failed to parse ${file}:1:7: Expected newline\n`).join(''),
      );
      result.status = unparsable.length > 0 ? 2 : files.length > 0 ? 1 : 0;
    }
  }

  function black() {
    if (args[0] === '--version') {
      out('black, 24.1.0 (compiled: yes)\n');
      return;
    }
    const files = lines('unformatted.txt');
    const unparsable = lines('unparsable.txt');
    err(
      [
        ...files.map((file) => `would reformat ${path.join(cwd, file)}\n`),
        ...unparsable.map(
          (file) => `error: cannot format ${path.join(cwd, file)}: Cannot parse: 1:6\n`,
        ),
      ].join(''),
    );
    result.status = unparsable.length > 0 ? 123 : files.length > 0 ? 1 : 0;
  }

  function writeJunit(status) {
    const option = args.find((argument) => argument.startsWith('--junitxml='));
    if (option === undefined) {
      return;
    }
    const report = exists('junit.xml')
      ? read('junit.xml')
      : `<testsuites><testsuite name="pytest">${JUNIT_CASE[status === 1 ? 'failed' : 'passed']}</testsuite></testsuites>`;
    write(option.slice('--junitxml='.length), report);
  }

  function coverage() {
    if (args[0] === '--version') {
      out('Coverage.py, version 7.6.1 with C extension\n');
    } else if (args[0] === 'run') {
      const status = Number(lines('test-exit.txt')[0] ?? 0);
      writeJunit(status);
      out(status === 0 ? '1 passed\n' : '1 failed: test_greet\n');
      result.status = status;
    } else {
      write(
        valueOf('-o'),
        exists('coverage-data.json') ? read('coverage-data.json') : '{"files":{}}',
      );
    }
  }

  function mypy() {
    if (args[0] === '--version') {
      out(`mypy ${lines('mypy-version.txt')[0] ?? '1.13.0'} (compiled: yes)\n`);
      return;
    }
    const report = exists('type-errors.txt') ? read('type-errors.txt') : '';
    out(report);
    result.status = report === '' ? 0 : 1;
  }

  function pyright() {
    if (args[0] === '--version') {
      out(PYRIGHT_VERSIONS[tool]);
      return;
    }
    const { generalDiagnostics = [] } = exists('pyright.json')
      ? JSON.parse(read('pyright.json'))
      : {};
    const absolute = generalDiagnostics.map((item) => ({
      ...item,
      file: path.resolve(cwd, item.file),
    }));
    out(JSON.stringify({ generalDiagnostics: absolute }));
    result.status = absolute.length === 0 ? 0 : PYRIGHT_REPORT_FAILURE;
  }

  function lintImports() {
    if (args[0] === '--version') {
      out('lint-imports, version 2.5\n');
      return;
    }
    const report = exists('lint-imports.txt')
      ? read('lint-imports.txt')
      : 'Contracts: 0 kept, 0 broken.\n';
    out(report);
    result.status = report.includes(' BROKEN') ? 1 : 0;
  }

  function python() {
    if (args[1]?.endsWith('nitpicker_rules.py')) {
      write(args[3], exists('rules.json') ? read('rules.json') : '[]');
      return;
    }
    if (args[1]?.includes('sys.version_info')) {
      out(`${lines('python-version.txt')[0] ?? '3.12'}\n`);
      return;
    }
    if (args[0]?.endsWith('pytest_timings.py')) {
      writeJunit(Number(lines('test-exit.txt')[0] ?? 0));
      return;
    }
    if (args[1]?.includes('sys.executable')) {
      out(`${env.VIRTUAL_ENV ?? '/usr'}/bin/python\n`);
      return;
    }
    if (args.join(' ').includes('"mutmut"')) {
      if (exists('no-mutmut.txt')) {
        result.status = 1;
        return;
      }
      out(`${lines('mutmut-version.txt')[0] ?? '3.8.0'}\n`);
      return;
    }
    if (args.some((argument) => argument.endsWith('import-scan.py'))) {
      out(exists('import-scan.json') ? read('import-scan.json') : '{}');
      return;
    }
    if (args.some((argument) => argument.endsWith('distribution-scan.py'))) {
      out(exists('distributions.json') ? read('distributions.json') : NO_DISTRIBUTIONS);
      return;
    }
    if (args.some((argument) => argument.includes('"import-linter"'))) {
      out('2.5\n');
      return;
    }
    if (args[0]?.endsWith('.py')) {
      write(args[1], exists('structure-data.json') ? read('structure-data.json') : '[]');
      if (args[4] !== undefined) {
        write(args[4], exists('classes-data.json') ? read('classes-data.json') : '{}');
      }
      return;
    }
    if (exists('no-pytest.txt')) {
      result.status = 1;
      return;
    }
    const flag = (file) => (exists(file) ? 1 : 0);
    out(`8.3.1 ${flag('pytest-cov.txt')} ${flag('xdist.txt')} ${flag('rerunfailures.txt')}\n`);
  }

  function seededMutants() {
    return existsSync(at('mutants'))
      ? readdirSync(at('mutants'), { recursive: true }).filter((file) => file.endsWith('.meta'))
      : [];
  }

  function mutmut() {
    if (env.FAKE_PYTHON_LOG !== undefined) {
      appendFileSync(
        env.FAKE_PYTHON_LOG,
        `${JSON.stringify({ tool: 'mutmut-seeded', seeded: seededMutants() })}\n`,
      );
    }
    const data = exists('mutants-data.json') ? JSON.parse(read('mutants-data.json')) : {};
    mkdirSync(at('mutants'), { recursive: true });
    for (const [file, { exitCodes, mutated }] of Object.entries(data)) {
      mkdirSync(path.dirname(path.join(at('mutants'), file)), { recursive: true });
      write(path.join('mutants', `${file}.meta`), JSON.stringify({ exit_code_by_key: exitCodes }));
      write(path.join('mutants', file), mutated);
    }
    const failing = lines('mutmut-failing-tests.txt');
    const addopts = env.PYTEST_ADDOPTS ?? '';
    const ignored = failing.filter((file) => addopts.includes(`--ignore=${file}`));
    if (failing.length > 0 && ignored.length < failing.length) {
      out('failed to collect stats. runner returned 1\n');
      result.status = 1;
      return;
    }
    if (failing.length > 0 && exists('mutmut-only-failing.txt')) {
      out('failed to collect stats. runner returned 5\n');
      result.status = 1;
      return;
    }
    const status = Number(lines('mutmut-exit.txt')[0] ?? 0);
    out(
      exists('mutmut-output.txt')
        ? read('mutmut-output.txt')
        : (MUTMUT_MESSAGES[status] ?? 'Failed to run clean test\n'),
    );
    result.status = status;
  }

  function logCall() {
    if (env.FAKE_PYTHON_LOG === undefined) {
      return;
    }
    appendFileSync(
      env.FAKE_PYTHON_LOG,
      `${JSON.stringify({
        tool,
        args,
        cwd,
        pythonPath: env.PYTHONPATH ?? '',
        ...(env.MYPYPATH === undefined ? {} : { mypyPath: env.MYPYPATH }),
        pytestAddopts: env.PYTEST_ADDOPTS,
      })}\n`,
    );
  }

  function failureMessage() {
    const failures = exists('fail.json') ? JSON.parse(read('fail.json')) : {};
    const failure = failures[`${tool} ${args[0]}`] ?? failures[tool];
    const probesExecutable = tool === 'python' && args[1]?.includes('sys.executable');
    return args.includes('--version') || probesExecutable ? undefined : failure;
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
  logCall();
  const failure = failureMessage();
  if (failure !== undefined) {
    err(`${failure}\n`);
    return { ...result, status: 2 };
  }
  tools[tool]();
  return result;
}

module.exports = { runFake };

if (require.main === module) {
  const [tool, ...args] = process.argv.slice(2);
  const { status, stdout, stderr } = runFake({
    tool,
    args,
    cwd: process.cwd(),
    env: process.env,
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = status;
}
