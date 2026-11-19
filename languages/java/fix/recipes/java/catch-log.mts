import type { FixRecipe, RecipeFix } from '../../../../../core/fix/typed/fix-types.mts';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../../shared/paths/glob.mjs';
import { catchLogCalls as untypedCatchLogCalls } from '../../../source/catch-logging.mts';

type LoggerCall = {
  readonly index: number;
  readonly close: number;
  readonly level: string;
  readonly args: readonly string[];
};

type CaughtLog = { readonly caught: string; readonly call: LoggerCall };

const catchLogCalls: (
  code: string,
  language: string,
  options: { readonly reportedElsewhere: Set<number> },
) => readonly CaughtLog[] = untypedCatchLogCalls;

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;

const RULE = { tool: 'pmd', rule: 'CatchLogWithoutException' };
const JAVA_FILE = /\.java$/u;
const NO_THROWABLE_OVERLOAD = new Set(['warning', 'severe']);
const LEVEL_AND_MESSAGE = 2;

function lineAt(code: string, offset: number): number {
  return code.slice(0, offset).split('\n').length;
}

function endOfText(code: string, from: number): number {
  return code.slice(0, from).trimEnd().length;
}

function endsInComment(code: string, close: number): boolean {
  const before = code.slice(0, close).trimEnd();
  return before.endsWith('*/') || before.slice(before.lastIndexOf('\n') + 1).includes('//');
}

function wraps(args: readonly string[], caught: string): boolean {
  const wrapper = new RegExp(String.raw`\bnew\s+[\w.<>]+\s*\([^)]*\b${escapeRegExp(caught)}\b`);
  return args.some((argument) => wrapper.test(argument));
}

function appendable({ level, args }: LoggerCall, caught: string): boolean {
  if (level === 'log') {
    return args.length === LEVEL_AND_MESSAGE;
  }
  return args.length > 0 && !NO_THROWABLE_OVERLOAD.has(level) && !wraps(args, caught);
}

function planFile(path: string, text: string): readonly RecipeFix[] {
  return catchLogCalls(text, 'java', { reportedElsewhere: new Set() })
    .filter(({ call, caught }) => appendable(call, caught) && !endsInComment(text, call.close))
    .map(({ caught, call }) => {
      const at = endOfText(text, call.close);
      return {
        finding: { ...RULE, path, line: lineAt(text, call.index) },
        edits: [
          {
            type: 'replace',
            path,
            start: at,
            end: at,
            text: text[at - 1] === ',' ? ` ${caught},` : `, ${caught}`,
          },
        ],
      };
    });
}

export const javaCatchLogRecipe: FixRecipe = {
  id: 'java-catch-log-without-exception',
  rules: [RULE],
  presets: ['java'],
  scope: 'file',
  safety: 'safe',
  plan({ files }) {
    return {
      fixes: files
        .filter(({ path }) => JAVA_FILE.test(path))
        .flatMap(({ path, text }) => planFile(path, text)),
    };
  },
};
