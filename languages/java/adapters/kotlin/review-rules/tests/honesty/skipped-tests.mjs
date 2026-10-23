import { testBodies } from '../discovery/test-units.mjs';
import {
  conditionIndex,
  conditionValue,
  constantBoolean,
  disablesByConfig,
} from './skip-constants.mjs';

export const DISABLED_RULE = 'DisabledTest';
export const DISABLED_MESSAGE =
  'Fix or delete this test instead of disabling it: @Disabled, @Ignore, @Ignored (also through an alias or an annotation that carries them), an x-prefixed Kotest name (xtest, xcontext, xdescribe, xit, xshould, xgiven), a "!" name prefix, `.config(enabled = false)`, a condition that is always false and an assumption that is always false all skip it while the build stays green, so nothing shows that the behavior it covered is unchecked. Delete the test when the behavior is gone; to run it only where it can run, use a condition on the environment (`@EnabledOnOs`, `@EnabledIfSystemProperty`, an assumption on a real condition). An exception fits only a test that is skipped on purpose until a tracked defect is fixed.';

const ENABLED_ASSIGNMENT = /\benabled\s*=\s*([^,)\n]+)/u;
const CONDITIONAL_ANNOTATIONS = new Set(['EnabledIf', 'DisabledIf']);
const CONSTANT_ASSUMPTION =
  /(?<![\w`])(?:(?:Assumptions|Assume)\s*\.\s*)?(?:assumeTrue\s*\(\s*false|assumeFalse\s*\(\s*true)\s*[,)]|(?<![\w`])Assumptions\s*\.\s*abort\s*(?:<[^<>]*>\s*)?\(/u;

function chainFor(suite, klass) {
  const outer = suite.ancestors.filter((ancestor) => ancestor.bodyOpen < klass.offset);
  return [klass, ...outer.toReversed()];
}

function disablesByCondition({ name, args }, context) {
  if (!CONDITIONAL_ANNOTATIONS.has(name)) {
    return false;
  }
  const value = conditionValue(args, context);
  return name === 'EnabledIf' ? value === false : value === true;
}

function disablesByAnnotation(annotation, context) {
  const assigned = ENABLED_ASSIGNMENT.exec(annotation.args)?.[1];
  const testOff =
    annotation.name === 'Test' &&
    assigned !== undefined &&
    constantBoolean(assigned, context.constants) === false;
  return context.names.has(annotation.name) || testOff || disablesByCondition(annotation, context);
}

function skipOffset(entity, context) {
  const annotation = entity.annotations.find((candidate) =>
    disablesByAnnotation(candidate, context),
  );
  if (annotation !== undefined) {
    return annotation.offset;
  }
  const byName =
    (entity.configs ?? []).some((config) => disablesByConfig(config, context.constants)) ||
    entity.prefix === 'x' ||
    entity.name?.startsWith('!') === true;
  return byName ? entity.offset : undefined;
}

function skippedNodes(suite, context) {
  const nodeContext = { ...context, chain: chainFor(suite, suite.klass) };
  const skipped = suite.nodes.flatMap((node) => {
    const offset = skipOffset(node, nodeContext);
    return offset === undefined ? [] : [{ node, offset }];
  });
  const marked = new Set(skipped.map(({ node }) => node.offset));
  return skipped
    .filter(({ node }) => !node.ancestors.some((ancestor) => marked.has(ancestor)))
    .map(({ node, offset }) => ({ symbol: node.symbol, offset, key: node.symbol }));
}

function skippedClass(suite, context) {
  const chain = [...suite.ancestors, suite.klass];
  const offsets = chain.map((klass) =>
    skipOffset({ annotations: klass.annotations }, { ...context, chain: chainFor(suite, klass) }),
  );
  const index = offsets.findIndex((offset) => offset !== undefined);
  const names = chain.slice(0, index + 1).map(({ name }) => name);
  return index < 0
    ? undefined
    : { symbol: names.join('.'), offset: offsets[index], key: names.join('.') };
}

function assumptionSkips(scanned, suites) {
  return testBodies(scanned, suites).flatMap((test) => {
    const found = CONSTANT_ASSUMPTION.exec(scanned.code.slice(test.body.start, test.body.end));
    return found === null
      ? []
      : [
          {
            symbol: test.symbol,
            offset: test.body.start + found.index,
            key: `${test.symbol}:assumption`,
          },
        ];
  });
}

export function skippedTests(scanned, suites, project) {
  const base = {
    index: conditionIndex(scanned),
    names: project.disabling,
    constants: project.constants,
  };
  const found = suites.flatMap((suite) => {
    const skipped = skippedClass(suite, base);
    return skipped === undefined ? skippedNodes(suite, base) : [skipped];
  });
  return [
    ...new Map(
      [...found, ...assumptionSkips(scanned, suites)].map((entry) => [entry.offset, entry]),
    ).values(),
  ];
}
