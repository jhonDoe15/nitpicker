import { appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { at, exists, lines, out, read, write } from './call.mjs';

const MUTMUT_MESSAGES = {
  0: '',
  1: 'Stopping early, because we could not find any test case for any mutant.\n',
};

function seededMutants(call) {
  return exists(call, 'mutants')
    ? readdirSync(at(call, 'mutants'), { recursive: true }).filter((file) => file.endsWith('.meta'))
    : [];
}

export function mutmut(call) {
  const { env, result } = call;
  if (env.FAKE_PYTHON_LOG !== undefined) {
    appendFileSync(
      env.FAKE_PYTHON_LOG,
      `${JSON.stringify({ tool: 'mutmut-seeded', seeded: seededMutants(call) })}\n`,
    );
  }
  const data = exists(call, 'mutants-data.json') ? JSON.parse(read(call, 'mutants-data.json')) : {};
  mkdirSync(at(call, 'mutants'), { recursive: true });
  for (const [file, { exitCodes, mutated }] of Object.entries(data)) {
    mkdirSync(path.dirname(path.join(at(call, 'mutants'), file)), { recursive: true });
    write(
      call,
      path.join('mutants', `${file}.meta`),
      JSON.stringify({ exit_code_by_key: exitCodes }),
    );
    write(call, path.join('mutants', file), mutated);
  }
  const failing = lines(call, 'mutmut-failing-tests.txt');
  const addopts = env.PYTEST_ADDOPTS ?? '';
  const ignored = failing.filter((file) => addopts.includes(`--ignore=${file}`));
  if (failing.length > 0 && ignored.length < failing.length) {
    out(call, 'failed to collect stats. runner returned 1\n');
    result.status = 1;
    return;
  }
  if (failing.length > 0 && exists(call, 'mutmut-only-failing.txt')) {
    out(call, 'failed to collect stats. runner returned 5\n');
    result.status = 1;
    return;
  }
  const status = Number(lines(call, 'mutmut-exit.txt')[0] ?? 0);
  out(
    call,
    exists(call, 'mutmut-output.txt')
      ? read(call, 'mutmut-output.txt')
      : (MUTMUT_MESSAGES[status] ?? 'Failed to run clean test\n'),
  );
  result.status = status;
}
