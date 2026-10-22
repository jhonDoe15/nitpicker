import { appendFileSync } from 'node:fs';
import { err, exists, newCall, read } from './call.mjs';
import { black, lintImports, mypy, pyright, ruff } from './linters.mjs';
import { mutmut } from './mutmut.mjs';
import { coverage, python } from './runtime.mjs';

const FAILED_CALL_STATUS = 2;
const TOOLS = {
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

function logCall({ tool, args, cwd, env }) {
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
      ...(env.DJANGO_SETTINGS_MODULE === undefined
        ? {}
        : { djangoSettings: env.DJANGO_SETTINGS_MODULE }),
    })}\n`,
  );
}

function failureMessage(call) {
  const { tool, args } = call;
  const failures = exists(call, 'fail.json') ? JSON.parse(read(call, 'fail.json')) : {};
  const failure = failures[`${tool} ${args[0]}`] ?? failures[tool];
  const probesExecutable = tool === 'python' && args[1]?.includes('sys.executable');
  return args.includes('--version') || probesExecutable ? undefined : failure;
}

export function runFake(input) {
  const call = newCall(input);
  logCall(call);
  const failure = failureMessage(call);
  if (failure !== undefined) {
    err(call, `${failure}\n`);
    return { ...call.result, status: FAILED_CALL_STATUS };
  }
  TOOLS[call.tool](call);
  return call.result;
}
