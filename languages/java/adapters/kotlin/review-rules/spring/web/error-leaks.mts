import { isLoggerName } from '../../../../../source/loggers.mts';
import { annotationIn, typeName } from '../spring-names.mts';
import { entriesOf } from '../spring-scopes.mts';
import { EXCEPTION_HANDLER, PERSISTENCE_EXCEPTIONS } from '../spring-types.mts';
import type { ExceptionUse, FunctionFact, Reported, SpringView } from '../typed/spring-shapes.mts';

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
const TEXT = new Set<string | undefined>(['message', 'localizedMessage', 'toString']);
const CAUSES = new Set<string | undefined>(['cause', 'rootCause', 'mostSpecificCause']);
const FORMATTERS = new Set<string | undefined>(['valueOf', 'toString', 'format', 'formatted']);
const RECEIVER_ROOT = /^[\w$]+/u;

function generic(view: SpringView, type: string | undefined): boolean {
  return view
    .resolve(typeName(type))
    .some((name) => GENERIC.has(name) || LIBRARY.some((pattern) => pattern.test(name)));
}

function logged(use: ExceptionUse): boolean {
  return use.calls.some(({ receiver }) => {
    const root = RECEIVER_ROOT.exec(receiver ?? '')?.[0];
    return root !== undefined && isLoggerName(root);
  });
}

function leakForm(use: ExceptionUse, isGeneric: boolean): boolean {
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

function localUses(uses: ExceptionUse[], local: string): ExceptionUse[] {
  return uses.filter((use) => !use.parameter && use.name === local);
}

function handlerLeaks(view: SpringView, fn: FunctionFact, uses: ExceptionUse[]): Reported[] {
  const types = new Map(
    fn.parameters.map(({ name, type }): [string, boolean] => [name, generic(view, type)]),
  );
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

function errorLeaks(view: SpringView): Reported[] {
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
