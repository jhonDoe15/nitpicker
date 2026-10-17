import { chmodSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const EXECUTABLE = 0o755;
const VARIABLES = '^(UV_PROJECT_ENVIRONMENT|POETRY_[A-Z_]+|PDM_[A-Z_]+|PIPENV_[A-Z_]+)=';

export function installRecordingManager(
  directory,
  name,
  { log, status = 0, stderr = '', createsEnvironment = true },
) {
  const script = [
    '#!/bin/sh',
    `{ echo "${name} $*"; echo "cwd=$PWD"; env | grep -E '${VARIABLES}' | sort; } >> '${log}'`,
    createsEnvironment ? 'mkdir -p "$PWD/.venv/bin"' : ':',
    `echo '${stderr}' >&2`,
    `exit ${String(status)}`,
  ].join('\n');
  const target = path.join(directory, name);
  writeFileSync(target, `${script}\n`);
  chmodSync(target, EXECUTABLE);
}

export function installRecordingPython(directory, { log }) {
  const script = [
    '#!/bin/sh',
    `echo "python3 $*" >> '${log}'`,
    'mkdir -p "$3/bin"',
    `printf '#!/bin/sh\\necho "venv-python $*" >> '"'${log}'"'\\n' > "$3/bin/python"`,
    `chmod ${EXECUTABLE.toString(8)} "$3/bin/python"`,
  ].join('\n');
  const target = path.join(directory, 'python3');
  writeFileSync(target, `${script}\n`);
  chmodSync(target, EXECUTABLE);
}
