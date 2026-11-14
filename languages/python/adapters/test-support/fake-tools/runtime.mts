import type { FakeCall } from '../typed/fake-call.mts';
import { parseFacts } from '../typed/json-views.mts';
import { exists, lines, out, read, readOr, valueOf, write } from './call.mts';

const JUNIT_CASE = {
  passed:
    '<testcase classname="tests.test_greet" name="test_greet" file="tests/test_greet.py" line="0" time="0.01"/>',
  failed:
    '<testcase classname="tests.test_greet" name="test_greet" file="tests/test_greet.py" line="0" time="0.01"><failure message="assert False"/></testcase>',
};
const NO_DISTRIBUTIONS =
  '{"python":[3,12],"stdlib":[],"modules":{},"entryPoints":[],"optional":{},"references":[]}';

function writeJunit(call: FakeCall, status: number): void {
  const { args } = call;
  const pytestOption = args.find((argument: string) => argument.startsWith('--junitxml='));
  const script = args.findIndex((argument: string) => argument.endsWith('unittest_timings.py'));
  const target = pytestOption?.slice('--junitxml='.length) ?? args[script + 1] ?? '';
  if (pytestOption === undefined && script === -1) {
    return;
  }
  const report = exists(call, 'junit.xml')
    ? read(call, 'junit.xml')
    : `<testsuites><testsuite name="pytest">${status === 1 ? JUNIT_CASE.failed : JUNIT_CASE.passed}</testsuite></testsuites>`;
  write(call, target, report);
}

export function coverage(call: FakeCall): void {
  const { args, env, result } = call;
  if (args[0] === '--version') {
    out(call, 'Coverage.py, version 7.6.1 with C extension\n');
  } else if (args[0] === 'run') {
    if (exists(call, 'parallel-coverage.txt')) {
      write(call, `${String(env['COVERAGE_FILE'])}.host.1`, '');
    }
    const status = Number(lines(call, 'test-exit.txt')[0] ?? 0);
    writeJunit(call, status);
    if (env['NITPICKER_CONSOLE_REPORT'] !== undefined) {
      write(call, env['NITPICKER_CONSOLE_REPORT'], '{"entries":[]}');
    }
    out(call, status === 0 ? '1 passed\n' : '1 failed: test_greet\n');
    result.status = status;
  } else if (args[0] !== 'combine') {
    write(call, valueOf(call, '-o'), readOr(call, 'coverage-data.json', '{"files":{}}'));
  }
}

function rulesScript(call: FakeCall): boolean {
  const { args } = call;
  if (!args[1]?.endsWith('nitpicker_rules.py')) {
    return false;
  }
  const target = args[3] ?? '';
  write(call, target, readOr(call, 'rules.json', '[]'));
  if (exists(call, 'design-facts.json')) {
    write(
      call,
      target.replace(/rules\.json$/u, 'design-facts.json'),
      read(call, 'design-facts.json'),
    );
  }
  return true;
}

function versionInfo(call: FakeCall): boolean {
  if (!call.args[1]?.includes('sys.version_info')) {
    return false;
  }
  out(call, `${lines(call, 'python-version.txt')[0] ?? '3.12'}\n`);
  return true;
}

function timingsScript(call: FakeCall): boolean {
  if (!call.args[0]?.endsWith('pytest_timings.py')) {
    return false;
  }
  writeJunit(call, Number(lines(call, 'test-exit.txt')[0] ?? 0));
  return true;
}

function executablePath(call: FakeCall): boolean {
  if (!call.args[1]?.includes('sys.executable')) {
    return false;
  }
  out(call, `${call.env['VIRTUAL_ENV'] ?? '/usr'}/bin/python\n`);
  return true;
}

function mutmutProbe(call: FakeCall): boolean {
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

function importScan(call: FakeCall): boolean {
  if (!call.args.some((argument: string) => argument.endsWith('import-scan.py'))) {
    return false;
  }
  const request = parseFacts(read(call, call.args.at(-1) ?? ''));
  out(call, request.facts === true ? '{}' : readOr(call, 'import-scan.json', '{}'));
  return true;
}

function stringScan(call: FakeCall): boolean {
  if (!call.args.some((argument: string) => argument.endsWith('string-scan.py'))) {
    return false;
  }
  out(call, readOr(call, 'string-scan.json', '{}'));
  return true;
}

function distributionScan(call: FakeCall): boolean {
  if (!call.args.some((argument: string) => argument.endsWith('distribution-scan.py'))) {
    return false;
  }
  out(call, readOr(call, 'distributions.json', NO_DISTRIBUTIONS));
  return true;
}

function importLinterProbe(call: FakeCall): boolean {
  if (!call.args.some((argument: string) => argument.includes('"import-linter"'))) {
    return false;
  }
  out(call, '2.5\n');
  return true;
}

function distributionProbe(call: FakeCall): boolean {
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

function structureScript(call: FakeCall): boolean {
  const { args } = call;
  if (!args[0]?.endsWith('.py')) {
    return false;
  }
  write(call, args[1] ?? '', readOr(call, 'structure-data.json', '[]'));
  if (args[4] !== undefined) {
    write(call, args[4], readOr(call, 'classes-data.json', '{}'));
  }
  return true;
}

function pytestProbe(call: FakeCall): void {
  if (exists(call, 'no-pytest.txt')) {
    call.result.status = 1;
    return;
  }
  const plugins = [
    'pytest-cov.txt',
    'xdist.txt',
    'rerunfailures.txt',
    'pytest-django.txt',
    'pytest-retry.txt',
  ];
  const flags = plugins.map((file) => (exists(call, file) ? 1 : 0));
  out(call, `8.3.1 ${flags.join(' ')}\n`);
}

const PYTHON_CALLS: readonly ((call: FakeCall) => boolean)[] = [
  rulesScript,
  versionInfo,
  timingsScript,
  executablePath,
  mutmutProbe,
  importScan,
  stringScan,
  distributionScan,
  importLinterProbe,
  distributionProbe,
  structureScript,
];

export function python(call: FakeCall): void {
  if (!PYTHON_CALLS.some((answer) => answer(call))) {
    pytestProbe(call);
  }
}
