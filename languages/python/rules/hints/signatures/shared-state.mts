import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const CACHED_CALL = /^(.+)\(\)$/u;
const KEPT_BY = /^(.+) in (\S+)$/u;

function sharedStateDescription(subject = ''): string {
  const [, name = ''] = CACHED_CALL.exec(subject) ?? [];
  if (name !== '') {
    return `\`${subject}\` returns the same cached list, dict or set to every caller, and a caller changes it, so later calls get the changed value`;
  }
  const [, value = subject, owner = 'the receiver'] = KEPT_BY.exec(subject) ?? [];
  return `\`${value}\` is a module-level collection that \`${owner}\` keeps by reference and then changes, so the shared default changes for every other user`;
}

export const SHARED_STATE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['shared-state-mutation'],
    describe: sharedStateDescription,
    allowed:
      'Hand over a copy (`copy.deepcopy(DEFAULTS)`, or `dict(DEFAULTS)` when the values are not nested) and keep shared defaults read-only (`MappingProxyType`, a tuple or a `frozenset`). A cached function returns a tuple, a `frozenset` or a `MappingProxyType`, or the caller copies the result before changing it.',
  },
];
