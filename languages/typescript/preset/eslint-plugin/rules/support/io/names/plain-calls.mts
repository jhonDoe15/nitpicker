import type { CallView } from '../call-views.mts';
import { wordsOf as untypedWordsOf } from '../../../../../../../../shared/naming/secret-words.mjs';

const wordsOf: (name: string) => string[] = untypedWordsOf;

export const REPLACERS = new Set(['replace', 'replaceAll']);
export const STRING_STEPS = new Set([
  'trim',
  'trimStart',
  'trimEnd',
  'toLowerCase',
  'toUpperCase',
  'slice',
  'substring',
  'split',
  'concat',
  'padStart',
  'padEnd',
  'normalize',
]);
const SOCKETS = new Set(['connection', 'socket', 'ws', 'websocket', 'peer']);
const DRIVER_HELPERS = new Set(['createParameter', 'createGeneratedMap']);

function replacesText(view: CallView): boolean {
  const [pattern, replacement] = view.args;
  if (view.method === undefined || !REPLACERS.has(view.method)) {
    return false;
  }
  const textual = replacement?.type === 'text' || replacement?.type === 'function';
  return pattern?.type === 'pattern' || (view.textual && view.args.length === 2 && textual);
}

function sendsOverSocket(view: CallView): boolean {
  const owner = view.names.at(-2);
  return view.method === 'send' && owner !== undefined && SOCKETS.has(wordsOf(owner).at(-1) ?? '');
}

export function isPlainCall(view: CallView): boolean {
  const { method, names } = view;
  return (
    method !== undefined &&
    (DRIVER_HELPERS.has(method) ||
      replacesText(view) ||
      sendsOverSocket(view) ||
      STRING_STEPS.has(method))
  );
}
