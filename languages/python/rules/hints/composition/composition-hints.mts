import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const BRANCH_ADVICE =
  'The composition root only wires: it builds the objects and passes them in. Move the decision into the feature (a factory in its own module), or choose the implementation by configuration through a lookup table (`BACKENDS = {"memory": MemoryStore, "redis": RedisStore}` then `BACKENDS[settings.store]()`). `if __name__ == "__main__":`, `if TYPE_CHECKING:` and a guard that only raises (`if url is None: raise RuntimeError("DATABASE_URL is missing")`) may stay. An exception fits only when this branch belongs here.';
const BRANCH_FORMS: Readonly<Record<string, string>> = {
  if: 'an `if`',
  'conditional expression': 'a conditional expression',
  match: 'a `match`',
  loop: 'a loop',
  'default value': 'a default value (`or` with a literal or a call)',
};
const RESOURCE_ADVICE =
  'Build the engine, pool, client or app once in the composition root (`main.py`, `server.py` or `composition_root.py` of the root package, or a `composition_root/` package) and pass it to the code that uses it as a parameter or constructor argument. An exception fits only for a script or tool outside the application that owns its own short-lived resource.';

export const COMPOSITION_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['branch-in-composition-root'],
    describe: (subject: string) =>
      `The composition root contains ${BRANCH_FORMS[subject] ?? subject}, but it should only wire features together`,
    allowed: BRANCH_ADVICE,
  },
  {
    tool: RULES_TOOL,
    rules: ['managed-resource-outside-composition-root'],
    describe: (subject: string) =>
      `\`${subject}\` builds a managed resource (a connection pool, client, engine or app) outside the composition root`,
    allowed: RESOURCE_ADVICE,
  },
];
