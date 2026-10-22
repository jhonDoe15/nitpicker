import { exists, lines, out, read, readOr, valueOf, write } from './call.mjs';

const JUNIT_CASE = {
  passed:
    '<testcase classname="tests.test_greet" name="test_greet" file="tests/test_greet.py" line="0" time="0.01"/>',
  failed:
    '<testcase classname="tests.test_greet" name="test_greet" file="tests/test_greet.py" line="0" time="0.01"><failure message="assert False"/></testcase>',
};
const NO_DISTRIBUTIONS =
  '{"python":[3,12],"stdlib":[],"modules":{},"entryPoints":[],"optional":{},"references":[]}';

function writeJunit(call, status) {
  const { args } = call;
  const pytestOption = args.find((argument) => argument.startsWith('--junitxml='));
  const script = args.findIndex((argument) => argument.endsWith('unittest_timings.py'));
  const target = pytestOption?.slice('--junitxml='.length) ?? args[script + 1];
  if (pytestOption === undefined && script === -1) {
    return;
  }
  const report = exists(call, 'junit.xml')
    ? read(call, 'junit.xml')
    : `<testsuites><testsuite name="pytest">${JUNIT_CASE[status === 1 ? 'failed' : 'passed']}</testsuite></testsuites>`;
  write(call, target, report);
}

export function coverage(call) {
  const { args, env, result } = call;
  if (args[0] === '--version') {
    out(call, 'Coverage.py, version 7.6.1 with C extension\n');
  } else if (args[0] === 'run') {
    if (exists(call, 'parallel-coverage.txt')) {
      write(call, `${env.COVERAGE_FILE}.host.1`, '');
    }
    const status = Number(lines(call, 'test-exit.txt')[0] ?? 0);
    writeJunit(call, status);
    out(call, status === 0 ? '1 passed\n' : '1 failed: test_greet\n');
    result.status = status;
  } else if (args[0] !== 'combine') {
    write(call, valueOf(call, '-o'), readOr(call, 'coverage-data.json', '{"files":{}}'));
  }
}

function rulesScript(call) {
  const { args } = call;
  if (!args[1]?.endsWith('nitpicker_rules.py')) {
    return false;
  }
  write(call, args[3], readOr(call, 'rules.json', '[]'));
  return true;
}

function versionInfo(call) {
  if (!call.args[1]?.includes('sys.version_info')) {
    return false;
  }
  out(call, `${lines(call, 'python-version.txt')[0] ?? '3.12'}\n`);
  return true;
}

function timingsScript(call) {
  if (!call.args[0]?.endsWith('pytest_timings.py')) {
    return false;
  }
  writeJunit(call, Number(lines(call, 'test-exit.txt')[0] ?? 0));
  return true;
}

function executablePath(call) {
  if (!call.args[1]?.includes('sys.executable')) {
    return false;
  }
  out(call, `${call.env.VIRTUAL_ENV ?? '/usr'}/bin/python\n`);
  return true;
}

function mutmutProbe(call) {
  if (!call.args.join(' ').includes('"mutmut"')) {
    return false;
  }
  if (exists(call, 'no-mutmut.txt')) {
    call.result.status = 1;
  } else {
    out(call, `${lines(call, 'mutmut-version.txt')[0] ?? '3.8.0'}\n`);
  }
  return true;
}

function importScan(call) {
  if (!call.args.some((argument) => argument.endsWith('import-scan.py'))) {
    return false;
  }
  out(call, readOr(call, 'import-scan.json', '{}'));
  return true;
}

function distributionScan(call) {
  if (!call.args.some((argument) => argument.endsWith('distribution-scan.py'))) {
    return false;
  }
  out(call, readOr(call, 'distributions.json', NO_DISTRIBUTIONS));
  return true;
}

function importLinterProbe(call) {
  if (!call.args.some((argument) => argument.includes('"import-linter"'))) {
    return false;
  }
  out(call, '2.5\n');
  return true;
}

function distributionProbe(call) {
  const distribution = /m\.version\("([\w-]+)"\)/.exec(call.args.join(' '))?.[1];
  if (distribution === undefined) {
    return false;
  }
  if (exists(call, `no-${distribution}.txt`)) {
    call.result.status = 1;
  } else {
    out(call, '5.1.0\n');
  }
  return true;
}

function structureScript(call) {
  const { args } = call;
  if (!args[0]?.endsWith('.py')) {
    return false;
  }
  write(call, args[1], readOr(call, 'structure-data.json', '[]'));
  if (args[4] !== undefined) {
    write(call, args[4], readOr(call, 'classes-data.json', '{}'));
  }
  return true;
}

function pytestProbe(call) {
  if (exists(call, 'no-pytest.txt')) {
    call.result.status = 1;
    return;
  }
  const plugins = ['pytest-cov.txt', 'xdist.txt', 'rerunfailures.txt', 'pytest-django.txt'];
  const flags = plugins.map((file) => (exists(call, file) ? 1 : 0));
  out(call, `8.3.1 ${flags.join(' ')}\n`);
}

const PYTHON_CALLS = [
  rulesScript,
  versionInfo,
  timingsScript,
  executablePath,
  mutmutProbe,
  importScan,
  distributionScan,
  importLinterProbe,
  distributionProbe,
  structureScript,
];

export function python(call) {
  if (!PYTHON_CALLS.some((answer) => answer(call))) {
    pytestProbe(call);
  }
}
