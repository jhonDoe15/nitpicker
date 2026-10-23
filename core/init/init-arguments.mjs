const CI_PROVIDERS = ['github'];
const HELP = '--help';
const AGENTS_MD = '--agents-md';
const CI = '--ci';

export const INIT_OPTIONS = [AGENTS_MD, CI, HELP];

function ciProvider(value) {
  if (!CI_PROVIDERS.includes(value)) {
    throw new Error(`--ci takes one of: ${CI_PROVIDERS.join(', ')}`);
  }
  return value;
}

export function parseInitArguments(initArguments) {
  const options = { help: false, agentsMd: false, ci: [] };
  const remaining = initArguments.values();
  for (const argument of remaining) {
    if (argument === HELP) {
      options.help = true;
    } else if (argument === AGENTS_MD) {
      options.agentsMd = true;
    } else if (argument === CI) {
      options.ci.push(ciProvider(remaining.next().value));
    } else {
      throw new Error(`Unknown argument for init: ${argument}. See nitpicker init --help.`);
    }
  }
  return options;
}
