import { escapeRegExp as untypedEscapeRegExp } from '../../../shared/paths/glob.mjs';
import { closingIndex } from './brackets.mts';
import { isFailureCall, logCalls, topLevelArguments, type LogCall } from './loggers.mts';

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;

export const CATCH_LOG_RULE = 'catch-log-without-exception';
export const CATCH_LOG_MESSAGE =
  'Pass the caught exception to the logger as its own argument so the stack trace is kept (log.error("what failed", e), or logger.error(e) { "what failed" }). e.message, e.toString() and a string template of the exception drop it.';

const CATCH = /\bcatch\s*\(([^()]*)\)\s*\{/g;
const CAUGHT_NAME: Record<string, RegExp> = { kotlin: /^\s*(\w+)\s*:/, java: /(\w+)\s*$/ };
const IGNORED_NAME = /^(?:_|ignore\w*|expected\w*|unused\w*)$/i;

type CatchBlock = { name: string; open: number; close: number };

function catchBlocks(code: string, language: string): CatchBlock[] {
  return [...code.matchAll(CATCH)].flatMap((match) => {
    const name = CAUGHT_NAME[language]?.exec(match[1] ?? '')?.[1];
    const open = match.index + match[0].length - 1;
    const close = closingIndex(code, open);
    return name === undefined || IGNORED_NAME.test(name) || close === -1
      ? []
      : [{ name, open, close }];
  });
}

function innermost(blocks: CatchBlock[], index: number): CatchBlock | undefined {
  return blocks
    .filter(({ open, close }) => index > open && index < close)
    .reduce<CatchBlock | undefined>(
      (best, block) => (best === undefined || block.open > best.open ? block : best),
      undefined,
    );
}

function isException(argument: string, name: string): boolean {
  const value = argument
    .replace(/^\w+\s*=\s*/, '')
    .replace(/^\(\s*[\w.<>?]+\s*\)\s*/, '')
    .replace(/\s+as\??\s+[\w.<>?]+$/, '')
    .trim();
  return value === name;
}

function passesException(call: LogCall, name: string): boolean {
  const cause = new RegExp(
    String.raw`\b(?:setCause|withThrowable|cause\s*=)\s*\(?\s*${escapeRegExp(name)}\b`,
  );
  return call.args.some((argument) => isException(argument, name)) || cause.test(call.text);
}

function thrownCauses(rest: string): string[] {
  const call = /^\s*(?:new\s+)?[\w.<>?]+\s*\(/.exec(rest);
  if (call === null) {
    return [/^\s*(\w+)/.exec(rest)?.[1] ?? ''];
  }
  const open = call[0].length - 1;
  return topLevelArguments(rest.slice(open + 1, closingIndex(rest, open)));
}

function rethrows(body: string, name: string): boolean {
  return [...body.matchAll(/\bthrow\b/g)].some((match) =>
    thrownCauses(body.slice(match.index + 'throw'.length)).some((argument) =>
      isException(argument, name),
    ),
  );
}

export type CatchLogOptions = { reportedElsewhere?: Set<number> };

export type CatchLogCall = {
  receiver: string;
  level: string;
  caught: string;
  call: LogCall;
};

export function catchLogCalls(
  code: string,
  language: string,
  options?: CatchLogOptions,
): CatchLogCall[] {
  const reportedElsewhere = options?.reportedElsewhere ?? new Set<number>();
  const blocks = catchBlocks(code, language);
  return logCalls(code)
    .filter(isFailureCall)
    .flatMap((call) => {
      const block = innermost(blocks, call.index);
      const handled =
        block === undefined ||
        reportedElsewhere.has(block.open) ||
        passesException(call, block.name) ||
        rethrows(code.slice(block.open, block.close), block.name);
      return handled
        ? []
        : [{ receiver: call.receiver, level: call.level, caught: block.name, call }];
    });
}

export function catchLogViolations(
  code: string,
  language: string,
  options?: CatchLogOptions,
): Omit<CatchLogCall, 'call'>[] {
  return catchLogCalls(code, language, options).map(({ call, ...violation }) => violation);
}
