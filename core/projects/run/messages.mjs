import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';

const OPT_OUT = `or set "projects": [] in the root ${CONFIG_FILE_NAME} to gate the repository as one project`;

function folders(plan) {
  return plan.projects.map(({ path }) => path).join(', ');
}

function exampleFolder(plan) {
  return plan.projects.find(({ path }) => path !== '.')?.path ?? '<project>';
}

export function oneProjectCommandMessage(plan, command) {
  return (
    `nitpicker: "${command}" works on one project, and ${plan.root} is a monorepo of ` +
    `${String(plan.projects.length)} projects (${folders(plan)}). ` +
    `Run it in a project folder (cd ${exampleFolder(plan)} && nitpicker ${command} ...), ${OPT_OUT}.\n`
  );
}

function pathScopeMessage(plan) {
  return (
    `Paths narrow one project, and these paths belong to the top folder of a monorepo of ` +
    `${String(plan.projects.length)} projects (${folders(plan)}). Choose projects with ` +
    `--project <path>, or give paths in a project folder that has its own package.json or ` +
    `${CONFIG_FILE_NAME}.`
  );
}

function jsonMessage(plan) {
  return (
    `--json prints the result of one project, and ${plan.root} is a monorepo of ` +
    `${String(plan.projects.length)} projects (${folders(plan)}). Read the combined summary.json ` +
    `in the reports folder, or run --json in a project folder (cd ${exampleFolder(plan)} && ` +
    `nitpicker --json).`
  );
}

const GLOB_HINT =
  " If the shell expanded a --project glob into these paths, quote it: --project 'packages/*'.";

export function rejectPathScope(plan, scope, options) {
  if (scope !== undefined || (options?.paths ?? []).length > 0) {
    const expanded = (options?.projectPaths ?? []).length > 0 ? GLOB_HINT : '';
    throw new Error(`${pathScopeMessage(plan)}${expanded}`);
  }
}

export function rejectWholeRunOptions(plan, options) {
  if (options.shardCount !== undefined) {
    throw new Error(shardingMessage(plan));
  }
  if (options.json === true) {
    throw new Error(jsonMessage(plan));
  }
}

function shardingMessage(plan) {
  return (
    `Sharding splits the analyzers of one project, so it does not apply at the top of a monorepo of ` +
    `${String(plan.projects.length)} projects (${folders(plan)}). Run one CI job per project with ` +
    `--project <path>, shard a project from its folder (cd ${exampleFolder(plan)} && nitpicker ` +
    `--shard-count ...), ${OPT_OUT}.`
  );
}

function described(entries) {
  return entries.map(({ path, origin }) => `${path} (${origin})`).join(', ');
}

const UNDECLARED_WORDS = {
  one: ['looks like a project of its own', 'it with its', 'gate it', 'list it'],
  many: ['look like projects of their own', 'them with their', 'gate each', 'list them'],
};

const LISTED_PROJECTS = 10;

function moreOf(entries) {
  const rest = entries.length - LISTED_PROJECTS;
  return rest > 0 ? `, and ${String(rest)} more` : '';
}

export function undeclaredHint(entries, current = ['.']) {
  if (entries.length === 0) {
    return [];
  }
  const shown = entries.slice(0, LISTED_PROJECTS);
  const listed = [...current, ...shown.map(({ path }) => path)]
    .map((path) => `"${path}"`)
    .join(', ');
  const [looks, them, gate, list] = UNDECLARED_WORDS[entries.length === 1 ? 'one' : 'many'];
  return [
    `${described(shown)}${moreOf(entries)} ${looks}, and this run does not gate ${them} own preset. ` +
      `To ${gate} in one run, ${list} in "projects" of ${CONFIG_FILE_NAME}, ` +
      `for example "projects": [${listed}].`,
  ];
}

export function projectsSuggestion(entries) {
  const shown = entries.slice(0, LISTED_PROJECTS);
  const listed = shown
    .map(({ path, preset }) => `{"path": "${path}", "preset": "${preset}"}`)
    .join(', ');
  const more = moreOf(entries) === '' ? '' : ' (the first ten; add the rest the same way)';
  return (
    `The repository holds projects of its own: ${described(shown)}${moreOf(entries)}. ` +
    `To gate each in one run, create ${CONFIG_FILE_NAME} at the repository root with ` +
    `{"projects": [${listed}]}${more}.`
  );
}

export function unlistedHint(folders) {
  return folders.length === 0
    ? []
    : [
        `${folders.join(', ')} now holds a project file but is not in "projects" of ` +
          `${CONFIG_FILE_NAME}, so no project gates it. Add it to "projects" to gate it.`,
      ];
}
