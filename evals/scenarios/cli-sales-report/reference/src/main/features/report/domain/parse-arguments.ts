import type { Failure } from './sale.js';

type Option = 'input' | 'from' | 'to' | 'format';

type RawOptions = Readonly<Partial<Record<Option, string>>>;

export type ParsedArguments = { readonly kind: 'options'; readonly options: RawOptions } | Failure;

type State = {
  readonly pending: Option | undefined;
  readonly options: RawOptions;
  readonly failure: Failure | undefined;
};

const OPTIONS: readonly Option[] = ['input', 'from', 'to', 'format'];

const INITIAL: State = { pending: undefined, options: {}, failure: undefined };

function optionOf(token: string): Option | undefined {
  return OPTIONS.find((option) => `--${option}` === token);
}

function fail(state: State, message: string): State {
  return { ...state, failure: { kind: 'failure', messages: [message] } };
}

function step(state: State, token: string): State {
  if (state.failure !== undefined) {
    return state;
  }
  if (state.pending !== undefined) {
    return { ...state, pending: undefined, options: { ...state.options, [state.pending]: token } };
  }
  const option = optionOf(token);
  if (option === undefined) {
    return fail(state, `Unknown argument: ${token}`);
  }
  if (state.options[option] !== undefined) {
    return fail(state, `Duplicate option: ${token}`);
  }
  return { ...state, pending: option };
}

export function parseArguments(argv: readonly string[]): ParsedArguments {
  const state = argv.reduce(step, INITIAL);
  if (state.failure !== undefined) {
    return state.failure;
  }
  if (state.pending !== undefined) {
    return { kind: 'failure', messages: [`Missing value for --${state.pending}`] };
  }
  return { kind: 'options', options: state.options };
}
