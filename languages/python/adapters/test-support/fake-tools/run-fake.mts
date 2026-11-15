import { appendFileSync } from 'node:fs';
import type { FakeCall, FakeInput, FakeResult, FakeTool } from '../typed/fake-call.mts';
import { parseFailures } from '../typed/json-views.mts';
import { err, exists, newCall, read } from './call.mts';
import { black, lintImports, mypy, pyright, ruff } from './linters.mts';
import { mutmut } from './mutmut.mts';
import { coverage, python } from './runtime.mts';

const FAILED_CALL_STATUS = 2;
const TOOLS: Readonly<Record<string, FakeTool>> = {
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

function logCall({ tool, args, cwd, env }: FakeCall): void {
  if (env['FAKE_PYTHON_LOG'] === undefined) {
    return;
  }
  appendFileSync(
    env['FAKE_PYTHON_LOG'],
    `${JSON.stringify({
      tool,
      args,
      cwd,
      pythonPath: env['PYTHONPATH'] ?? '',
      ...(env['MYPYPATH'] === undefined ? {} : { mypyPath: env['MYPYPATH'] }),
      pytestAddopts: env['PYTEST_ADDOPTS'],
      ...(env['DJANGO_SETTINGS_MODULE'] === undefined
        ? {}
        : { djangoSettings: env['DJANGO_SETTINGS_MODULE'] }),
    })}\n`,
  );
}

function failureMessage(call: FakeCall): string | undefined {
  const { tool, args } = call;
  const failures = exists(call, 'fail.json') ? parseFailures(read(call, 'fail.json')) : {};
  const failure = failures[`${tool} ${String(args[0])}`] ?? failures[tool];
  const probesExecutable = tool === 'python' && args[1]?.includes('sys.executable');
  return args.includes('--version') || probesExecutable ? undefined : failure;
}

export function runFake(input: FakeInput): FakeResult {
  const call = newCall(input);
  logCall(call);
  const failure = failureMessage(call);
  if (failure !== undefined) {
    err(call, `${failure}\n`);
    return { ...call.result, status: FAILED_CALL_STATUS };
  }
  TOOLS[call.tool]?.(call);
  return call.result;
}
