import { takeOptionValue, unknownArgumentError } from '../../diff/comparison/cli.mjs';

export type ShowOptions = {
  readonly all: boolean;
  readonly details: boolean;
  readonly ruleFilters: readonly string[];
  readonly path?: string;
  readonly outputRoot?: string;
};

export const SHOW_USAGE =
  'Usage: nitpicker show [--all] [--rule <substring>]... [--path <file or folder>] [--details]' +
  ' [--output <dir>]';

const SHOW_OPTIONS = ['--all', '--rule', '--path', '--details', '--output', '--help'];

const unknown: (argument: string, candidates: readonly string[], guidance: string) => Error =
  unknownArgumentError;
const valueAfter: (remaining: Iterator<string>, argument: string) => string = takeOptionValue;

type Draft = {
  all: boolean;
  details: boolean;
  path?: string;
  outputRoot?: string;
  readonly ruleFilters: string[];
};

type Take = (draft: Draft, remaining: Iterator<string>, argument: string) => void;

const HANDLERS: Readonly<Record<string, Take>> = {
  '--all': (draft) => {
    draft.all = true;
  },
  '--details': (draft) => {
    draft.details = true;
  },
  '--rule': (draft, remaining, argument) => {
    draft.ruleFilters.push(valueAfter(remaining, argument));
  },
  '--path': (draft, remaining, argument) => {
    draft.path = valueAfter(remaining, argument);
  },
  '--output': (draft, remaining, argument) => {
    draft.outputRoot = valueAfter(remaining, argument);
  },
};

export function parseShowArguments(commandArguments: readonly string[]): ShowOptions {
  const draft: Draft = { all: false, details: false, ruleFilters: [] };
  const remaining = commandArguments.values();
  for (const argument of remaining) {
    const take = Object.hasOwn(HANDLERS, argument) ? HANDLERS[argument] : undefined;
    if (take === undefined) {
      throw unknown(argument, SHOW_OPTIONS, SHOW_USAGE);
    }
    take(draft, remaining, argument);
  }
  const { path, outputRoot, ...rest } = draft;
  return {
    ...rest,
    ...(path === undefined ? {} : { path }),
    ...(outputRoot === undefined ? {} : { outputRoot }),
  };
}
