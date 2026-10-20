import { insideProject } from '../../../../../libraries/project-files.mjs';
import { chmodSync, writeFileSync } from 'node:fs';

const EXECUTABLE = 0o755;
const OCTAL_RADIX = 8;
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
  const target = insideProject(directory, name);
  writeFileSync(target, `${script}\n`);
  chmodSync(target, EXECUTABLE);
}

export function installRecordingPython(directory, { log }) {
  const script = [
    '#!/bin/sh',
    `echo "python3 $*" >> '${log}'`,
    'mkdir -p "$3/bin"',
    `printf '#!/bin/sh\\necho "venv-python $*" >> '"'${log}'"'\\n' > "$3/bin/python"`,
    `chmod ${EXECUTABLE.toString(OCTAL_RADIX)} "$3/bin/python"`,
  ].join('\n');
  const target = insideProject(directory, 'python3');
  writeFileSync(target, `${script}\n`);
  chmodSync(target, EXECUTABLE);
}
