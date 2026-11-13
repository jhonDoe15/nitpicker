type InitOptions = { help: boolean; agentsMd: boolean; readonly ci: string[] };

const CI_PROVIDERS: readonly string[] = ['github'];
const HELP = '--help';
const AGENTS_MD = '--agents-md';
const CI = '--ci';

export const INIT_OPTIONS = [AGENTS_MD, CI, HELP];

function ciProvider(value: string | undefined): string {
  if (value === undefined || !CI_PROVIDERS.includes(value)) {
    throw new Error(`--ci takes one of: ${CI_PROVIDERS.join(', ')}`);
  }
  return value;
}

export function parseInitArguments(initArguments: readonly string[]): InitOptions {
  const options: InitOptions = { help: false, agentsMd: false, ci: [] };
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
