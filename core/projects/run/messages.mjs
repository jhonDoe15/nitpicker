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

export function shardingMessage(plan) {
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

export function undeclaredHint(entries, current = ['.']) {
  if (entries.length === 0) {
    return [];
  }
  const listed = [...current, ...entries.map(({ path }) => path)]
    .map((path) => `"${path}"`)
    .join(', ');
  const [looks, them, gate, list] = UNDECLARED_WORDS[entries.length === 1 ? 'one' : 'many'];
  return [
    `${described(entries)} ${looks}, and this run does not gate ${them} own preset. ` +
      `To ${gate} in one run, ${list} in "projects" of ${CONFIG_FILE_NAME}, ` +
      `for example "projects": [${listed}].`,
  ];
}

export function unlistedHint(folders) {
  return folders.length === 0
    ? []
    : [
        `${folders.join(', ')} now holds a project file but is not in "projects" of ` +
          `${CONFIG_FILE_NAME}, so no project gates it. Add it to "projects" to gate it.`,
      ];
}
