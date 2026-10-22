import { isLoggerName } from '../../../../../source/loggers.mjs';
import { annotationIn, typeName } from '../spring-names.mjs';
import { entriesOf } from '../spring-scopes.mjs';
import { EXCEPTION_HANDLER, PERSISTENCE_EXCEPTIONS } from '../spring-types.mjs';

const GENERIC = new Set(
  [
    'Exception',
    'Throwable',
    'RuntimeException',
    'IllegalArgumentException',
    'IllegalStateException',
    'NullPointerException',
  ].flatMap((name) => [`kotlin.${name}`, `java.lang.${name}`]),
);
const LIBRARY = [
  /^java\.io\.\w*Exception$/u,
  /^java\.sql\.\w*Exception$/u,
  ...PERSISTENCE_EXCEPTIONS,
];
const STACK = new Set(['stackTrace', 'printStackTrace', 'stackTraceToString']);
const TEXT = new Set(['message', 'localizedMessage', 'toString']);
const CAUSES = new Set(['cause', 'rootCause', 'mostSpecificCause']);
const FORMATTERS = new Set(['valueOf', 'toString', 'format', 'formatted']);
const RECEIVER_ROOT = /^[\w$]+/u;

function generic(view, type) {
  return view
    .resolve(typeName(type))
    .some((name) => GENERIC.has(name) || LIBRARY.some((pattern) => pattern.test(name)));
}

function logged(use) {
  return use.calls.some(({ receiver }) => {
    const root = RECEIVER_ROOT.exec(receiver ?? '')?.[0];
    return root !== undefined && isLoggerName(root);
  });
}

function leakForm(use, isGeneric) {
  const [first, second] = use.path;
  if (use.path.some((step) => STACK.has(step))) {
    return true;
  }
  if (!isGeneric) {
    return false;
  }
  if (TEXT.has(first) || (CAUSES.has(first) && TEXT.has(second))) {
    return true;
  }
  return (
    use.path.length === 0 &&
    (use.context === 'template' ||
      use.context === 'concat' ||
      (use.context === 'argument' && FORMATTERS.has(use.argumentOf)))
  );
}

function localUses(uses, local) {
  return uses.filter((use) => !use.parameter && use.name === local);
}

function handlerLeaks(view, fn, uses) {
  const types = new Map(fn.parameters.map(({ name, type }) => [name, generic(view, type)]));
  return uses
    .filter((use) => use.parameter && leakForm(use, types.get(use.name) === true) && !logged(use))
    .filter(
      (use) =>
        use.local === undefined || localUses(uses, use.local).some((other) => !logged(other)),
    )
    .map((use) => ({
      rule: 'SpringNoErrorLeak',
      line: use.line,
      symbol: `${fn.owner}.${fn.name}.${use.name}`,
    }));
}

function errorLeaks(view) {
  return view.file.functions
    .filter((fn) => annotationIn(view.resolve, entriesOf(fn), EXCEPTION_HANDLER) !== undefined)
    .flatMap((fn) =>
      handlerLeaks(
        view,
        fn,
        view.file.exceptionUses.filter(({ scope }) => view.functionAt(scope) === fn),
      ),
    );
}

export const ERROR_LEAK_RULES = [errorLeaks];
