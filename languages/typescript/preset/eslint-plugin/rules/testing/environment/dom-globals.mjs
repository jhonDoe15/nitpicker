import globals from 'globals';

const PROVIDED_BY_NODE = new Set(
  ['node', 'nodeBuiltin', 'builtin', 'es2025'].flatMap((name) => Object.keys(globals[name] ?? {})),
);
const ONLY_BEHIND_A_FLAG_IN_NODE = ['localStorage', 'sessionStorage', 'Storage'];
const AMBIGUOUS_NAMES = new Set([
  'ai',
  'blur',
  'caches',
  'close',
  'closed',
  'event',
  'external',
  'fence',
  'find',
  'focus',
  'frames',
  'length',
  'menubar',
  'model',
  'name',
  'open',
  'opener',
  'origin',
  'parent',
  'print',
  'scroll',
  'self',
  'status',
  'stop',
  'toolbar',
  'top',
  'when',
]);
const EVENT_HANDLER_PROPERTY = /^on[a-z]+$/u;

function isDomOnly(name) {
  return (
    ONLY_BEHIND_A_FLAG_IN_NODE.includes(name) ||
    (!PROVIDED_BY_NODE.has(name) &&
      !AMBIGUOUS_NAMES.has(name) &&
      !EVENT_HANDLER_PROPERTY.test(name))
  );
}

export const DOM_GLOBAL_NAMES = new Set(Object.keys(globals.browser).filter(isDomOnly));
