import { type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../analysis/constant-resolution.mts';
import {
  childCall,
  childStarts,
  envKeys,
  isCommand,
  staticArguments,
  staticText,
} from './child-calls.mts';
import { startsRepeatedly } from './repeated-starts.mts';

const JAVA_COMMAND = /(?:^|[/\\])java(?:\.exe)?$/;
const JAVA_NAMES = /^java(?:Path|Bin|Binary|Exe|Executable|Command|Cmd)?$/i;
const CEILINGS = ['-Xmx', '-XX:MaxRAMPercentage=', '-XX:MaxRAM='];
const GOALS = ['-XX:GCTimeRatio=', '-XX:SoftMaxHeapSize=', '-XX:MaxHeapFreeRatio='];
const OPTION_VARIABLES = ['JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', '_JAVA_OPTIONS'];

const JAVA = { path: JAVA_COMMAND, name: JAVA_NAMES };

function hasPrefix(flags: readonly string[], prefixes: readonly string[]): boolean {
  return flags.some((flag) => prefixes.some((prefix) => flag.startsWith(prefix)));
}

function ceilingWithoutGoal(flags: readonly string[]): boolean {
  return hasPrefix(flags, CEILINGS) && !hasPrefix(flags, GOALS);
}

function optionFlags(
  context: SourceContext,
  options: TSESTree.Node | undefined,
): readonly string[] {
  const keys = envKeys(context, options);
  if (keys === 'unknown') {
    return [];
  }
  return OPTION_VARIABLES.flatMap((name) =>
    (staticText(context, keys.get(name)) ?? '').split(/\s+/),
  );
}

function missesGoal(context: SourceContext, call: TSESTree.CallExpression): boolean {
  const { command, args, options } = childCall(context, call);
  const java = isCommand(context, command, JAVA);
  const argumentFlags = java && args !== undefined ? staticArguments(context, args) : [];
  return (
    argumentFlags !== undefined &&
    ceilingWithoutGoal([...optionFlags(context, options), ...argumentFlags])
  );
}

export const rule: TSESLint.RuleModule<'ceilingWithoutGoal'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require a heap goal next to the heap ceiling of JVMs started in a loop or pool',
    },
    schema: [],
    messages: {
      ceilingWithoutGoal:
        'This starts JVMs in a loop or pool with a heap ceiling (-Xmx or -XX:MaxRAMPercentage) but no goal that keeps the heap near its live data. A ceiling is not a size: with the default throughput goal each JVM grows its heap toward the ceiling instead of collecting, and does not give it back, so JVMs running at once together hold far more than their live data. Add -XX:GCTimeRatio=4 (or -XX:SoftMaxHeapSize with ZGC) next to the ceiling.',
    },
  },
  create(context) {
    return childStarts((node) => {
      if (missesGoal(context, node) && startsRepeatedly(context, node)) {
        context.report({ node, messageId: 'ceilingWithoutGoal' });
      }
    });
  },
};
