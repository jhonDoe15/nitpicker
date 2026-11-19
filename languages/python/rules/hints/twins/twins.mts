import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const DIFFERENCES: Readonly<Record<string, (detail: string) => string>> = {
  parameter: (detail) => `takes the parameter \`${detail}\``,
  exception: (detail) => `catches \`${detail}\``,
  guard: (detail) => `returns or raises early when \`${detail}\``,
  call: (detail) => `calls \`${detail}()\``,
};

function describeTwins(subject: string): string {
  const [asynchronous = '', synchronous = '<sync twin>', kind = '', ...rest] = subject.split('|');
  const side = rest.pop() ?? 'async';
  const detail = rest.join('|') || '<difference>';
  const has = DIFFERENCES[kind]?.(detail) ?? detail;
  const lacking = side === 'sync' ? asynchronous : synchronous;
  return `\`${asynchronous}\` and \`${synchronous}\` are twins, but only the ${side} one ${has}: \`${lacking}\` does not, so sync and async callers get different results`;
}

export const TWIN_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['async-twin-drift'],
    describe: describeTwins,
    allowed:
      'Give both twins the same parameters, guards, caught exception types and calls, or move the shared behaviour into one function that both call (a sync helper for the logic, the async twin only awaiting the I/O). An exception fits only when the difference is intended and documented, such as an executor offload.',
  },
];
