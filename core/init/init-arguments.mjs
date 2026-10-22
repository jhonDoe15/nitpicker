const CI_PROVIDERS = ['github'];

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
    if (argument === '--help') {
      options.help = true;
    } else if (argument === '--agents-md') {
      options.agentsMd = true;
    } else if (argument === '--ci') {
      options.ci.push(ciProvider(remaining.next().value));
    } else {
      throw new Error(`Unknown argument for init: ${argument}. See nitpicker init --help.`);
    }
  }
  return options;
}
