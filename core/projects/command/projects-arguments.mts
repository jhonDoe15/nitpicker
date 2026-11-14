import { takeOptionValue, unknownArgumentError } from '../../diff/comparison/cli.mts';

export type ProjectsOptions = {
  readonly all: boolean;
  readonly json: boolean;
  readonly help: boolean;
  readonly staged: boolean;
  readonly baseRef?: string;
  readonly projectPaths: readonly string[];
};

export const PROJECTS_USAGE =
  'nitpicker projects [--base <ref>] [--all] [--project <path>]... [--json] [--help]';
export const PROJECTS_OPTIONS = ['--base', '--all', '--project', '--json', '--help'];

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

export function parseProjectsArguments(commandArguments: readonly string[]): ProjectsOptions {
  let baseRef: string | undefined;
  const flags = { all: false, json: false, help: false };
  const projectPaths: string[] = [];
  const remaining = commandArguments.values();
  for (const argument of remaining) {
    if (argument === '--base') {
      baseRef = takeOptionValue(remaining, argument);
    } else if (argument === '--project') {
      projectPaths.push(takeOptionValue(remaining, argument));
    } else {
      const flag = FLAG_NAMES.get(argument);
      if (flag === undefined) {
        throw unknownArgumentError(argument, PROJECTS_OPTIONS, `Usage: ${PROJECTS_USAGE}`);
      }
      flags[flag] = true;
    }
  }
  return { ...flags, staged: false, projectPaths, ...(baseRef === undefined ? {} : { baseRef }) };
}
