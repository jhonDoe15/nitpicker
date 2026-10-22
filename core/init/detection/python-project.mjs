import { hasProjectFile } from '../support/inside-project.mjs';
import { detectEnvironment } from '../../../languages/python/adapters/execution/python-environment.mjs';
import {
  detectFormatter,
  detectTypeCheckers,
  readProjectHints,
} from '../../../languages/python/adapters/execution/python-project.mjs';
import { detectTestRunner } from '../../../languages/python/adapters/execution/python-test-runner.mjs';

const DEFAULT_TYPE_CHECKER = 'mypy';
const POETRY_TABLE = /^\s*\[tool\.poetry[\].]/mu;
const UV_TABLE = /^\s*\[tool\.uv[\].]/mu;
const PROJECT_TOOLS = [
  ['uv', (hints) => UV_TABLE.test(hints)],
  ['poetry', (hints) => POETRY_TABLE.test(hints)],
];
const FILE_TOOLS = [['pdm', 'pdm.lock']];

function projectTool(projectRoot, hints) {
  const environment = detectEnvironment(projectRoot).kind;
  if (environment !== 'path' && environment !== 'venv') {
    return environment;
  }
  const fromFile = FILE_TOOLS.find(([, file]) => hasProjectFile(projectRoot, file));
  const fromHints = PROJECT_TOOLS.find(([, declares]) => declares(hints));
  return fromFile?.[0] ?? fromHints?.[0] ?? environment;
}

export function describePythonProject(projectRoot) {
  const hints = readProjectHints(projectRoot);
  const tool = projectTool(projectRoot, hints);
  const testRunner = detectTestRunner(projectRoot);
  const typeChecker = detectTypeCheckers(projectRoot)[0] ?? DEFAULT_TYPE_CHECKER;
  return {
    preset: 'python',
    family: 'python',
    tool,
    testRunner,
    typeChecker,
    notes: [],
    summary: ['Python', tool, testRunner, typeChecker, detectFormatter(projectRoot)].join(', '),
  };
}
