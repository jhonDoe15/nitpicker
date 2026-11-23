import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mts';
import { textOf } from '../../../shared/values/readers.mts';
import type { CliOptions } from '../../cli-context.mts';
import type { MonorepoPlan, WorkspaceMember } from '../project-types.mts';

type Described = WorkspaceMember & { readonly preset?: string };

const OPT_OUT = `or set "projects": [] in the root ${CONFIG_FILE_NAME} to gate the repository as one project`;

function folders(plan: MonorepoPlan): string {
  return plan.projects.map(({ path }) => path).join(', ');
}

function exampleFolder(plan: MonorepoPlan): string {
  return plan.projects.find(({ path }) => path !== '.')?.path ?? '<project>';
}

export function oneProjectCommandMessage(plan: MonorepoPlan, command: string): string {
  return (
    `nitpicker: "${command}" works on one project, and ${plan.root} is a monorepo of ` +
    `${String(plan.projects.length)} projects (${folders(plan)}). ` +
    `Run it in a project folder (cd ${exampleFolder(plan)} && nitpicker ${command} ...), ${OPT_OUT}.\n`
  );
}

function pathScopeMessage(plan: MonorepoPlan): string {
  return (
    `Paths narrow one project, and these paths belong to the top folder of a monorepo of ` +
    `${String(plan.projects.length)} projects (${folders(plan)}). Choose projects with ` +
    `--project <path>, or give paths in a project folder that has its own package.json or ` +
    `${CONFIG_FILE_NAME}.`
  );
}

function jsonMessage(plan: MonorepoPlan): string {
  return (
    `--json prints the result of one project, and ${plan.root} is a monorepo of ` +
    `${String(plan.projects.length)} projects (${folders(plan)}). Read the combined summary.json ` +
    `in the reports folder, or run --json in a project folder (cd ${exampleFolder(plan)} && ` +
    `nitpicker --json).`
  );
}

const GLOB_HINT =
  " If the shell expanded a --project glob into these paths, quote it: --project 'packages/*'.";

export function rejectPathScope(
  plan: MonorepoPlan,
  scope: unknown,
  options: Pick<CliOptions, 'paths' | 'projectPaths'> | undefined,
): void {
  if (scope !== undefined || (options?.paths ?? []).length > 0) {
    const expanded = (options?.projectPaths ?? []).length > 0 ? GLOB_HINT : '';
    throw new Error(`${pathScopeMessage(plan)}${expanded}`);
  }
}

export function rejectWholeRunOptions(
  plan: MonorepoPlan,
  options: Pick<CliOptions, 'shardCount' | 'json'>,
): void {
  if (options.shardCount !== undefined) {
    throw new Error(shardingMessage(plan));
  }
  if (options.json) {
    throw new Error(jsonMessage(plan));
  }
}

function shardingMessage(plan: MonorepoPlan): string {
  return (
    `Sharding splits the analyzers of one project, so it does not apply at the top of a monorepo of ` +
    `${String(plan.projects.length)} projects (${folders(plan)}). Run one CI job per project with ` +
    `--project <path>, shard a project from its folder (cd ${exampleFolder(plan)} && nitpicker ` +
    `--shard-count ...), ${OPT_OUT}.`
  );
}

function described(entries: readonly WorkspaceMember[]): string {
  return entries.map(({ path, origin }) => `${path} (${origin})`).join(', ');
}

const UNDECLARED_WORDS: Readonly<
  Record<'one' | 'many', readonly [string, string, string, string]>
> = {
  one: ['looks like a project of its own', 'it with its', 'gate it', 'list it'],
  many: ['look like projects of their own', 'them with their', 'gate each', 'list them'],
};

const LISTED_PROJECTS = 10;
const UNDECLARED_SHOWN = 3;
const UNDECLARED_PROJECTS_FILE = 'undeclared-projects.txt';

function moreOf(entries: readonly WorkspaceMember[], limit = LISTED_PROJECTS): string {
  const rest = entries.length - limit;
  return rest > 0 ? `, and ${String(rest)} more` : '';
}

function displayListPath(file: string, baseRoot?: string): string {
  if (baseRoot === undefined) {
    return file;
  }
  const inside = relative(resolve(baseRoot), resolve(file));
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    return file;
  }
  return inside.split(sep).join('/');
}

export function writeUndeclaredProjects(
  outputRoot: string,
  entries: readonly WorkspaceMember[],
  baseRoot?: string,
): string | undefined {
  const file = join(outputRoot, UNDECLARED_PROJECTS_FILE);
  if (entries.length <= UNDECLARED_SHOWN) {
    rmSync(file, { force: true });
    return undefined;
  }
  mkdirSync(outputRoot, { recursive: true });
  const lines = entries.map(({ path: folder, origin }) => `${folder} (${origin})`);
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return displayListPath(file, baseRoot);
}

