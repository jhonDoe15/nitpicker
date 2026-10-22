import { RULES_TOOL } from './tool.mjs';

const VIA = ' via ';
const FAILURE =
  'hides what this code needs and fails only when it runs, if the registration is missing';

function describeLookup(subject) {
  const at = subject.indexOf(VIA);
  if (at === -1) {
    return `\`${subject}\` looks a service up in a dependency-injection container, which ${FAILURE}`;
  }
  const helper = subject.slice(0, at);
  const lookup = subject.slice(at + VIA.length);
  return `\`${helper}()\` looks a service up in a dependency-injection container behind a helper (\`${lookup}\`), which ${FAILURE}`;
}

export const LOCATOR_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['service-locator-lookup'],
    describe: describeLookup,
    allowed:
      'Take the dependency as an argument typed with the narrow protocol the code needs, and resolve it once in the composition root (`main.py`, a `composition_root/` package or a `create_app` factory). `@inject` with `Provide[...]` is the allowed wiring, and a lookup in an `injector.Module` or `Provider` is composition code.',
  },
];
