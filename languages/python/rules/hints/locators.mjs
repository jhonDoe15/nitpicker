import { RULES_TOOL } from './tool.mjs';

const WRAPPED = /^(.+?) via (.+) in (\S+)$/u;
const FAILURE =
  'hides what this code needs and fails only when it runs, if the registration is missing';

function describeLookup(subject) {
  const wrapped = WRAPPED.exec(subject);
  if (wrapped === null) {
    return `\`${subject}\` looks a service up in a dependency-injection container, which ${FAILURE}`;
  }
  const [, helper, lookup, file] = wrapped;
  return `\`${helper}()\` (${file}) looks a service up in a dependency-injection container behind a helper (\`${lookup}\`), which ${FAILURE}`;
}

export const LOCATOR_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['service-locator-lookup'],
    describe: describeLookup,
    allowed:
      'Take the dependency as an argument typed with the narrow protocol the code needs, and resolve it once in the composition root (`main.py`, a `composition_root/` package, a `create_app` factory, or a file listed in "layout.entryPoints"). `@inject` with `Provide[...]` is the allowed wiring, and a lookup in an `injector.Module` or `Provider` or inside a registration factory (`di[Mailer] = lambda di: Mailer(di[Config])`, `container.register(Mailer, factory=make_mailer)`) is composition code.',
  },
];
