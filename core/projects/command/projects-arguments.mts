import { takeOptionValue, unknownArgumentError } from '../../diff/comparison/cli.mts';
import { PROJECTS_USAGE } from '../../help/usage-text.mts';

export type ProjectsOptions = {
  readonly all: boolean;
  readonly json: boolean;
  readonly help: boolean;
  readonly staged: boolean;
  readonly baseRef?: string;
  readonly projectPaths: readonly string[];
};

const PROJECTS_OPTIONS = ['--base', '--all', '--project', '--json', '--help'];

const FLAG_NAMES = new Map<string, 'all' | 'json' | 'help'>([
  ['--all', 'all'],
  ['--json', 'json'],
  ['--help', 'help'],
]);

const PROJECTS_HELP = [
  `Usage: ${PROJECTS_USAGE}`,
  '',
  'Lists the projects of the repository and the ones a run would check, without running them.',
  '',
  'Options:',
  '  --base <ref>      Compare with this ref to pick the projects a change selects.',
  '  --all             Select every project, as nitpicker --all does.',
  '  --project <path>  Select only this project (repeatable), as a run with --project does.',
  '  --json            Print JSON: "matrix" for a CI job matrix and "projects" with the details.',
  '  --help            Print this help.',
  '',
].join('\n');

export function projectsHelp(): string {
  return PROJECTS_HELP;
}

type Parsed = {
  readonly flags: Record<'all' | 'json' | 'help', boolean>;
  readonly projectPaths: string[];
  baseRef: string | undefined;
};

function readFlag(argument: string, parsed: Parsed): void {
  const flag = FLAG_NAMES.get(argument);
  if (flag === undefined) {
    throw unknownArgumentError(argument, PROJECTS_OPTIONS, `Usage: ${PROJECTS_USAGE}`);
  }
  parsed.flags[flag] = true;
}

export function parseProjectsArguments(commandArguments: readonly string[]): ProjectsOptions {
  const parsed: Parsed = {
    flags: { all: false, json: false, help: false },
    projectPaths: [],
    baseRef: undefined,
  };
  const remaining = commandArguments.values();
  for (const argument of remaining) {
    if (argument === '--base') {
      parsed.baseRef = takeOptionValue(remaining, argument);
    } else if (argument === '--project') {
      parsed.projectPaths.push(takeOptionValue(remaining, argument));
    } else {
      readFlag(argument, parsed);
    }
  }
  const { flags, projectPaths, baseRef } = parsed;
  return { ...flags, staged: false, projectPaths, ...(baseRef === undefined ? {} : { baseRef }) };
}
