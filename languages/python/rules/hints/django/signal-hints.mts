import { RULES_TOOL } from '../tool.mts';
import { parseEffect } from '../effects/subject.mts';
import type { RuleHint } from '../hint-types.mts';

function saveOnlyDescribe(subject: string): string {
  const { path, fields } = parseEffect(subject);
  const [name = '<receiver>'] = path;
  const [sender = '<model>', signal = 'post_save', via = 'the cache'] = fields;
  return `\`${name}\` clears the cache (\`${via}\`) on \`${signal}\` of \`${sender}\`, but no \`post_delete\` receiver of \`${sender}\` clears it: deleting a row leaves its stale entries, so a removed ${sender} keeps applying until they expire`;
}

function neverConnectedDescribe(subject: string): string {
  const { path, fields } = parseEffect(subject);
  const [name = '<receiver>'] = path;
  const [signal = 'post_save', module = '<module>'] = fields;
  return `\`${name}\` is a \`${signal}\` receiver in \`${module}\`, which no other module of the project imports: Django never runs that module, so the receiver is never connected and the signal does nothing`;
}

export const SIGNAL_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['cache-invalidated-on-save-only'],
    describe: saveOnlyDescribe,
    allowed:
      'Connect the same function to the delete signal too (`@receiver(post_delete, sender=Model)` next to `@receiver(post_save, sender=Model)`), or add a `post_delete` receiver that calls the same invalidation; use `m2m_changed` for a cache built from a many-to-many relation. A model that is never deleted needs no receiver.',
  },
  {
    tool: RULES_TOOL,
    rules: ['signal-receiver-never-connected'],
    describe: neverConnectedDescribe,
    allowed:
      'Import the module from `AppConfig.ready()` (`from . import signals`), or move the receivers into a module that the app already imports, such as `models.py`.',
  },
];
