import type { Annotation, ClassInfo, TestScanned } from '../../typed/discovery-types.mts';
import type { Keyed } from '../../typed/report-types.mts';
import { groupOf } from '../../typed/indexing.mts';

type Resolve = (name: string) => string;
import { chainName, classesOf } from '../../discovery/declarations.mts';
import { functionsOf } from '../../discovery/functions.mts';
import { importsOf } from '../../discovery/imports.mts';

const RETRY_ANNOTATIONS = new Set(['RetryingTest', 'RepeatedIfExceptionsTest']);
const RETRY_ANALYZERS = new Set(['IRetryAnalyzer', 'RetryAnalyzerCount']);
const RETRY_ANALYZER_ARGUMENT = /(?<![\w.`])retryAnalyzer\s*=/u;
const SET_RETRY_ANALYZER = /(?<![\w`])setRetryAnalyzer\s*\(/gu;
const FUNCTION_DECLARATION = /\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?$/u;
const ANNOTATION_GROUP = /@\[([^\]]*)\]/gu;
const WORD = /[A-Za-z_]\w*/gu;
const LOOKBEHIND = 80;

function resolver(scanned: TestScanned): Resolve {
  const { aliases } = importsOf(scanned);
  return (name) => aliases.get(name)?.target ?? name;
}

function retryingAnnotation(annotation: Annotation, resolve: Resolve): boolean {
  const name = resolve(annotation.name);
  return (
    RETRY_ANNOTATIONS.has(name) ||
    (name === 'Test' && RETRY_ANALYZER_ARGUMENT.test(annotation.args))
  );
}

function annotated(scanned: TestScanned, classes: ClassInfo[]): Keyed[] {
  const resolve = resolver(scanned);
  const entities = [
    ...classes.map((klass) => ({ ...klass, symbol: chainName(classes, klass.offset, klass.name) })),
    ...functionsOf(scanned).map((fn) => ({
      ...fn,
      symbol: chainName(classes, fn.offset, fn.name),
    })),
  ];
  return entities.flatMap(({ annotations, symbol }) =>
    annotations
      .filter((annotation) => retryingAnnotation(annotation, resolve))
      .map((annotation) => ({ symbol, offset: annotation.offset, key: `${symbol}:annotation` })),
  );
}

function groupedAnnotations(scanned: TestScanned, classes: ClassInfo[]): Keyed[] {
  const resolve = resolver(scanned);
  return [...scanned.code.matchAll(ANNOTATION_GROUP)]
    .filter((match) => {
      const group = groupOf(match, 1);
      const names = (group.match(WORD) ?? []).map(resolve);
      const testNg = names.includes('Test') && RETRY_ANALYZER_ARGUMENT.test(group);
      return testNg || names.some((name) => RETRY_ANNOTATIONS.has(name));
    })
    .map((match) => {
      const symbol = chainName(classes, match.index);
      return { symbol, offset: match.index, key: `${symbol}:annotation` };
    });
}

function analyzers(scanned: TestScanned, classes: ClassInfo[]): Keyed[] {
  const resolve = resolver(scanned);
  return classes
    .filter(({ supers }) => supers.some(({ name }) => RETRY_ANALYZERS.has(resolve(name))))
    .map((klass) => {
      const symbol = chainName(classes, klass.offset, klass.name);
      return { symbol, offset: klass.offset, key: `${symbol}:analyzer` };
    });
}

function analyzerCalls(scanned: TestScanned, classes: ClassInfo[]): Keyed[] {
  const { code } = scanned;
  return [...code.matchAll(SET_RETRY_ANALYZER)]
    .filter(
      (match) =>
        !FUNCTION_DECLARATION.test(code.slice(Math.max(0, match.index - LOOKBEHIND), match.index)),
    )
    .map((match) => {
      const symbol = chainName(classes, match.index);
      return { symbol, offset: match.index, key: `${symbol}:setRetryAnalyzer` };
    });
}

export function jvmRetries(scanned: TestScanned): Keyed[] {
  const classes = classesOf(scanned);
  return [
    ...annotated(scanned, classes),
    ...groupedAnnotations(scanned, classes),
    ...analyzers(scanned, classes),
    ...analyzerCalls(scanned, classes),
  ];
}
