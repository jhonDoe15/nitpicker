import { type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../analysis/constant-resolution.mts';
import {
  argumentTexts,
  childCall,
  childStarts,
  envKeys,
  isCommand,
  staticText,
} from './child-calls.mts';

const GO_TOOLS = /(?:^|[/\\])(?:tsgo|tsgolint|gopls)(?:\.exe)?$|@typescript\/native-preview/;
const GO_NAMES = /^(?:tsgo|tsgolint|gopls)(?:Path|Bin|Binary|Exe|Executable|Command)?$/i;
const TSC_PATHS = /(?:^|[/\\])tsc(?:\.exe)?$/;
const SHORT_RUNS = new Set(['--version', '-v', '--help', '-h', 'version', 'help']);
const COLLECTOR_KEYS = ['GOGC', 'GOMEMLIMIT'];

const GO = { path: GO_TOOLS, name: GO_NAMES };

function startsGoServer(context: SourceContext, call: TSESTree.CallExpression): boolean {
  const { command, args } = childCall(context, call);
  const texts = args === undefined ? [] : argumentTexts(context, args);
  if (texts.some((text) => SHORT_RUNS.has(text))) {
    return false;
  }
  const literal = staticText(context, command);
  const apiServer = texts.includes('--api') && (literal === undefined || TSC_PATHS.test(literal));
  return isCommand(context, command, GO) || apiServer;
}

export const rule: TSESLint.RuleModule<'noCollectorSetting'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require GOGC or GOMEMLIMIT when starting a long-running Go-built server or checker',
    },
    schema: [],
    messages: {
      noCollectorSetting:
        "This starts a Go-built server or checker (tsgo, the TypeScript 7 API server, tsgolint, gopls) without GOGC or GOMEMLIMIT in its environment. With Go's default GOGC=100 the heap grows to twice its live size before each collection, which is gigabytes for a server that keeps a whole program in memory. Pass `env: { ...process.env, GOGC: process.env.GOGC ?? '50' }` (or a GOMEMLIMIT).",
    },
  },
  create(context) {
    return childStarts((node) => {
      if (!startsGoServer(context, node)) {
        return;
      }
      const keys = envKeys(context, childCall(context, node).options);
      if (keys !== 'unknown' && !COLLECTOR_KEYS.some((key) => keys.has(key))) {
        context.report({ node, messageId: 'noCollectorSetting' });
      }
    });
  },
};
