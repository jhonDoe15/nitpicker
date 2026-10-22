import { callsIn, receiverName, walk } from '../../syntax/kotlin-calls.mjs';
import { operatorOf } from '../../syntax/expressions/kotlin-chains.mjs';
import { containsNode } from '../../syntax/expressions/kotlin-scope.mjs';
import { templateEntries } from '../../syntax/expressions/kotlin-strings.mjs';
import { typeMatches } from '../../syntax/kotlin-receivers.mjs';
import { kids, textOf } from '../../syntax/kotlin-tree.mjs';
import { EXCEPTION_HANDLER } from '../../names/spring-annotations.mjs';
import { LOGGERS } from '../../names/spring-clients.mjs';
import { ERROR_LEAK_EXCEPTIONS } from '../../names/spring-types.mjs';
import { defineRule, hasAnnotation, hitOn, memberSymbolOf } from '../rule-support.mjs';

const QUALIFIED = new Set(['DOT_QUALIFIED_EXPRESSION', 'SAFE_ACCESS_EXPRESSION']);
const CAUSES = new Set([
  'cause',
  'getCause',
  'rootCause',
  'getRootCause',
  'mostSpecificCause',
  'getMostSpecificCause',
]);
const TEXTS = new Set([
  'message',
  'localizedMessage',
  'getMessage',
  'getLocalizedMessage',
  'toString',
]);
const TRACES = new Set(['stackTrace', 'getStackTrace', 'printStackTrace']);
const FORMATTERS = new Set(['valueOf', 'toString', 'format', 'formatted']);
const LOGGER_NAMES = /^(?:log|logger|LOG|LOGGER)$/;

function selectorName(source, node) {
  const last = kids(node).at(-1);
  const callee = last?.t === 'CALL_EXPRESSION' ? kids(last)[0] : last;
  return callee?.t === 'REFERENCE_EXPRESSION' ? textOf(source, callee) : '';
}

function exceptionNames(file, declaration) {
  return new Set(
    declaration.params
      .filter((parameter) => typeMatches(file, parameter.type, ERROR_LEAK_EXCEPTIONS))
      .map((parameter) => parameter.name),
  );
}

function isException(source, names, node) {
  let current = node;
  while (QUALIFIED.has(current?.t) && CAUSES.has(selectorName(source, current))) {
    current = kids(current)[0];
  }
  return current?.t === 'REFERENCE_EXPRESSION' && names.has(textOf(source, current));
}

function leakKind(source, names, node) {
  if (QUALIFIED.has(node.t)) {
    const name = selectorName(source, node);
    if (TRACES.has(name)) {
      return name;
    }
    return TEXTS.has(name) && isException(source, names, kids(node)[0]) ? name : undefined;
  }
  if (node.t === 'BINARY_EXPRESSION' && operatorOf(source, node) === '+') {
    return kids(node).some((child) => isException(source, names, child)) ? 'plus' : undefined;
  }
  if (node.t === 'STRING_TEMPLATE') {
    return templateEntries(source, node).some(
      (entry) => entry.dynamic && isException(source, names, entry.expression),
    )
      ? 'template'
      : undefined;
  }
  return undefined;
}

function formatterKind(source, names, call) {
  return FORMATTERS.has(call.name) &&
    [...call.arguments.map((argument) => kids(argument)[0]), call.receiver].some((node) =>
      isException(source, names, node),
    )
    ? call.name
    : undefined;
}

function isLogger(file, context, call) {
  const name = receiverName(file.source, call.receiver);
  return (
    name !== undefined &&
    (LOGGER_NAMES.test(name) ||
      typeMatches(
        file,
        context.fn.params.find((parameter) => parameter.name === name)?.type ??
          context.owner?.properties.find((property) => property.name === name)?.type,
        LOGGERS,
      ))
  );
}

function leaksOf(file, declaration, names) {
  const source = file.source;
  const fromNodes = walk(declaration.body).flatMap(({ node, ancestors }) => {
    const kind = leakKind(source, names, node);
    return kind === undefined ? [] : [{ node, ancestors, kind }];
  });
  const fromCalls = callsIn(source, declaration.body).flatMap((call) => {
    const kind = formatterKind(source, names, call);
    return kind === undefined ? [] : [{ node: call.node, ancestors: call.ancestors, kind }];
  });
  return [...fromNodes, ...fromCalls];
}

function usesOutsideLogs({ file, declaration, loggers }, local) {
  return walk(declaration.body).some(
    ({ node }) =>
      node.t === 'REFERENCE_EXPRESSION' &&
      textOf(file.source, node) === local &&
      !loggers.some((call) => containsNode(call.node, node)),
  );
}

function localNameOf(file, leak) {
  const parent = leak.ancestors.at(-1);
  const identifier = parent?.t === 'PROPERTY' ? kids(parent, 'IDENTIFIER')[0] : undefined;
  return identifier === undefined ? undefined : textOf(file.source, identifier);
}

const errorLeak = defineRule(
  'SpringNoErrorLeak',
  'Log the exception and return a ProblemDetail with a fixed detail from this @ExceptionHandler. The message or stack trace of a generic, JDK or persistence exception exposes internals; messages of your own exception types are fine.',
  (file) =>
    file.functions
      .filter((declaration) => declaration.body !== undefined)
      .filter((declaration) => hasAnnotation(file, declaration, EXCEPTION_HANDLER))
      .flatMap((declaration) => {
        const names = exceptionNames(file, declaration);
        const context = { fn: declaration, owner: declaration.owner };
        const loggers = callsIn(file.source, declaration.body).filter((call) =>
          isLogger(file, context, call),
        );
        return leaksOf(file, declaration, names)
          .filter((leak) => !loggers.some((call) => containsNode(call.node, leak.node)))
          .filter((leak) => {
            const local = localNameOf(file, leak);
            return local === undefined || usesOutsideLogs({ file, declaration, loggers }, local);
          })
          .map((leak) => hitOn(leak.node, `${memberSymbolOf(declaration)}@${leak.kind}`));
      }),
);

export const ERROR_LEAK_RULES = [errorLeak];