function exampleProjects(
  current: readonly string[],
  shown: readonly WorkspaceMember[],
  hasMore: boolean,
): string {
  const existing = current.slice(0, UNDECLARED_SHOWN).map((folder) => `"${folder}"`);
  const existingMore = current.length > UNDECLARED_SHOWN ? ['...'] : [];
  const added = shown.map(({ path: folder }) => `"${folder}"`);
  const addedMore = hasMore ? ['...'] : [];
  return [...existing, ...existingMore, ...added, ...addedMore].join(', ');
}

function undeclaredOpening(
  entries: readonly WorkspaceMember[],
  shown: readonly WorkspaceMember[],
): string {
  const [looks, them] = UNDECLARED_WORDS[entries.length === 1 ? 'one' : 'many'];
  if (entries.length > UNDECLARED_SHOWN) {
    return (
      `${String(entries.length)} folders ${looks}: ` +
      `${described(shown)}${moreOf(entries, UNDECLARED_SHOWN)}. ` +
      `This run does not gate ${them} own preset.`
    );
  }
  return `${described(shown)} ${looks}, and this run does not gate ${them} own preset.`;
}

export function undeclaredHint(
  entries: readonly WorkspaceMember[],
  current: readonly string[] = ['.'],
  options?: { readonly listFile?: string | undefined },
): string[] {
  if (entries.length === 0) {
    return [];
  }
  const hasMore = entries.length > UNDECLARED_SHOWN;
  const shown = entries.slice(0, UNDECLARED_SHOWN);
  const listed = exampleProjects(current, shown, hasMore);
  const [, , gate, list] = UNDECLARED_WORDS[entries.length === 1 ? 'one' : 'many'];
  const fullList =
    hasMore && options?.listFile !== undefined ? ` Full list: ${options.listFile}.` : '';
  return [
    `${undeclaredOpening(entries, shown)} ` +
      `To ${gate} in one run, ${list} in "projects" of ${CONFIG_FILE_NAME}, ` +
      `for example "projects": [${listed}].${fullList}`,
  ];
}

export function projectsSuggestion(entries: readonly Described[]): string {
  const shown = entries.slice(0, LISTED_PROJECTS);
  const listed = shown
    .map(({ path, preset }) => `{"path": "${path}", "preset": "${textOf(preset)}"}`)
    .join(', ');
  const more = moreOf(entries) === '' ? '' : ' (the first ten; add the rest the same way)';
  return (
    `The repository holds projects of its own: ${described(shown)}${moreOf(entries)}. ` +
    `To gate each in one run, create ${CONFIG_FILE_NAME} at the repository root with ` +
    `{"projects": [${listed}]}${more}.`
  );
}

export function unlistedHint(folders: readonly string[]): string[] {
  return folders.length === 0
    ? []
    : [
        `${folders.join(', ')} now holds a project file but is not in "projects" of ` +
          `${CONFIG_FILE_NAME}, so no project gates it. Add it to "projects" to gate it.`,
      ];
}

export function submoduleHint(folders: readonly string[]): string[] {
  if (folders.length === 0) {
    return [];
  }
  const one = folders.length === 1;
  return [
    `${folders.join(', ')} ${one ? 'is a Git submodule' : 'are Git submodules'}, which this run does ` +
      `not check: run nitpicker inside ${one ? 'it' : 'each'} to gate ${one ? 'its' : 'their'} own changes.`,
  ];
}

type DerivedProject = {
  readonly path: string;
  readonly derivedSourceRoots?: readonly string[] | undefined;
};

function describedDerived(entries: readonly DerivedProject[]): string {
  return entries
    .map(
      ({ path: folder, derivedSourceRoots }) => `${folder} (${JSON.stringify(derivedSourceRoots)})`,
    )
    .join(', ');
}

export function derivedLayoutHint(projects: readonly DerivedProject[]): string[] {
  const derived = projects.filter(({ derivedSourceRoots }) => derivedSourceRoots !== undefined);
  if (derived.length === 0) {
    return [];
  }
  if (derived.length === 1) {
    const [only] = derived;
    return [
      `${only?.path ?? ''} has no src/ folder, so this run derived "layout.sourceRoots": ` +
        `${JSON.stringify(only?.derivedSourceRoots)}. Pin "layout.sourceRoots" in its ` +
        `${CONFIG_FILE_NAME} to keep it explicit.`,
    ];
  }
  const shown = derived.slice(0, UNDECLARED_SHOWN);
  const rest = derived.length - UNDECLARED_SHOWN;
  const more = rest > 0 ? `, and ${String(rest)} more` : '';
  return [
    `${String(derived.length)} packages have no src/ folder, so this run derived "layout.sourceRoots": ` +
      `${describedDerived(shown)}${more}. Pin "layout.sourceRoots" in ${CONFIG_FILE_NAME} to keep it explicit.`,
  ];
}
