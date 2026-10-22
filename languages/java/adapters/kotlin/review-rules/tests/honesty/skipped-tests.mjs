import { functionsOf, classesOf } from '../discovery/declarations.mjs';

export const DISABLED_RULE = 'DisabledTest';
export const DISABLED_MESSAGE =
  'Fix or delete this test instead of disabling it: @Disabled, @Ignore, an x-prefixed Kotest name (xtest, xcontext, xdescribe, xit, xshould, xgiven), a "!" name prefix, `.config(enabled = false)` and a condition that is always false all skip it while the build stays green, so nothing shows that the behavior it covered is unchecked. Delete the test when the behavior is gone; to run it only where it can run, use a condition on the environment (`@EnabledOnOs`, `@EnabledIfSystemProperty`, an assumption). An exception fits only a test that is skipped on purpose until a tracked defect is fixed.';

const DISABLING_ANNOTATIONS = new Set(['Disabled', 'Ignore', 'Ignored']);
const ENABLED_FALSE = /\benabled\s*=\s*false\b/u;
const POSITIONAL_FALSE = /^\s*false\s*(?:,|$)/u;
const ENABLED_IF_FALSE = /\benabledIf\s*=\s*\{\s*(?:\w+\s*->\s*)?false\s*\}/u;
const CONSTANT_BODY = /^(?:return\s+)?(true|false)$/u;
const CONSTANT_TEXT = /^(?:#\{\s*)?(true|false)(?:\s*\})?$/u;
const STRING_ARGUMENT = /"([^"]*)"/u;
const CLASS_ARGUMENT = /([\w.]+)::class/u;
const CONDITIONAL_ANNOTATIONS = new Set(['EnabledIf', 'DisabledIf']);

function bodyConstant(text) {
  const value = CONSTANT_BODY.exec(text.trim())?.[1];
  return value === undefined ? undefined : value === 'true';
}

export function constantsOf(scanned) {
  const functions = functionsOf(scanned).map((fn) => ({
    ...fn,
    value: bodyConstant(scanned.code.slice(fn.body.start, fn.body.end)),
  }));
  const constant = functions.filter(({ value }) => value !== undefined);
  const methods = new Map(constant.map(({ name, value }) => [name, value]));
  const classes = new Map(
    classesOf(scanned).flatMap((klass) => {
      const inside = constant.find(
        ({ offset }) => klass.bodyOpen >= 0 && offset > klass.bodyOpen && offset < klass.bodyClose,
      );
      return inside === undefined ? [] : [[klass.name, inside.value]];
    }),
  );
  return { methods, classes };
}

function conditionValue(args, constants) {
  const text = STRING_ARGUMENT.exec(args)?.[1];
  if (text !== undefined) {
    const literal = CONSTANT_TEXT.exec(text.trim());
    return literal === null ? constants.methods.get(text) : literal[1] === 'true';
  }
  const klass = CLASS_ARGUMENT.exec(args)?.[1];
  return klass === undefined ? undefined : constants.classes.get(klass.split('.').at(-1));
}

function disablesByCondition({ name, args }, constants) {
  if (!CONDITIONAL_ANNOTATIONS.has(name)) {
    return false;
  }
  const value = conditionValue(args, constants);
  return name === 'EnabledIf' ? value === false : value === true;
}

function disablesByAnnotation(annotation, constants) {
  return (
    DISABLING_ANNOTATIONS.has(annotation.name) ||
    (annotation.name === 'Test' && ENABLED_FALSE.test(annotation.args)) ||
    disablesByCondition(annotation, constants)
  );
}

function disablesByConfig(config) {
  return (
    ENABLED_FALSE.test(config) || POSITIONAL_FALSE.test(config) || ENABLED_IF_FALSE.test(config)
  );
}

function skipOffset(entity, constants) {
  const annotation = entity.annotations.find((candidate) =>
    disablesByAnnotation(candidate, constants),
  );
  if (annotation !== undefined) {
    return annotation.offset;
  }
  const byName =
    (entity.configs ?? []).some(disablesByConfig) ||
    entity.prefix === 'x' ||
    entity.name?.startsWith('!') === true;
  return byName ? entity.offset : undefined;
}

function skippedNodes(nodes, constants) {
  const skipped = nodes.flatMap((node) => {
    const offset = skipOffset(node, constants);
    return offset === undefined ? [] : [{ node, offset }];
  });
  const marked = new Set(skipped.map(({ node }) => node.offset));
  return skipped
    .filter(({ node }) => !node.ancestors.some((ancestor) => marked.has(ancestor)))
    .map(({ node, offset }) => ({ symbol: node.symbol, offset }));
}

function skippedClass(suite, constants) {
  const chain = [...suite.ancestors, suite.klass];
  const offsets = chain.map((klass) => skipOffset({ annotations: klass.annotations }, constants));
  const index = offsets.findIndex((offset) => offset !== undefined);
  const names = chain.slice(0, index + 1).map(({ name }) => name);
  return index < 0 ? undefined : { symbol: names.join('.'), offset: offsets[index] };
}

export function skippedTests(suites, constants) {
  const found = suites.flatMap((suite) => {
    const skipped = skippedClass(suite, constants);
    return skipped === undefined ? skippedNodes(suite.nodes, constants) : [skipped];
  });
  return [...new Map(found.map((entry) => [entry.offset, entry])).values()];
}
