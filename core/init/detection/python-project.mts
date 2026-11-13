import { hasProjectFile } from '../support/inside-project.mts';
import { detectEnvironment } from '../../../languages/python/adapters/execution/python-environment.mjs';
import {
  detectFormatter,
  detectTypeCheckers,
  readProjectHints,
} from '../../../languages/python/adapters/execution/python-project.mjs';
import { detectTestRunner } from '../../../languages/python/adapters/execution/python-test-runner.mjs';
import type { InitProject } from '../init-types.mts';
import { textOf } from '../../../shared/values/readers.mts';

const environmentIn: (projectRoot: string) => { readonly kind: unknown } = detectEnvironment;
const hintsIn: (projectRoot: string) => string = readProjectHints;
const runnerIn: (projectRoot: string) => unknown = detectTestRunner;
const typeCheckersIn: (projectRoot: string) => readonly string[] = detectTypeCheckers;
const formatterIn: (projectRoot: string) => unknown = detectFormatter;

const DEFAULT_TYPE_CHECKER = 'mypy';
const POETRY_TABLE = /^\s*\[tool\.poetry[\].]/mu;
const UV_TABLE = /^\s*\[tool\.uv[\].]/mu;
const PROJECT_TOOLS: readonly (readonly [string, (hints: string) => boolean])[] = [
  ['uv', (hints) => UV_TABLE.test(hints)],
  ['poetry', (hints) => POETRY_TABLE.test(hints)],
];
const FILE_TOOLS: readonly (readonly [string, string])[] = [['pdm', 'pdm.lock']];

const PIP = 'pip';
const PIP_ENVIRONMENTS: ReadonlySet<unknown> = new Set(['path', 'venv']);

function projectTool(projectRoot: string, hints: string): string {
  const environment = environmentIn(projectRoot).kind;
  if (!PIP_ENVIRONMENTS.has(environment)) {
    return textOf(environment);
  }
  const fromFile = FILE_TOOLS.find(([, file]) => hasProjectFile(projectRoot, file));
  const fromHints = PROJECT_TOOLS.find(([, declares]) => declares(hints));
  return fromFile?.[0] ?? fromHints?.[0] ?? PIP;
}

export function describePythonProject(projectRoot: string): InitProject {
  const hints = hintsIn(projectRoot);
  const tool = projectTool(projectRoot, hints);
  const testRunner = textOf(runnerIn(projectRoot));
  const typeChecker = typeCheckersIn(projectRoot)[0] ?? DEFAULT_TYPE_CHECKER;
  return {
    preset: 'python',
    family: 'python',
    tool,
    testRunner,
    typeChecker,
    notes: [],
    summary: ['Python', tool, testRunner, typeChecker, formatterIn(projectRoot)].join(', '),
  };
}
