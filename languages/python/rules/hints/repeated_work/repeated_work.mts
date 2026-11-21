import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

function constantLookupDescribe(subject = 'lookup|value'): string {
  const separator = subject.indexOf('|');
  const kind = separator === -1 ? 'lookup' : subject.slice(0, separator);
  const call = separator === -1 ? subject : subject.slice(separator + 1);
  if (kind === 'url') {
    return `\`${call}\` parses the same constant URL on every pass of this loop`;
  }
  return `\`${call}\` performs the same constant lookup on every pass of this loop`;
}

function subtreeSearchDescribe(subject = 'node|node.children'): string {
  const separator = subject.indexOf('|');
  const name = separator === -1 ? 'node' : subject.slice(0, separator);
  const search = separator === -1 ? subject : subject.slice(separator + 1);
  return `This loop climbs from \`${name}\` towards the root and runs \`${search}\` at every level, so one lookup costs depth times width, and near the root that is the whole tree`;
}

function repeatedCallDescribe(subject = 'call|lookup(key)'): string {
  const parts = subject.split('|');
  if (parts[0] === 'recursion') {
    const [, name = 'fn', ...rest] = parts;
    const call = rest.join('|') || `${name}(arg)`;
    return `\`${call}\` is called twice with the same arguments in one run of \`${name}\`, so every level of the recursion doubles the work and the cost grows exponentially with depth`;
  }
  const call = parts[0] === 'call' ? parts.slice(1).join('|') : subject;
  return `\`${call}\` runs twice: once to test the result and once more to use it, with nothing in between that could change the answer`;
}

function repeatedCallAllowed(subject = 'call|lookup(key)'): string {
  if (subject.startsWith('recursion|')) {
    return 'Call it once and keep the result in a local, or remember the answers per argument with `@functools.cache` or a `dict`.';
  }
  return 'Keep the first result in a local and use that (`found = lookup(key); if found is not None: ...`).';
}

export const REPEATED_WORK_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['constant-lookup-in-loop'],
    describe: constantLookupDescribe,
    allowed:
      'Look up or parse the constant value once at module scope or before the loop and reuse the result.',
  },
  {
    tool: RULES_TOOL,
    rules: ['subtree-search-per-ancestor'],
    describe: subtreeSearchDescribe,
    allowed:
      'Check the kind of the level first and search only the levels that can answer, or keep the answer per level in a `dict`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['repeated-call'],
    describe: repeatedCallDescribe,
    allowed: repeatedCallAllowed,
  },
  {
    tool: RULES_TOOL,
    rules: ['work-before-early-exit'],
    describe: (subject) =>
      `\`${subject}\` is worked out before the early exit on the next line, which leaves without reading it, so every call that takes the exit pays for it and throws it away`,
    allowed:
      'Move the assignment below the early exit; keep it above only if its error must be raised on that path too.',
  },
  {
    tool: RULES_TOOL,
    rules: ['read-all-before-pass'],
    describe: (subject) =>
      `Every input is read into \`${subject}\` before the one pass over it, so all of them sit in memory at once and peak memory grows with the number of inputs`,
    allowed:
      'Read and handle one input at a time (read, handle and drop each in one loop), use a bounded pool for parallel reads, or keep only what the pass needs from each input.',
  },
];
